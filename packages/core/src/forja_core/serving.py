"""Publication of Silver tables: serving database for BI tools and file exports.

Both outputs contain only treated data (see :mod:`forja_core.privacy`) and no
technical columns. The serving database is rebuilt in a temporary file and moved
into place, so a BI tool never reads a half-written file.
"""

from __future__ import annotations

import uuid
from collections.abc import Callable, Iterator
from dataclasses import dataclass
from pathlib import Path

import duckdb
import pyarrow as pa
import pyarrow.csv as pacsv
import pyarrow.parquet as pq

from forja_core.catalog import Catalog
from forja_core.config import Settings
from forja_core.errors import ConflictError, ForjaError
from forja_core.jobs.models import ExportedFile, ExportFormat
from forja_core.locks import WarehouseLocks
from forja_core.logging import get_logger
from forja_core.models import Project
from forja_core.privacy import ProjectSecrets, published_columns, select_sql, treat_batch
from forja_core.silver.dbt.project import DbtProjectGenerator
from forja_core.silver.plan import ColumnPlan, TransformationPlan
from forja_core.silver.tables import SilverTable
from forja_core.storage import Workspace
from forja_core.utils import quote_ident, slugify, sql_literal, utcnow

log = get_logger(__name__)

BATCH_ROWS = 50_000
METADATA_TABLE = "_forja_tables"


class ServingInUseError(ConflictError):
    code = "serving_in_use"


@dataclass(frozen=True)
class PublishedTable:
    table: SilverTable
    plan: TransformationPlan
    columns: list[ColumnPlan]

    @property
    def name(self) -> str:
        """Business-facing name: the source name, without the stg_ prefix."""
        return self.plan.source_name


