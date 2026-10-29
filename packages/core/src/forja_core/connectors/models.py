"""Connections to databases and REST APIs, and the tables Forja loads from them.

Parameters are stored in clear in the catalog; credentials (passwords, tokens, keys,
client secrets) are encrypted at rest (:mod:`forja_core.connectors.vault`) and never
leave the server: the API only says which ones are set.
"""

from __future__ import annotations

import re
from datetime import datetime
from enum import StrEnum
from typing import Any, Literal

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    SecretStr,
    ValidationError,
    field_validator,
    model_validator,
)

from forja_core.errors import PlanValidationError
from forja_core.utils import slugify

_HOST_RE = re.compile(r"^[A-Za-z0-9._\-:\[\]]{1,253}$")
_NAME_RE = re.compile(r"^[A-Za-z0-9_][A-Za-z0-9_.\-]{0,127}$")
_PATH_RE = re.compile(r"^[A-Za-z0-9_][A-Za-z0-9_.\-]*(\.[A-Za-z0-9_\-]+)*$")


class ConnectionType(StrEnum):
    POSTGRES = "postgres"
    MYSQL = "mysql"
    SQLSERVER = "sqlserver"
    REST_API = "rest_api"

    @property
    def is_database(self) -> bool:
        return self is not ConnectionType.REST_API


DEFAULT_PORTS: dict[ConnectionType, int] = {
    ConnectionType.POSTGRES: 5432,
    ConnectionType.MYSQL: 3306,
    ConnectionType.SQLSERVER: 1433,
}

# Secret fields of each connection type.
SECRET_FIELDS: dict[ConnectionType, tuple[str, ...]] = {
    ConnectionType.POSTGRES: ("password",),
    ConnectionType.MYSQL: ("password",),
    ConnectionType.SQLSERVER: ("password",),
    ConnectionType.REST_API: ("api_key", "token", "password", "client_secret"),
}


class DatabaseParams(BaseModel):
    model_config = ConfigDict(extra="forbid")

    host: str = Field(min_length=1, max_length=253)
    port: int | None = Field(default=None, ge=1, le=65535)
    database: str = Field(min_length=1, max_length=128)
    username: str = Field(min_length=1, max_length=128)
    ssl: Literal["disable", "prefer", "require"] = "prefer"

    @field_validator("host")
    @classmethod
    def _host(cls, value: str) -> str:
        value = value.strip()
        if not _HOST_RE.fullmatch(value):
            raise ValueError("invalid host name")
        return value


class AuthKind(StrEnum):
    NONE = "none"
    API_KEY = "api_key"
    BEARER = "bearer"
    BASIC = "basic"
    OAUTH2 = "oauth2_client_credentials"


class ApiAuth(BaseModel):
    """How requests authenticate. Secret values live in the connection's secrets."""

    model_config = ConfigDict(extra="forbid")

    kind: AuthKind = AuthKind.NONE
    key_name: str | None = Field(
        default=None, max_length=128, description="api_key: header or query parameter name"
    )
    key_in: Literal["header", "query"] = "header"
    username: str | None = Field(default=None, max_length=256, description="basic")
    token_url: str | None = Field(default=None, max_length=2048, description="oauth2")
    client_id: str | None = Field(default=None, max_length=512, description="oauth2")
    scope: str | None = Field(default=None, max_length=1024, description="oauth2")

    @model_validator(mode="after")
    def _complete(self) -> ApiAuth:
        if self.kind is AuthKind.API_KEY and not self.key_name:
            raise ValueError("an API key needs the header or parameter name")
        if self.kind is AuthKind.BASIC and not self.username:
            raise ValueError("basic authentication needs a user name")
        if self.kind is AuthKind.OAUTH2 and not (self.token_url and self.client_id):
            raise ValueError("OAuth2 client credentials need the token URL and the client id")
        return self


class PaginationKind(StrEnum):
    NONE = "none"
    PAGE_NUMBER = "page_number"
    OFFSET = "offset"
    CURSOR = "cursor"
    LINK_HEADER = "link_header"
    NEXT_URL = "next_url"


