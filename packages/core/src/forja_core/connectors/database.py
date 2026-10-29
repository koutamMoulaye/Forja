"""PostgreSQL, MySQL/MariaDB and SQL Server through SQLAlchemy (see docs/decisions.md).

Forja only reads. Table and column names come from the database's own catalog
(introspection), never from free text, and SQLAlchemy always quotes them with the
dialect's rules; values (the incremental cursor) are bound parameters. Sessions are
opened read-only where the database allows it, on top of the recommended read-only
account. Rows are streamed with a server-side cursor and converted to Arrow batches,
so a table of any size never sits whole in memory.
"""

from __future__ import annotations

import datetime as dt
import decimal
import json
import re
import time
import uuid
from collections.abc import Iterator
from dataclasses import dataclass, field
from typing import Any

import pyarrow as pa
import sqlalchemy as sa
from sqlalchemy.engine import URL, Engine
from sqlalchemy.pool import NullPool
from sqlalchemy.sql.elements import quoted_name

from forja_core.connectors.models import (
    DEFAULT_PORTS,
    ConnectionTest,
    ConnectionType,
    CursorCandidate,
    DatabaseColumn,
    DatabaseExploration,
    DatabaseParams,
    DatabaseTable,
)
from forja_core.connectors.vault import redact
from forja_core.errors import ForjaError, NotFoundError
from forja_core.logging import get_logger
from forja_core.utils import utcnow

log = get_logger(__name__)

_DRIVERS = {
    ConnectionType.POSTGRES: "postgresql+psycopg",
    ConnectionType.MYSQL: "mysql+pymysql",
    ConnectionType.SQLSERVER: "mssql+pymssql",
}
_SYSTEM_SCHEMAS = {
    "information_schema",
    "pg_catalog",
    "pg_toast",
    "mysql",
    "performance_schema",
    "sys",
    "guest",
    "db_owner",
    "db_accessadmin",
    "db_securityadmin",
    "db_ddladmin",
    "db_backupoperator",
    "db_datareader",
    "db_datawriter",
    "db_denydatareader",
    "db_denydatawriter",
}
CONNECT_TIMEOUT_SECONDS = 10
MAX_TABLES = 2000

# Fixed catalog queries giving the estimated row count of every table.
_ROW_ESTIMATES = {
    ConnectionType.POSTGRES: (
        "SELECT n.nspname, c.relname, CAST(c.reltuples AS BIGINT) FROM pg_class c "
        "JOIN pg_namespace n ON n.oid = c.relnamespace WHERE c.relkind IN ('r', 'p', 'm')"
    ),
    ConnectionType.MYSQL: (
        "SELECT table_schema, table_name, table_rows FROM information_schema.tables "
        "WHERE table_schema = DATABASE()"
    ),
    ConnectionType.SQLSERVER: (
        "SELECT s.name, t.name, SUM(p.rows) FROM sys.tables t "
        "JOIN sys.schemas s ON s.schema_id = t.schema_id "
        "JOIN sys.partitions p ON p.object_id = t.object_id AND p.index_id IN (0, 1) "
        "GROUP BY s.name, t.name"
    ),
}
_VERSION_QUERIES = {
    ConnectionType.POSTGRES: "SELECT version()",
    ConnectionType.MYSQL: "SELECT version()",
    ConnectionType.SQLSERVER: "SELECT @@VERSION",
}
# Whether the account may write: privileges granted on tables of the database.
_WRITE_PRIVILEGES = {
    ConnectionType.POSTGRES: (
        "SELECT count(*) FROM information_schema.role_table_grants WHERE grantee = current_user "
        "AND privilege_type IN ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE')"
    ),
    ConnectionType.MYSQL: (
        "SELECT count(*) FROM information_schema.user_privileges "
        "WHERE grantee = concat('''', substring_index(current_user(), '@', 1), '''@''', "
        "substring_index(current_user(), '@', -1), '''') "
        "AND privilege_type IN ('INSERT', 'UPDATE', 'DELETE', 'DROP', 'ALTER', 'CREATE')"
    ),
    ConnectionType.SQLSERVER: (
        "SELECT count(*) FROM fn_my_permissions(NULL, 'DATABASE') "
        "WHERE permission_name IN ('INSERT', 'UPDATE', 'DELETE', 'ALTER', 'CONTROL')"
    ),
}

_UPDATED = re.compile(
    r"^(updated|modified|last_?modified|last_?update[d]?|date_?(de_?)?(maj|modification)|"
    r"maj|changed|row_?version|sys_?modified)(_?(at|on|date|time|ts|le))?$",
    re.IGNORECASE,
)
_CREATED = re.compile(
    r"^(created|inserted|creation|date_?(de_?)?creation)(_?(at|on|date|time|ts|le))?$",
    re.IGNORECASE,
)