class Publisher:
    def __init__(
        self,
        catalog: Catalog,
        workspace: Workspace,
        settings: Settings,
        generator: DbtProjectGenerator,
        locks: WarehouseLocks,
    ) -> None:
        self.catalog = catalog
        self.workspace = workspace
        self.settings = settings
        self.generator = generator
        self.locks = locks
        self.secrets = ProjectSecrets(settings.secrets_dir)

    def serving_path(self, project: Project) -> Path:
        directory = self.workspace.project_dir(project.id) / "serving"
        return directory / f"{slugify(project.name, default='project')}.duckdb"

    def exports_dir(self, project_id: str) -> Path:
        return self.workspace.project_dir(project_id) / "exports"

    def _published(self, table: SilverTable) -> PublishedTable:
        """Columns of the built table, with the treatments of the current effective plan.

        Treatments only concern published data, so a change approved since the last
        build applies immediately, without rebuilding Silver.
        """
        built = self.catalog.get_plan(table.source_id, version=table.plan_version)
        effective = self.catalog.effective_plan(table.source_id) or built
        treatments = {c.source_column: c.pii_treatment for c in effective.columns}
        plan = built.model_copy(deep=True)
        for column in plan.columns:
            column.pii_treatment = treatments.get(column.source_column, column.pii_treatment)
        columns = published_columns(plan, (c.name for c in table.columns))
        return PublishedTable(table=table, plan=plan, columns=columns)

    def _batches(
        self, con: duckdb.DuckDBPyConnection, item: PublishedTable, salt: bytes
    ) -> Iterator[pa.RecordBatch]:
        relation = f"wh.main.{quote_ident(item.table.name)}"
        # A dedicated cursor: the connection itself keeps writing while batches stream.
        with con.cursor() as cursor:
            reader = cursor.sql(select_sql(item.columns, relation)).to_arrow_reader(BATCH_ROWS)
            for batch in reader:
                yield treat_batch(batch, item.columns, salt)

    def _attach_warehouse(self, con: duckdb.DuckDBPyConnection, project_id: str) -> None:
        warehouse = self.generator.warehouse_path(project_id)
        if not warehouse.exists():
            raise ForjaError("no Silver table has been built yet: run build_silver first")
        con.execute(f"ATTACH {sql_literal(str(warehouse))} AS wh (READ_ONLY)")

    def publish(self, project_id: str, log_line: Callable[[str], None]) -> Path:
        """Rebuild the serving database with every built Silver table."""
        project = self.catalog.get_project(project_id)
        tables = [self._published(t) for t in self.catalog.list_tables(project_id)]
        if not tables:
            raise ForjaError("no Silver table has been built yet: run build_silver first")
        target = self.serving_path(project)
        target.parent.mkdir(parents=True, exist_ok=True)
        staging = target.with_name(f".{target.stem}.{uuid.uuid4().hex}.tmp.duckdb")
        salt = self.secrets.salt(project_id)

        try:
            with self.locks.hold(project_id), duckdb.connect(str(staging)) as con:
                self._attach_warehouse(con, project_id)
                con.execute(
                    f"CREATE TABLE {METADATA_TABLE} (table_name VARCHAR, source VARCHAR, "
                    "plan_version INTEGER, row_count BIGINT, treated_columns VARCHAR, "
                    "published_at TIMESTAMP)"
                )
                for item in tables:
                    rows = self._write_table(con, item, salt)
                    treated = ", ".join(
                        f"{c.target_column}:{c.pii_treatment.value}"
                        for c in item.plan.included_columns()
                        if c.pii_treatment.value != "none"
                    )
                    con.execute(
                        f"INSERT INTO {METADATA_TABLE} VALUES (?, ?, ?, ?, ?, ?)",
                        [
                            item.name,
                            item.plan.source_name,
                            item.plan.version,
                            rows,
                            treated,
                            utcnow().replace(tzinfo=None),
                        ],
                    )
                    log_line(f"serving: {item.name} published ({rows} rows)")
                con.execute("DETACH wh")
            try:
                staging.replace(target)
            except PermissionError as exc:
                raise ServingInUseError(
                    f"{target.name} is open in another program (a BI tool?): close it and retry",
                    details={"path": str(target)},
                ) from exc
        finally:
            staging.unlink(missing_ok=True)
            staging.with_name(staging.name + ".wal").unlink(missing_ok=True)
        log.info("serving_published", project_id=project_id, tables=len(tables))
        return target

    def _write_table(
        self, con: duckdb.DuckDBPyConnection, item: PublishedTable, salt: bytes
    ) -> int:
        name = quote_ident(item.name)
        rows = 0
        created = False
        for batch in self._batches(con, item, salt):
            con.register("forja_batch", batch)
            if created:
                con.execute(f"INSERT INTO {name} SELECT * FROM forja_batch")
            else:
                con.execute(f"CREATE TABLE {name} AS SELECT * FROM forja_batch")
                created = True
            con.unregister("forja_batch")
            rows += batch.num_rows
        if not created:
            columns = ", ".join(f"{quote_ident(c.target_column)} VARCHAR" for c in item.columns)
            con.execute(f"CREATE TABLE {name} ({columns})")
        return rows

    def export(
        self,
        table: SilverTable,
        fmt: ExportFormat,
        target: Path,
        *,
        delimiter: str | None = None,
    ) -> ExportedFile:
        """Write one treated Silver table to ``target`` as Parquet or CSV (UTF-8)."""
        item = self._published(table)
        salt = self.secrets.salt(table.project_id)
        target.parent.mkdir(parents=True, exist_ok=True)
        separator = delimiter or self.settings.export_csv_delimiter
        rows = 0
        with (
            self.locks.hold(table.project_id, timeout=self.settings.export_lock_timeout_seconds),
            duckdb.connect() as con,
        ):
            self._attach_warehouse(con, table.project_id)
            batches = self._batches(con, item, salt)
            first = next(batches, None)
            schema = first.schema if first is not None else _empty_schema(item.columns)
            if fmt is ExportFormat.PARQUET:
                with pq.ParquetWriter(target, schema, compression="zstd") as writer:
                    for batch in _chain(first, batches):
                        writer.write_batch(batch)
                        rows += batch.num_rows
            else:
                options = pacsv.WriteOptions(include_header=True, delimiter=separator)
                with pacsv.CSVWriter(target, schema, write_options=options) as csv_writer:
                    for batch in _chain(first, batches):
                        csv_writer.write_batch(batch)
                        rows += batch.num_rows
        return ExportedFile(table=item.name, format=fmt, path=str(target), rows=rows)

    def export_all(
        self,
        project_id: str,
        formats: list[ExportFormat],
        delimiter: str | None,
        log_line: Callable[[str], None],
    ) -> list[ExportedFile]:
        exported: list[ExportedFile] = []
        directory = self.exports_dir(project_id)
        for table in self.catalog.list_tables(project_id):
            name = self._published(table).name
            for fmt in formats:
                result = self.export(
                    table, fmt, directory / f"{name}.{fmt.value}", delimiter=delimiter
                )
                log_line(f"export: {result.path} ({result.rows} rows)")
                exported.append(
                    result.model_copy(update={"path": self.workspace.relative(Path(result.path))})
                )
        return exported


def _chain(
    first: pa.RecordBatch | None, rest: Iterator[pa.RecordBatch]
) -> Iterator[pa.RecordBatch]:
    if first is not None:
        yield first
    yield from rest


def _empty_schema(columns: list[ColumnPlan]) -> pa.Schema:
    return pa.schema([(c.target_column, pa.string()) for c in columns])
