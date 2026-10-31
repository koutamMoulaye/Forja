"""Connections of a project: their life cycle, exploration and the loads they feed.

Each table (or API endpoint, or nested list of an endpoint) selected for import is a
*feed*: the binding between a connection object and a Forja source, created by the
first load. A load extracts every feed of a connection (or a few of them) and adds a
version to its source, exactly as a re-uploaded file would: versions, schema drift,
profile and Silver plan follow. Incremental feeds only extract rows past their cursor.

Credentials are decrypted only to open a connection; they are never returned, logged
or given to the language model.
"""

from __future__ import annotations

import shutil
import time
import uuid
from collections.abc import Callable, Iterator
from dataclasses import dataclass, field
from pathlib import Path

import httpx
import pyarrow as pa
from pydantic import SecretStr

from forja_core.catalog import Catalog
from forja_core.config import Settings
from forja_core.connectors.database import (
    CursorState,
    DatabaseConnector,
    cursor_text,
    test_connection,
)
from forja_core.connectors.models import (
    SECRET_FIELDS,
    ApiPreview,
    ApiPreviewRequest,
    Connection,
    ConnectionCreate,
    ConnectionSourceView,
    ConnectionTest,
    ConnectionType,
    ConnectionUpdate,
    DatabaseExploration,
    DatabaseParams,
    FeedObject,
    ImportRequest,
    LoadMode,
    RestApiParams,
    SourceFeed,
    checked_params,
    parse_params,
)
from forja_core.connectors.rest import (
    ApiError,
    Clock,
    Flattener,
    RestClient,
    get_path,
    newest_cursor,
)
from forja_core.connectors.ssrf import BlockedAddressError, Resolver, UrlGuard, system_resolver
from forja_core.connectors.vault import SecretVault, redact
from forja_core.errors import ConflictError, ForjaError, NotFoundError, PlanValidationError
from forja_core.ingestion.landing import Landed, Technical, land_batches, land_json
from forja_core.ingestion.service import IngestionService
from forja_core.jobs.models import Job, JobType, LoadMetrics, RunMetrics
from forja_core.jobs.scope import item_finished, item_started, report
from forja_core.logging import get_logger
from forja_core.models import Source, SourceFormat
from forja_core.utils import slugify, utcnow

log = get_logger(__name__)

ALLOWED_HOSTS_KEY = "connector_allowed_hosts"
Lander = Callable[[Path, Technical], Landed]


class ConnectorBusyError(ConflictError):
    code = "load_in_progress"


@dataclass
class LoadOutcome:
    metrics: RunMetrics = field(default_factory=RunMetrics)
    loaded: list[Source] = field(default_factory=list)
    blocked: list[Source] = field(default_factory=list)