class DatabaseError(ForjaError):
    code = "database_error"


class DatabaseObjectNotFoundError(NotFoundError):
    code = "database_object_not_found"


@dataclass
class CursorState:
    """Highest cursor value seen while streaming (incremental loads)."""

    column: str | None
    value: Any = None
    rows: int = 0
    batches: int = 0
    seen: bool = field(default=False)

    def observe(self, values: list[Any]) -> None:
        for value in values:
            if value is None:
                continue
            if not self.seen or value > self.value:
                self.value = value
                self.seen = True


def engine_for(kind: ConnectionType, params: DatabaseParams, password: str | None) -> Engine:
    url = URL.create(
        _DRIVERS[kind],
        username=params.username,
        password=password,
        host=params.host,
        port=params.port or DEFAULT_PORTS[kind],
        database=params.database,
    )
    connect_args: dict[str, Any]
    if kind is ConnectionType.POSTGRES:
        connect_args = {
            "connect_timeout": CONNECT_TIMEOUT_SECONDS,
            "sslmode": params.ssl,
            "application_name": "forja",
            # Every transaction is read-only, whatever the account may do.
            "options": "-c default_transaction_read_only=on",
        }
    elif kind is ConnectionType.MYSQL:
        connect_args = {
            "connect_timeout": CONNECT_TIMEOUT_SECONDS,
            "read_timeout": 3600,
            "charset": "utf8mb4",
            "init_command": "SET SESSION TRANSACTION READ ONLY",
        }
        if params.ssl == "require":
            connect_args["ssl"] = {"check_hostname": False}
    else:
        connect_args = {
            "login_timeout": CONNECT_TIMEOUT_SECONDS,
            "appname": "forja",
            "charset": "UTF-8",
        }
    return sa.create_engine(url, poolclass=NullPool, connect_args=connect_args)


def _failure(exc: Exception, password: str | None) -> DatabaseError:
    original = getattr(exc, "orig", None) or exc
    message = " ".join(str(original).split())
    message = redact(message, [password] if password else [])
    return DatabaseError(f"the database answered: {message[:500]}")


def test_connection(
    kind: ConnectionType, params: DatabaseParams, password: str | None
) -> ConnectionTest:
    started = time.perf_counter()
    engine = engine_for(kind, params, password)
    try:
        with engine.connect() as con:
            version = str(con.execute(sa.text(_VERSION_QUERIES[kind])).scalar() or "")
            try:
                writable = int(con.execute(sa.text(_WRITE_PRIVILEGES[kind])).scalar() or 0)
                read_only: bool | None = writable == 0
            except sa.exc.SQLAlchemyError:
                read_only = None
        return ConnectionTest(
            ok=True,
            message="Connexion réussie.",
            duration_ms=round((time.perf_counter() - started) * 1000),
            tested_at=utcnow(),
            server_version=version.splitlines()[0][:200] if version else None,
            read_only=read_only,
        )
    except sa.exc.SQLAlchemyError as exc:
        return ConnectionTest(
            ok=False,
            message=_failure(exc, password).message,
            duration_ms=round((time.perf_counter() - started) * 1000),
            tested_at=utcnow(),
        )
    finally:
        engine.dispose()


def arrow_type(column_type: sa.types.TypeEngine[Any]) -> pa.DataType:
    """Bronze type of a database column (docs/connectors.md has the full table)."""
    name = type(column_type).__name__.upper()
    if isinstance(column_type, sa.Boolean) or name == "BIT":
        return pa.bool_()
    if isinstance(column_type, sa.Integer):
        return pa.int64()
    if (isinstance(column_type, sa.Float) and not isinstance(column_type, sa.Numeric)) or name in (
        "REAL",
        "DOUBLE",
        "DOUBLE_PRECISION",
        "FLOAT",
    ):
        return pa.float64()
    if isinstance(column_type, sa.Numeric):
        precision = getattr(column_type, "precision", None)
        scale = getattr(column_type, "scale", None) or 0
        if isinstance(column_type, sa.Float) or getattr(column_type, "asdecimal", True) is False:
            return pa.float64()
        if precision is not None and 0 < precision <= 38 and 0 <= scale <= precision:
            return pa.decimal128(precision, scale)
        return pa.string()
    if isinstance(column_type, sa.DateTime):
        if getattr(column_type, "timezone", False) or name in ("DATETIMEOFFSET", "TIMESTAMPTZ"):
            return pa.timestamp("us", tz="UTC")
        return pa.timestamp("us")
    if isinstance(column_type, sa.Date):
        return pa.date32()
    if isinstance(column_type, sa.Time):
        return pa.time64("us")
    return pa.string()