class Pagination(BaseModel):
    model_config = ConfigDict(extra="forbid")

    kind: PaginationKind = PaginationKind.NONE
    page_param: str = Field(default="page", max_length=64)
    start_page: int = Field(default=1, ge=0)
    size_param: str | None = Field(default="per_page", max_length=64)
    page_size: int | None = Field(default=100, ge=1, le=10_000)
    offset_param: str = Field(default="offset", max_length=64)
    limit_param: str = Field(default="limit", max_length=64)
    cursor_param: str = Field(default="cursor", max_length=64)
    cursor_path: str | None = Field(
        default=None, max_length=256, description="cursor: where the next cursor is, a.b.c"
    )
    next_url_path: str | None = Field(
        default=None, max_length=256, description="next_url: where the next page URL is"
    )
    max_pages: int = Field(default=10_000, ge=1, le=1_000_000)

    @model_validator(mode="after")
    def _complete(self) -> Pagination:
        if self.kind is PaginationKind.CURSOR and not self.cursor_path:
            raise ValueError("cursor pagination needs the path of the next cursor")
        if self.kind is PaginationKind.NEXT_URL and not self.next_url_path:
            raise ValueError("next URL pagination needs the path of the next URL")
        return self


class ApiIncremental(BaseModel):
    """Ask only for records changed since the last load."""

    model_config = ConfigDict(extra="forbid")

    param: str = Field(min_length=1, max_length=64, description="Query parameter, e.g. since")
    cursor_field: str = Field(
        min_length=1, max_length=256, description="Record field holding the change date or id"
    )
    initial_value: str | None = Field(default=None, max_length=256)


class Endpoint(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=63)
    path: str = Field(min_length=1, max_length=2048, description="Relative to the base URL")
    params: dict[str, str] = Field(default_factory=dict)
    records_path: str | None = Field(
        default=None, max_length=256, description="Where the records are, a.b; detected if empty"
    )
    primary_key: str | None = Field(
        default=None, max_length=256, description="Record field identifying a record (id...)"
    )
    incremental: ApiIncremental | None = None

    @field_validator("name")
    @classmethod
    def _name(cls, value: str) -> str:
        return slugify(value, default="endpoint")

    @field_validator("path")
    @classmethod
    def _path(cls, value: str) -> str:
        value = value.strip()
        if "://" in value or value.startswith("//"):
            raise ValueError("the endpoint path is relative to the base URL")
        return value if value.startswith("/") else f"/{value}"


class RestApiParams(BaseModel):
    model_config = ConfigDict(extra="forbid")

    base_url: str = Field(min_length=1, max_length=2048)
    headers: dict[str, str] = Field(
        default_factory=dict, description="Extra headers (not secret: put keys in the auth)"
    )
    auth: ApiAuth = Field(default_factory=ApiAuth)
    pagination: Pagination = Field(default_factory=Pagination)
    endpoints: list[Endpoint] = Field(default_factory=list, max_length=100)
    rate_limit_per_second: float | None = Field(default=None, gt=0, le=1000)
    max_retries: int = Field(default=5, ge=0, le=10)
    backoff_seconds: float = Field(default=1.0, ge=0, le=60)
    timeout_seconds: float = Field(default=30, gt=0, le=300)

    @field_validator("base_url")
    @classmethod
    def _base_url(cls, value: str) -> str:
        value = value.strip().rstrip("/")
        if not re.fullmatch(r"https?://[^\s/?#@]+(/[^\s?#]*)?", value):
            raise ValueError("the base URL must be an http(s) URL without credentials")
        return value

    @field_validator("headers")
    @classmethod
    def _headers(cls, value: dict[str, str]) -> dict[str, str]:
        for name in value:
            if not re.fullmatch(r"[A-Za-z0-9-]{1,64}", name):
                raise ValueError(f"invalid header name: {name!r}")
            if name.lower() in ("authorization", "cookie", "proxy-authorization", "host"):
                raise ValueError(f"'{name}' is set by the authentication, not as a header")
        return value

    @model_validator(mode="after")
    def _unique_endpoints(self) -> RestApiParams:
        names = [e.name for e in self.endpoints]
        if len(names) != len(set(names)):
            raise ValueError("endpoint names must be unique")
        return self