class ConnectorService:
    def __init__(
        self,
        catalog: Catalog,
        settings: Settings,
        ingestion: IngestionService,
        vault: SecretVault,
        *,
        transport: httpx.BaseTransport | None = None,
        clock: Clock | None = None,
        resolver: Resolver = system_resolver,
    ) -> None:
        self.catalog = catalog
        self.settings = settings
        self.ingestion = ingestion
        self.vault = vault
        self.transport = transport
        self.clock = clock or Clock()
        self.resolver = resolver
        # Set by the application: a source whose new version blocks its approved plan.
        self.on_blocking_drift: Callable[[Source, list[str]], None] | None = None

    # --- settings ---------------------------------------------------------------------

    def saved_allowed_hosts(self) -> list[str]:
        saved = self.catalog.get_instance_setting(ALLOWED_HOSTS_KEY) or {}
        return [str(h) for h in saved.get("hosts", [])]

    def allowed_hosts(self) -> list[str]:
        return list(
            dict.fromkeys([*self.settings.connector_allowed_hosts, *self.saved_allowed_hosts()])
        )

    def set_allowed_hosts(self, hosts: list[str]) -> list[str]:
        cleaned = list(dict.fromkeys(h.strip() for h in hosts if h.strip()))
        self.catalog.save_instance_setting(ALLOWED_HOSTS_KEY, {"hosts": cleaned})
        return cleaned

    def guard(self) -> UrlGuard:
        return UrlGuard(allowed=tuple(self.allowed_hosts()), resolver=self.resolver)

    # --- life cycle -------------------------------------------------------------------

    @staticmethod
    def _secret_values(secrets: dict[str, SecretStr]) -> dict[str, str]:
        return {k: v.get_secret_value().strip() for k, v in secrets.items()}

    def create(
        self, project_id: str, request: ConnectionCreate, *, created_by: str | None
    ) -> Connection:
        self.catalog.get_project(project_id)
        now = utcnow()
        values = {k: v for k, v in self._secret_values(request.secrets).items() if v}
        connection = Connection(
            id=uuid.uuid4().hex,
            project_id=project_id,
            name=request.name,
            type=request.type,
            params=parse_params(request.type, request.params),
            secrets_set=sorted(values),
            created_by=created_by,
            created_at=now,
            updated_at=now,
        )
        self._check_rest(connection)
        self.catalog.add_connection(connection, self.vault.encrypt(values, bound_to=connection.id))
        log.info(
            "connection_created",
            project_id=project_id,
            connection_id=connection.id,
            type=connection.type.value,
        )
        return self.get(connection.id)

    def _check_rest(self, connection: Connection) -> None:
        if isinstance(connection.params, RestApiParams):
            self.guard().validate(connection.params.base_url)

    def update(self, connection_id: str, update: ConnectionUpdate) -> Connection:
        connection = self.catalog.get_connection(connection_id)
        values = self._secrets(connection)
        for name, secret in self._secret_values(update.secrets).items():
            if name not in SECRET_FIELDS[connection.type]:
                raise PlanValidationError(f"unknown secret field '{name}'")
            if secret:
                values[name] = secret
            else:
                values.pop(name, None)
        if update.name is not None:
            connection.name = update.name.strip()
        if update.params is not None:
            connection.params = checked_params(connection.type, update.params)
        connection.secrets_set = sorted(values)
        connection.updated_at = utcnow()
        connection.last_test = None
        self._check_rest(connection)
        self.catalog.update_connection(
            connection, self.vault.encrypt(values, bound_to=connection.id)
        )
        return self.get(connection_id)

    def delete(self, connection_id: str) -> list[str]:
        """Remove a connection; its sources stay, with their versions, but are no longer
        loaded."""
        self.catalog.get_connection(connection_id)
        self.check_idle(connection_id)
        return self.catalog.delete_connection(connection_id)

    def get(self, connection_id: str) -> Connection:
        connection = self.catalog.get_connection(connection_id)
        connection.sources = self._source_views(connection_id)
        return connection

    def list_connections(self, project_id: str) -> list[Connection]:
        connections = self.catalog.list_connections(project_id)
        for connection in connections:
            connection.sources = self._source_views(connection.id)
        return connections

    def _source_views(self, connection_id: str) -> list[ConnectionSourceView]:
        views = []
        for feed in self.catalog.list_feeds(connection_id):
            source = self._source_of(feed)
            views.append(
                ConnectionSourceView(
                    source_id=feed.source_id,
                    source_name=source.name if source else feed.name,
                    loaded=source is not None,
                    object=feed.object.label,
                    mode=feed.mode,
                    cursor_column=feed.cursor_column,
                    last_loaded_at=feed.last_loaded_at,
                    last_rows=feed.last_rows,
                )
            )
        return views

    def _secrets(self, connection: Connection) -> dict[str, str]:
        return self.vault.decrypt(
            self.catalog.connection_secrets(connection.id), bound_to=connection.id
        )

    def _source_of(self, feed: SourceFeed) -> Source | None:
        try:
            return self.catalog.get_source(feed.source_id)
        except ForjaError:
            return None

    # --- test -------------------------------------------------------------------------

    def test(self, connection_id: str) -> ConnectionTest:
        connection = self.catalog.get_connection(connection_id)
        result = self._test(connection.type, connection.params, self._secrets(connection))
        self.catalog.save_connection_test(connection_id, result)
        return result

    def test_draft(self, project_id: str, request: ConnectionCreate) -> ConnectionTest:
        """Try a configuration before saving it."""
        self.catalog.get_project(project_id)
        params = parse_params(request.type, request.params)
        return self._test(request.type, params, self._secret_values(request.secrets))

    def _test(
        self,
        kind: ConnectionType,
        params: DatabaseParams | RestApiParams,
        secrets: dict[str, str],
    ) -> ConnectionTest:
        if isinstance(params, DatabaseParams):
            return test_connection(kind, params, secrets.get("password"))
        started = time.perf_counter()
        try:
            first = params.endpoints[0] if params.endpoints else None
            with self._client(params, secrets) as client:
                if first is not None:
                    response, _ = client.get_json(params.base_url + first.path, dict(first.params))
                else:
                    # No endpoint yet: the server answers, credentials included (a 404 at the
                    # root of an API is common, a 401 is not).
                    response = client.send("GET", params.base_url)
                    if response.status_code in (401, 403) or response.status_code >= 500:
                        raise ApiError(f"the API answered {response.status_code}")
            ok, message = True, f"L'API répond ({response.status_code})."
        except (ApiError, BlockedAddressError) as exc:
            ok, message = False, redact(exc.message, secrets)
        return ConnectionTest(
            ok=ok,
            message=message,
            duration_ms=round((time.perf_counter() - started) * 1000),
            tested_at=utcnow(),
        )

    def _client(self, params: RestApiParams, secrets: dict[str, str]) -> RestClient:
        return RestClient(
            params=params,
            secrets=secrets,
            guard=self.guard(),
            transport=self.transport,
            clock=self.clock,
        )

    # --- databases --------------------------------------------------------------------

    def _database(self, connection: Connection) -> DatabaseConnector:
        if not isinstance(connection.params, DatabaseParams):
            raise PlanValidationError("this connection is not a database")
        return DatabaseConnector(
            kind=connection.type,
            params=connection.params,
            password=self._secrets(connection).get("password"),
            batch_rows=self.settings.connector_batch_rows,
        )

    def explore(self, connection_id: str) -> DatabaseExploration:
        connection = self.catalog.get_connection(connection_id)
        exploration = self._database(connection).explore(connection_id)
        imported = {
            (feed.object.schema_name, feed.object.table): feed.source_id
            for feed in self.catalog.list_feeds(connection_id)
        }
        for table in exploration.tables:
            table.source_id = imported.get((table.schema_name, table.name))
        return exploration

    # --- REST APIs --------------------------------------------------------------------

    def preview_api(self, project_id: str, request: ApiPreviewRequest, scratch: Path) -> ApiPreview:
        """First page of an endpoint, flattened, before the configuration is saved."""
        self.catalog.get_project(project_id)
        params = checked_params(ConnectionType.REST_API, request.params)
        assert isinstance(params, RestApiParams)
        secrets = self._secret_values(request.secrets)
        if request.connection_id is not None:
            connection = self.catalog.get_connection(request.connection_id)
            if connection.project_id != project_id:
                raise NotFoundError(f"connection '{request.connection_id}' not found")
            secrets = {**self._secrets(connection), **{k: v for k, v in secrets.items() if v}}
        if not params.endpoints:
            raise PlanValidationError("add an endpoint to preview")
        wanted = slugify(request.endpoint) if request.endpoint else params.endpoints[0].name
        endpoint = next((e for e in params.endpoints if e.name == wanted), None)
        if endpoint is None:
            raise NotFoundError(f"endpoint '{request.endpoint}' not found")
        started = time.perf_counter()
        directory = scratch / f"preview-{uuid.uuid4().hex}"
        flattener = Flattener(endpoint=endpoint, directory=directory)
        try:
            with self._client(params, secrets) as client:
                page = next(client.pages(endpoint))
            flattener.add(page.records)
            flattener.close()
            tables, relations = flattener.preview()
        except (ApiError, BlockedAddressError) as exc:
            raise type(exc)(redact(exc.message, secrets), details=exc.details) from exc
        finally:
            flattener.close()
            shutil.rmtree(directory, ignore_errors=True)
        return ApiPreview(
            endpoint=endpoint.name,
            url=page.url,
            status_code=page.status_code,
            records_path=page.records_path,
            records_path_detected=page.detected,
            record_count=len(page.records),
            has_next_page=page.has_next,
            tables=tables,
            relations=relations,
            duration_ms=round((time.perf_counter() - started) * 1000),
        )

    # --- import -----------------------------------------------------------------------

    def import_objects(self, connection_id: str, request: ImportRequest) -> list[SourceFeed]:
        """Bind the selected tables or endpoints to sources, created by their first load."""
        connection = self.catalog.get_connection(connection_id)
        existing = {f.object.model_dump_json(): f for f in self.catalog.list_feeds(connection_id)}
        if not request.tables and not request.endpoints:
            raise PlanValidationError("select at least one table or endpoint")
        feeds: list[SourceFeed] = []
        if connection.type.is_database:
            if request.endpoints:
                raise PlanValidationError("a database connection has tables, not endpoints")
            database = self._database(connection)
            for selection in request.tables:
                described = database.table_columns(selection.schema_name, selection.table)
                columns = {c["name"] for c in described}
                if selection.cursor_column is not None and selection.cursor_column not in columns:
                    raise PlanValidationError(
                        f"cursor column '{selection.cursor_column}' not found in "
                        f"'{selection.schema_name}.{selection.table}'"
                    )
                obj = FeedObject(schema_name=selection.schema_name, table=selection.table)
                cursor = selection.cursor_column if selection.mode is LoadMode.INCREMENTAL else None
                name = slugify(selection.table, default="table")
                feeds.append(self._feed(connection, obj, name, existing, selection.mode, cursor))
        else:
            if request.tables:
                raise PlanValidationError("a REST API connection has endpoints, not tables")
            assert isinstance(connection.params, RestApiParams)
            endpoints = {e.name: e for e in connection.params.endpoints}
            for chosen in request.endpoints:
                endpoint = endpoints.get(slugify(chosen.endpoint))
                if endpoint is None:
                    raise NotFoundError(f"endpoint '{chosen.endpoint}' not found")
                mode = LoadMode.INCREMENTAL if endpoint.incremental else LoadMode.FULL
                cursor = endpoint.incremental.cursor_field if endpoint.incremental else None
                obj = FeedObject(endpoint=endpoint.name)
                feeds.append(
                    self._feed(
                        connection,
                        obj,
                        endpoint.name,
                        existing,
                        mode,
                        cursor,
                        chosen.include_children,
                    )
                )
        log.info("connection_objects_imported", connection_id=connection_id, feeds=len(feeds))
        return feeds

    def _feed(
        self,
        connection: Connection,
        obj: FeedObject,
        name: str,
        existing: dict[str, SourceFeed],
        mode: LoadMode,
        cursor: str | None,
        include_children: bool = True,
    ) -> SourceFeed:
        now = utcnow()
        feed = existing.get(obj.model_dump_json())
        if feed is not None:
            if feed.mode is not mode or feed.cursor_column != cursor:
                # Another cursor: the next load starts from the beginning.
                feed.cursor_column, feed.cursor_value = cursor, None
            feed.mode, feed.include_children, feed.updated_at = mode, include_children, now
            return self.catalog.save_feed(feed)
        return self.catalog.save_feed(
            SourceFeed(
                source_id=uuid.uuid4().hex,
                connection_id=connection.id,
                name=name,
                object=obj,
                mode=mode,
                cursor_column=cursor,
                include_children=include_children,
                created_at=now,
                updated_at=now,
            )
        )

    # --- loads ------------------------------------------------------------------------

    def active_load(self, connection_id: str) -> Job | None:
        for job in self.catalog.active_jobs(JobType.LOAD):
            if job.params.connection_id == connection_id:
                return job
        return None

    def check_idle(self, connection_id: str) -> None:
        active = self.active_load(connection_id)
        if active is not None:
            raise ConnectorBusyError(
                "a load of this connection is already queued or running",
                details={"run_id": active.id, "status": active.status.value},
            )

    def load(self, job: Job, log_line: Callable[[str], None]) -> LoadOutcome:
        connection = self.catalog.get_connection(job.params.connection_id or "")
        feeds = self.catalog.list_feeds(connection.id)
        if job.params.source_ids is not None:
            wanted = set(job.params.source_ids)
            feeds = [f for f in feeds if f.source_id in wanted]
        if not feeds:
            raise PlanValidationError("nothing to load: select tables or endpoints first")
        outcome = LoadOutcome()
        if connection.type.is_database:
            self._load_database(connection, feeds, outcome, log_line)
        else:
            self._load_api(connection, feeds, outcome, log_line)
        outcome.metrics.rows_loaded = sum(m.rows for m in outcome.metrics.loads)
        return outcome

    def _ingest(
        self, connection: Connection, feed: SourceFeed, land: Lander, fmt: SourceFormat
    ) -> Source:
        return self.ingestion.ingest(
            connection.project_id,
            land,
            name=feed.name,
            filename=f"{connection.name}:{feed.object.label}",
            fmt=fmt,
            existing=self._source_of(feed),
            source_id=feed.source_id,
        )

    def _finish_feed(
        self,
        feed: SourceFeed,
        source: Source | None,
        metrics: LoadMetrics,
        outcome: LoadOutcome,
        log_line: Callable[[str], None],
    ) -> None:
        feed.last_loaded_at = utcnow()
        feed.last_rows = metrics.rows
        feed.updated_at = feed.last_loaded_at
        self.catalog.save_feed(feed)
        if source is not None and metrics.version is not None:
            outcome.loaded.append(source)
            blocking = blocking_drift(source)
            if blocking:
                metrics.blocking_drift = True
                outcome.blocked.append(source)
                log_line(
                    f"{source.name}: schema changed ({', '.join(blocking)}); the approved plan "
                    "waits for a review"
                )
                if self.on_blocking_drift is not None:
                    self.on_blocking_drift(source, blocking)
        outcome.metrics.loads.append(metrics)

    def _load_database(
        self,
        connection: Connection,
        feeds: list[SourceFeed],
        outcome: LoadOutcome,
        log_line: Callable[[str], None],
    ) -> None:
        database = self._database(connection)
        for index, feed in enumerate(feeds):
            label = feed.object.label
            percent = 100 * index // len(feeds)
            report("extract", f"extraction de {label}", percent)
            item_started(feed.source_id)
            started = time.perf_counter()
            incremental = feed.mode is LoadMode.INCREMENTAL and feed.cursor_column is not None
            state = CursorState(column=feed.cursor_column)
            arrow_schema, batches = database.stream(
                feed.object.schema_name or "",
                feed.object.table or "",
                cursor_column=feed.cursor_column if incremental else None,
                after=feed.cursor_value if incremental else None,
                state=state,
            )
            metrics = LoadMetrics(source_name=feed.name, object=label, mode=feed.mode.value)
            batches = _progress(batches, state, label, percent, log_line)
            first = next(batches, None)
            source: Source | None = None
            if first is None:
                metrics.skipped = "aucune nouvelle ligne" if incremental else "table vide"
                log_line(f"{label}: {metrics.skipped}, no version created")
            else:
                reader = pa.RecordBatchReader.from_batches(arrow_schema, _chain(first, batches))
                source = self._ingest(
                    connection, feed, _batch_lander(reader), SourceFormat.DATABASE
                )
                if incremental and state.seen:
                    feed.cursor_value = cursor_text(state.value)
                metrics.source_id, metrics.source_name = source.id, source.name
                metrics.version = source.version
                log_line(
                    f"{label}: {state.rows} row(s) in {state.batches} batch(es) -> "
                    f"{source.name} v{source.version}"
                )
            metrics.rows, metrics.batches = state.rows, state.batches
            metrics.cursor_value = feed.cursor_value
            metrics.duration_seconds = round(time.perf_counter() - started, 3)
            self._finish_feed(feed, source, metrics, outcome, log_line)
            item_finished(feed.source_id, ok=True)

    def _load_api(
        self,
        connection: Connection,
        feeds: list[SourceFeed],
        outcome: LoadOutcome,
        log_line: Callable[[str], None],
    ) -> None:
        params = connection.params
        assert isinstance(params, RestApiParams)
        secrets = self._secrets(connection)
        roots = [f for f in feeds if not f.object.child_path]
        children = {
            (f.object.endpoint, *f.object.child_path): f
            for f in self.catalog.list_feeds(connection.id)
            if f.object.child_path
        }
        scratch = self.ingestion.workspace.staging_dir(connection.project_id) / "api"
        for index, root in enumerate(roots):
            endpoint = next((e for e in params.endpoints if e.name == root.object.endpoint), None)
            if endpoint is None:
                log_line(f"endpoint '{root.object.endpoint}' no longer configured: skipped")
                continue
            percent = 100 * index // len(roots)
            report("extract", f"appel de {endpoint.name}", percent)
            item_started(root.source_id)
            started = time.perf_counter()
            directory = scratch / uuid.uuid4().hex
            incremental = root.mode is LoadMode.INCREMENTAL and endpoint.incremental is not None
            flattener = Flattener(
                endpoint=endpoint, directory=directory, include_children=root.include_children
            )
            pages = records = 0
            cursor = root.cursor_value
            throttle = _Throttle()
            try:
                with self._client(params, secrets) as client:
                    since = root.cursor_value if incremental else None
                    for page in client.pages(endpoint, since=since):
                        pages += 1
                        records += len(page.records)
                        flattener.add(page.records)
                        if incremental and endpoint.incremental is not None:
                            field_name = endpoint.incremental.cursor_field
                            cursor = newest_cursor(
                                (
                                    str(value)
                                    for record in page.records
                                    if (value := get_path(record, field_name)) is not None
                                ),
                                cursor,
                            )
                        if throttle.ready():
                            report(
                                "extract",
                                f"{endpoint.name} : {records} enregistrement(s), {pages} page(s)",
                                percent,
                            )
                    requests = client.requests_made
                flattener.close()
                log_line(
                    f"{endpoint.name}: {records} record(s) in {pages} page(s), "
                    f"{requests} request(s)"
                )
                for path, writer in flattener.tables.items():
                    key = (endpoint.name, *path)
                    feed = root if not path else children.get(key)
                    if feed is None:
                        feed = self._child_feed(connection, root, list(path), writer.name)
                        children[key] = feed
                    metrics = LoadMetrics(
                        source_name=feed.name,
                        object=feed.object.label,
                        mode=root.mode.value,
                        rows=writer.rows,
                        batches=pages,
                    )
                    source: Source | None = None
                    if writer.rows == 0:
                        metrics.skipped = (
                            "aucune nouveauté" if incremental else "aucun enregistrement"
                        )
                    else:
                        lander = _json_lander(writer.file, self.settings)
                        source = self._ingest(connection, feed, lander, SourceFormat.API)
                        metrics.source_id, metrics.source_name = source.id, source.name
                        metrics.version = source.version
                        log_line(
                            f"{feed.object.label}: {writer.rows} row(s) -> "
                            f"{source.name} v{source.version}"
                        )
                    if not path and incremental:
                        feed.cursor_value = cursor
                    metrics.cursor_value = feed.cursor_value
                    metrics.duration_seconds = round(time.perf_counter() - started, 3)
                    self._finish_feed(feed, source, metrics, outcome, log_line)
            except (ApiError, BlockedAddressError) as exc:
                raise type(exc)(redact(exc.message, secrets), details=exc.details) from exc
            finally:
                flattener.close()
                shutil.rmtree(directory, ignore_errors=True)
            item_finished(root.source_id, ok=True)

    def _child_feed(
        self, connection: Connection, root: SourceFeed, path: list[str], name: str
    ) -> SourceFeed:
        """A nested list met for the first time: a child table, linked to its parent."""
        now = utcnow()
        return self.catalog.save_feed(
            SourceFeed(
                source_id=uuid.uuid4().hex,
                connection_id=connection.id,
                name=name,
                object=FeedObject(endpoint=root.object.endpoint, child_path=path),
                mode=root.mode,
                created_at=now,
                updated_at=now,
            )
        )