def _text(value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, bytes | bytearray | memoryview):
        return bytes(value).hex()
    if isinstance(value, dict | list):
        return json.dumps(value, ensure_ascii=False, default=str)
    if isinstance(value, dt.timedelta):
        return str(value)
    if isinstance(value, uuid.UUID):
        return str(value)
    return str(value)


def _convert(values: list[Any], kind: pa.DataType) -> list[Any]:
    if pa.types.is_string(kind):
        return [_text(v) for v in values]
    if pa.types.is_timestamp(kind) and kind.tz is None:
        return [
            v.astimezone(dt.UTC).replace(tzinfo=None)
            if isinstance(v, dt.datetime) and v.tzinfo is not None
            else v
            for v in values
        ]
    if pa.types.is_floating(kind):
        return [None if v is None else float(v) for v in values]
    if pa.types.is_decimal(kind):
        return [
            None if v is None else v if isinstance(v, decimal.Decimal) else decimal.Decimal(str(v))
            for v in values
        ]
    if pa.types.is_boolean(kind):
        return [None if v is None else bool(v) for v in values]
    return values


def _estimate(value: Any) -> int | None:
    return None if value is None or value < 0 else int(value)


def _cursor_candidates(columns: list[Any], primary_key: list[str]) -> list[CursorCandidate]:
    candidates: list[CursorCandidate] = []
    temporal = [c for c in columns if isinstance(c["type"], sa.DateTime | sa.Date)]
    for column in temporal:
        if _UPDATED.match(column["name"]):
            candidates.append(
                CursorCandidate(
                    column=column["name"],
                    kind="timestamp",
                    reason="Date de modification : chaque chargement reprend les lignes "
                    "ajoutées ou modifiées depuis le précédent.",
                )
            )
    for column in temporal:
        if _CREATED.match(column["name"]):
            candidates.append(
                CursorCandidate(
                    column=column["name"],
                    kind="timestamp",
                    reason="Date de création : seules les nouvelles lignes sont lues, les "
                    "modifications ne sont pas reprises.",
                )
            )
    if len(primary_key) == 1:
        [key] = primary_key
        column = next((c for c in columns if c["name"] == key), None)
        if column is not None and isinstance(column["type"], sa.Integer):
            candidates.append(
                CursorCandidate(
                    column=key,
                    kind="increasing_id",
                    reason="Identifiant croissant : seules les nouvelles lignes sont lues, les "
                    "modifications ne sont pas reprises.",
                )
            )
    return candidates