ConnectionParams = DatabaseParams | RestApiParams


def parse_params(kind: ConnectionType, value: Any) -> ConnectionParams:
    if kind.is_database:
        return DatabaseParams.model_validate(value)
    return RestApiParams.model_validate(value)


def checked_params(kind: ConnectionType, value: Any) -> ConnectionParams:
    """Parameters sent to an endpoint after its body was validated (an update)."""
    try:
        return parse_params(kind, value)
    except ValidationError as exc:
        problems = "; ".join(
            f"{'.'.join(str(p) for p in error['loc'])}: {error['msg']}" for error in exc.errors()
        )
        raise PlanValidationError(f"invalid parameters: {problems}") from exc


class ConnectionTest(BaseModel):
    ok: bool
    message: str
    duration_ms: int
    tested_at: datetime
    server_version: str | None = None
    read_only: bool | None = Field(
        default=None, description="The account cannot write (databases), when it can be told"
    )


class ConnectionCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=100)
    type: ConnectionType
    params: dict[str, Any]
    secrets: dict[str, SecretStr] = Field(
        default_factory=dict, description="password, api_key, token or client_secret"
    )

    @field_validator("name")
    @classmethod
    def _name(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("name must not be blank")
        return value

    @model_validator(mode="after")
    def _valid(self) -> ConnectionCreate:
        parse_params(self.type, self.params)
        unknown = set(self.secrets) - set(SECRET_FIELDS[self.type])
        if unknown:
            raise ValueError(f"unknown secret field(s): {', '.join(sorted(unknown))}")
        return self


class ConnectionUpdate(BaseModel):
    """Changes to a connection; secrets left out stay as they are, empty ones are removed."""

    model_config = ConfigDict(extra="forbid")

    name: str | None = Field(default=None, min_length=1, max_length=100)
    params: dict[str, Any] | None = None
    secrets: dict[str, SecretStr] = Field(default_factory=dict)


class LoadMode(StrEnum):
    FULL = "full"
    INCREMENTAL = "incremental"


class FeedObject(BaseModel):
    """What a source is extracted from: a table, an API endpoint or a nested list of it."""

    schema_name: str | None = Field(default=None, description="Database schema")
    table: str | None = None
    endpoint: str | None = None
    child_path: list[str] = Field(
        default_factory=list, description="Nested lists of the endpoint's records, outer first"
    )

    @property
    def label(self) -> str:
        if self.table is not None:
            return f"{self.schema_name}.{self.table}" if self.schema_name else self.table
        return ".".join([self.endpoint or "", *self.child_path])


class SourceFeed(BaseModel):
    """A Forja source loaded from a connection; the source exists after the first load."""

    source_id: str
    connection_id: str
    name: str = Field(description="Name of the source, proposed until its first load")
    object: FeedObject
    mode: LoadMode = LoadMode.FULL
    include_children: bool = Field(default=True, description="API: nested lists as tables")
    cursor_column: str | None = None
    cursor_value: str | None = Field(
        default=None, description="Highest cursor value loaded (incremental mode)"
    )
    last_loaded_at: datetime | None = None
    last_rows: int | None = None
    created_at: datetime
    updated_at: datetime


class SourceOrigin(BaseModel):
    """Shown on a source: the connection it comes from and how it is loaded."""

    connection_id: str
    connection_name: str
    connection_type: ConnectionType
    object: str
    mode: LoadMode
    cursor_column: str | None = None
    last_loaded_at: datetime | None = None


class ConnectionSourceView(BaseModel):
    source_id: str
    source_name: str
    loaded: bool = Field(description="False until the first load creates the source")
    object: str
    mode: LoadMode
    cursor_column: str | None = None
    last_loaded_at: datetime | None = None
    last_rows: int | None = None


class Connection(BaseModel):
    id: str
    project_id: str
    name: str
    type: ConnectionType
    params: DatabaseParams | RestApiParams
    secrets_set: list[str] = Field(
        default_factory=list, description="Secret fields with a value (values are never returned)"
    )
    created_by: str | None = None
    created_at: datetime
    updated_at: datetime
    last_test: ConnectionTest | None = None
    sources: list[ConnectionSourceView] = Field(default_factory=list)


# --- Database exploration ----------------------------------------------------------------


class CursorCandidate(BaseModel):
    column: str
    kind: Literal["timestamp", "increasing_id"]
    reason: str


class DatabaseColumn(BaseModel):
    name: str
    type: str = Field(description="Type in the database")
    forja_type: str = Field(description="Type of the Bronze column")
    nullable: bool = True


class DatabaseTable(BaseModel):
    schema_name: str
    name: str
    kind: Literal["table", "view"]
    estimated_rows: int | None = None
    columns: list[DatabaseColumn]
    primary_key: list[str] = Field(default_factory=list)
    cursor_candidates: list[CursorCandidate] = Field(default_factory=list)
    suggested_cursor: str | None = None
    source_id: str | None = Field(default=None, description="Already imported as this source")


class DatabaseExploration(BaseModel):
    connection_id: str
    schemas: list[str]
    tables: list[DatabaseTable]
    truncated: bool = False


class TableSelection(BaseModel):
    model_config = ConfigDict(extra="forbid")

    schema_name: str = Field(min_length=1, max_length=128)
    table: str = Field(min_length=1, max_length=128)
    mode: LoadMode = LoadMode.FULL
    cursor_column: str | None = Field(default=None, max_length=128)

    @model_validator(mode="after")
    def _cursor(self) -> TableSelection:
        if self.mode is LoadMode.INCREMENTAL and not self.cursor_column:
            raise ValueError("incremental mode needs a cursor column")
        return self


class EndpointSelection(BaseModel):
    model_config = ConfigDict(extra="forbid")

    endpoint: str = Field(min_length=1, max_length=63)
    include_children: bool = Field(default=True, description="Nested lists as child tables")


class ImportRequest(BaseModel):
    """Tables or endpoints to load into sources; the first load starts right away."""

    model_config = ConfigDict(extra="forbid")

    tables: list[TableSelection] = Field(default_factory=list, max_length=500)
    endpoints: list[EndpointSelection] = Field(default_factory=list, max_length=100)
    load_now: bool = True


# --- REST API preview --------------------------------------------------------------------


class PreviewColumn(BaseModel):
    name: str
    type: str


class PreviewTable(BaseModel):
    name: str
    path: list[str] = Field(description="Nested lists leading to this table, outer first")
    columns: list[PreviewColumn]
    rows: list[dict[str, Any]] = Field(description="First records, flattened")
    record_count: int
    parent: str | None = None
    parent_key: str | None = Field(default=None, description="Column of this table linking it")


class ProposedRelation(BaseModel):
    from_table: str
    from_column: str
    to_table: str
    to_column: str


class ApiPreview(BaseModel):
    endpoint: str
    url: str
    status_code: int
    records_path: str | None
    records_path_detected: bool
    record_count: int
    has_next_page: bool
    tables: list[PreviewTable]
    relations: list[ProposedRelation]
    duration_ms: int


class ApiPreviewRequest(BaseModel):
    """A configuration, saved or not, and the endpoint to try."""

    model_config = ConfigDict(extra="forbid")

    params: dict[str, Any]
    secrets: dict[str, SecretStr] = Field(default_factory=dict)
    connection_id: str | None = Field(
        default=None, description="Use the saved secrets of this connection when not given"
    )
    endpoint: str | None = Field(default=None, description="Name; the first endpoint if empty")


def validate_name_path(value: str) -> str:
    """A dotted JSON path (a.b.c) given by the user."""
    if not _PATH_RE.fullmatch(value):
        raise ValueError(f"invalid path: {value!r}")
    return value


def valid_identifier(value: str) -> bool:
    return bool(_NAME_RE.fullmatch(value))