def blocking_drift(source: Source) -> list[str]:
    """Changes of the latest version the approved plan cannot clean as approved: removed
    columns and changed physical types. Added columns do not block: the approved plan
    ignores them until its new version is reviewed."""
    drift = source.schema_drift
    if drift is None or not drift.has_drift:
        return []
    columns = [f"{name} (supprimée)" for name in drift.removed]
    columns += [
        f"{change.column} ({change.previous_type} → {change.new_type})"
        for change in drift.type_changed
        if change.level == "physical"
    ]
    return columns


class _Throttle:
    """At most one progress report per interval: each one is saved and broadcast."""

    def __init__(self, seconds: float = 1.0) -> None:
        self.seconds = seconds
        self.last = 0.0

    def ready(self) -> bool:
        now = time.monotonic()
        if now - self.last >= self.seconds:
            self.last = now
            return True
        return False


def _chain(first: pa.RecordBatch, rest: Iterator[pa.RecordBatch]) -> Iterator[pa.RecordBatch]:
    yield first
    yield from rest


def _progress(
    batches: Iterator[pa.RecordBatch],
    state: CursorState,
    label: str,
    percent: int,
    log_line: Callable[[str], None],
) -> Iterator[pa.RecordBatch]:
    throttle = _Throttle()
    for batch in batches:
        yield batch
        if throttle.ready():
            report("extract", f"{label} : {state.rows} ligne(s), {state.batches} lot(s)", percent)
        if state.batches % 20 == 0:
            log_line(f"{label}: {state.rows} row(s) read")


def _batch_lander(reader: pa.RecordBatchReader) -> Lander:
    def land(target: Path, technical: Technical) -> Landed:
        rows = land_batches(reader, target, technical)
        return Landed(row_count=rows, column_count=len(reader.schema))

    return land


def _json_lander(file: Path, settings: Settings) -> Lander:
    def land(target: Path, technical: Technical) -> Landed:
        return land_json(file, settings.duplicate_columns, target, technical)

    return land