@dataclass
class DatabaseConnector:
    kind: ConnectionType
    params: DatabaseParams
    password: str | None
    batch_rows: int = 50_000

    def _engine(self) -> Engine:
        return engine_for(self.kind, self.params, self.password)

    def _error(self, exc: Exception) -> DatabaseError:
        return _failure(exc, self.password)

    def explore(self, connection_id: str) -> DatabaseExploration:
        engine = self._engine()
        try:
            with engine.connect() as con:
                inspector = sa.inspect(con)
                if self.kind is ConnectionType.MYSQL:
                    schemas = [str(con.execute(sa.text("SELECT DATABASE()")).scalar())]
                else:
                    schemas = [
                        s
                        for s in inspector.get_schema_names()
                        if s.lower() not in _SYSTEM_SCHEMAS and not s.lower().startswith("pg_")
                    ]
                estimates = {
                    (str(row[0]), str(row[1])): _estimate(row[2])
                    for row in con.execute(sa.text(_ROW_ESTIMATES[self.kind])).fetchall()
                }
                tables: list[DatabaseTable] = []
                truncated = False
                for schema in schemas:
                    for kind, names in (
                        ("table", inspector.get_table_names(schema=schema)),
                        ("view", inspector.get_view_names(schema=schema)),
                    ):
                        for name in names:
                            if len(tables) >= MAX_TABLES:
                                truncated = True
                                break
                            tables.append(self._describe(inspector, schema, name, kind, estimates))
        except sa.exc.SQLAlchemyError as exc:
            raise self._error(exc) from exc
        finally:
            engine.dispose()
        return DatabaseExploration(
            connection_id=connection_id,
            schemas=schemas,
            tables=tables,
            truncated=truncated,
        )

    def _describe(
        self,
        inspector: sa.Inspector,
        schema: str,
        name: str,
        kind: str,
        estimates: dict[tuple[str, str], int | None],
    ) -> DatabaseTable:
        columns = inspector.get_columns(name, schema=schema)
        primary_key: list[str] = []
        if kind == "table":
            constraint = inspector.get_pk_constraint(name, schema=schema)
            primary_key = list(constraint.get("constrained_columns") or [])
        candidates = _cursor_candidates(columns, primary_key)
        return DatabaseTable(
            schema_name=schema,
            name=name,
            kind="table" if kind == "table" else "view",
            estimated_rows=estimates.get((schema, name)),
            columns=[
                DatabaseColumn(
                    name=c["name"],
                    type=str(c["type"]),
                    forja_type=str(arrow_type(c["type"])),
                    nullable=bool(c.get("nullable", True)),
                )
                for c in columns
            ],
            primary_key=primary_key,
            cursor_candidates=candidates,
            suggested_cursor=candidates[0].column if candidates else None,
        )

    def table_columns(self, schema: str, table: str) -> list[Any]:
        """Columns of one table, read from the database's catalog."""
        engine = self._engine()
        try:
            with engine.connect() as con:
                inspector = sa.inspect(con)
                names = set(inspector.get_table_names(schema=schema)) | set(
                    inspector.get_view_names(schema=schema)
                )
                if table not in names:
                    raise DatabaseObjectNotFoundError(
                        f"table '{schema}.{table}' not found in the database",
                        details={"schema": schema, "table": table},
                    )
                return list(inspector.get_columns(table, schema=schema))
        except sa.exc.SQLAlchemyError as exc:
            raise self._error(exc) from exc
        finally:
            engine.dispose()

    def stream(
        self,
        schema: str,
        table: str,
        *,
        cursor_column: str | None = None,
        after: str | None = None,
        state: CursorState | None = None,
    ) -> tuple[pa.Schema, Iterator[pa.RecordBatch]]:
        """Arrow schema and batches of ``schema.table``; with a cursor, only the rows whose
        cursor is greater than ``after``, in cursor order."""
        columns = self.table_columns(schema, table)
        names = [c["name"] for c in columns]
        types = {c["name"]: c["type"] for c in columns}
        if cursor_column is not None and cursor_column not in types:
            raise DatabaseObjectNotFoundError(
                f"cursor column '{cursor_column}' not found in '{schema}.{table}'",
                details={"column": cursor_column},
            )
        arrow_schema = pa.schema([pa.field(n, arrow_type(types[n])) for n in names])
        relation = sa.table(
            quoted_name(table, quote=True),
            *[sa.column(quoted_name(n, quote=True)) for n in names],
            schema=quoted_name(schema, quote=True),
        )
        statement = sa.select(*[relation.c[n] for n in names])
        if cursor_column is not None:
            cursor = relation.c[cursor_column]
            if after is not None:
                statement = statement.where(
                    cursor
                    > sa.bindparam(
                        "after",
                        _parse_cursor(after, types[cursor_column]),
                        type_=types[cursor_column],
                    )
                )
            statement = statement.order_by(cursor)
        tracker = state or CursorState(column=cursor_column)
        cursor_index = names.index(cursor_column) if cursor_column is not None else None

        def batches() -> Iterator[pa.RecordBatch]:
            engine = self._engine()
            try:
                with engine.connect() as con:
                    result = con.execution_options(
                        stream_results=True, yield_per=self.batch_rows
                    ).execute(statement)
                    for rows in result.partitions(self.batch_rows):
                        if not rows:
                            continue
                        columns_values = list(zip(*rows, strict=True))
                        arrays = [
                            pa.array(
                                _convert(list(values), arrow_schema.field(i).type),
                                type=arrow_schema.field(i).type,
                            )
                            for i, values in enumerate(columns_values)
                        ]
                        if cursor_index is not None:
                            tracker.observe(list(columns_values[cursor_index]))
                        tracker.rows += len(rows)
                        tracker.batches += 1
                        yield pa.RecordBatch.from_arrays(arrays, schema=arrow_schema)
            except sa.exc.SQLAlchemyError as exc:
                raise self._error(exc) from exc
            except (pa.ArrowInvalid, pa.ArrowTypeError) as exc:
                raise DatabaseError(f"a value does not fit its column type: {exc}") from exc
            finally:
                engine.dispose()

        return arrow_schema, batches()


def cursor_text(value: Any) -> str | None:
    """Stored form of a cursor value."""
    if value is None:
        return None
    if isinstance(value, dt.datetime | dt.date | dt.time):
        return value.isoformat()
    return str(value)


def _parse_cursor(value: str, column_type: sa.types.TypeEngine[Any]) -> Any:
    if isinstance(column_type, sa.DateTime):
        return dt.datetime.fromisoformat(value)
    if isinstance(column_type, sa.Date):
        return dt.date.fromisoformat(value)
    if isinstance(column_type, sa.Integer):
        return int(value)
    if isinstance(column_type, sa.Numeric):
        return decimal.Decimal(value)
    return value
