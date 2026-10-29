"""REST API connector: authentication, pagination, retries, rate limit and flattening.

Built on httpx rather than dlt's rest_api source (docs/decisions.md): every request,
page and redirect goes through :class:`~forja_core.connectors.ssrf.UrlGuard`, and the
records land in Bronze like any other source.

Records are flattened: nested objects become ``a.b`` columns, nested lists of objects
(or of values) become child tables linked to their parent by a key column, named
``<parent>_<key>``, which the relation detector then proposes as a relation.
"""

from __future__ import annotations

import base64
import email.utils
import hashlib
import json
import time
from collections.abc import Callable, Iterator
from dataclasses import dataclass, field
from pathlib import Path
from typing import IO, Any
from urllib.parse import urljoin, urlsplit

import httpx

from forja_core.connectors.models import (
    ApiAuth,
    AuthKind,
    Endpoint,
    PaginationKind,
    PreviewColumn,
    PreviewTable,
    ProposedRelation,
    RestApiParams,
)
from forja_core.connectors.ssrf import UrlGuard
from forja_core.connectors.vault import redact
from forja_core.errors import ForjaError
from forja_core.logging import get_logger
from forja_core.utils import slugify

log = get_logger(__name__)

RECORD_KEYS = ("data", "items", "results", "records", "value", "entries", "objects", "rows")
MAX_DEPTH = 3
MAX_REDIRECTS = 5
MAX_BACKOFF_SECONDS = 60.0
KEY_COLUMN = "_forja_key"
POSITION_COLUMN = "_position"


class ApiError(ForjaError):
    code = "api_error"


def get_path(document: Any, path: str | None) -> Any:
    if not path:
        return document
    current = document
    for part in path.split("."):
        if isinstance(current, dict):
            current = current.get(part)
        elif isinstance(current, list) and part.isdigit() and int(part) < len(current):
            current = current[int(part)]
        else:
            return None
    return current


def find_records(document: Any, path: str | None) -> tuple[list[Any], str | None, bool]:
    """Records of a page, the path they were found at and whether it was detected."""
    if path:
        found = get_path(document, path)
        if found is None:
            return [], path, False
        return (found if isinstance(found, list) else [found]), path, False
    if isinstance(document, list):
        return document, None, True
    if isinstance(document, dict):
        lists = {k: v for k, v in document.items() if isinstance(v, list)}
        for key in RECORD_KEYS:
            if key in lists:
                return lists[key], key, True
        for key, value in lists.items():
            if value and all(isinstance(item, dict) for item in value):
                return value, key, True
        nested = sorted(
            (k for k, v in document.items() if isinstance(v, dict)),
            key=lambda k: (k not in RECORD_KEYS, k),
        )
        for key in nested:
            records, inner, _ = find_records(document[key], None)
            if inner is not None:
                return records, f"{key}.{inner}", True
        return [document], None, True
    return [{"value": document}], None, True


def _comparable(value: str) -> tuple[int, float | str]:
    try:
        return (0, float(value))
    except ValueError:
        return (1, value)


@dataclass
class Clock:
    """Time sources of the client, replaced in tests."""

    sleep: Callable[[float], None] = time.sleep
    monotonic: Callable[[], float] = time.monotonic


@dataclass
class PageResult:
    url: str
    status_code: int
    records: list[Any]
    records_path: str | None
    detected: bool
    has_next: bool


@dataclass
class RestClient:
    params: RestApiParams
    secrets: dict[str, str]
    guard: UrlGuard
    transport: httpx.BaseTransport | None = None
    clock: Clock = field(default_factory=Clock)
    requests_made: int = 0
    _client: httpx.Client | None = None
    _token: str | None = None
    _token_expires: float = 0.0
    _last_request: float | None = None

    def __enter__(self) -> RestClient:
        self._client = httpx.Client(
            transport=self.transport,
            timeout=self.params.timeout_seconds,
            follow_redirects=False,
            headers={"User-Agent": "Forja", "Accept": "application/json", **self.params.headers},
        )
        return self

    def __exit__(self, *_exc: object) -> None:
        if self._client is not None:
            self._client.close()
            self._client = None

    @property
    def client(self) -> httpx.Client:
        if self._client is None:
            raise RuntimeError("use RestClient as a context manager")
        return self._client

    # --- requests ---------------------------------------------------------------------

    def _same_origin(self, url: str) -> bool:
        base, other = urlsplit(self.params.base_url), urlsplit(url)
        return (base.scheme, base.netloc.lower()) == (other.scheme, other.netloc.lower())

    def _throttle(self) -> None:
        rate = self.params.rate_limit_per_second
        if rate is None:
            return
        now = self.clock.monotonic()
        if self._last_request is not None:
            wait = 1 / rate - (now - self._last_request)
            if wait > 0:
                self.clock.sleep(wait)
                now = self.clock.monotonic()
        self._last_request = now

    def _retry_after(self, response: httpx.Response) -> float | None:
        header = response.headers.get("retry-after")
        if not header:
            return None
        try:
            return max(0.0, float(header))
        except ValueError:
            pass
        try:
            parsed = email.utils.parsedate_to_datetime(header)
        except (TypeError, ValueError):
            return None
        return max(0.0, float(parsed.timestamp()) - time.time())

    def _backoff(self, attempt: int) -> float:
        return min(MAX_BACKOFF_SECONDS, self.params.backoff_seconds * float(2**attempt))

    def _auth(self, request_params: dict[str, Any], headers: dict[str, str]) -> None:
        auth: ApiAuth = self.params.auth
        match auth.kind:
            case AuthKind.API_KEY:
                key = self.secrets.get("api_key", "")
                if auth.key_in == "header":
                    headers[auth.key_name or "X-API-Key"] = key
                else:
                    request_params[auth.key_name or "api_key"] = key
            case AuthKind.BEARER:
                headers["Authorization"] = f"Bearer {self.secrets.get('token', '')}"
            case AuthKind.BASIC:
                pair = f"{auth.username or ''}:{self.secrets.get('password', '')}"
                headers["Authorization"] = "Basic " + base64.b64encode(pair.encode()).decode()
            case AuthKind.OAUTH2:
                headers["Authorization"] = f"Bearer {self._oauth_token()}"
            case AuthKind.NONE:
                pass

    def _oauth_token(self, *, renew: bool = False) -> str:
        if self._token and not renew and self.clock.monotonic() < self._token_expires:
            return self._token
        auth = self.params.auth
        url = auth.token_url or ""
        self.guard.check(url)
        data = {"grant_type": "client_credentials"}
        if auth.scope:
            data["scope"] = auth.scope
        response = self._send(
            "POST",
            url,
            data=data,
            auth=httpx.BasicAuth(auth.client_id or "", self.secrets.get("client_secret", "")),
            authenticate=False,
        )
        if response.status_code >= 400:
            raise ApiError(
                f"the token endpoint answered {response.status_code}",
                details={"status": response.status_code},
            )
        try:
            payload = response.json()
            token = str(payload["access_token"])
        except (ValueError, KeyError, TypeError) as exc:
            raise ApiError("the token endpoint gave no access_token") from exc
        expires = float(payload.get("expires_in") or 3600)
        self._token = token
        self._token_expires = self.clock.monotonic() + max(0.0, expires - 30)
        return token

    def _send(
        self,
        method: str,
        url: str,
        *,
        params: dict[str, Any] | None = None,
        data: dict[str, str] | None = None,
        auth: httpx.Auth | None = None,
        authenticate: bool = True,
    ) -> httpx.Response:
        """One logical request: SSRF checks, redirects, retries on 429, 5xx and network
        errors with exponential backoff (Retry-After honoured)."""
        attempt = 0
        renewed = False
        while True:
            current, redirects = url, 0
            request_params = dict(params or {})
            try:
                while True:
                    self.guard.check(current)
                    headers: dict[str, str] = {}
                    if authenticate and self._same_origin(current):
                        self._auth(request_params, headers)
                    self._throttle()
                    self.requests_made += 1
                    request = self.client.build_request(
                        method,
                        current,
                        params=request_params or None,
                        data=data,
                        headers=headers,
                    )
                    # Streamed: the peer is checked before the body is read.
                    response = self.client.send(
                        request,
                        stream=True,
                        auth=auth if auth is not None else httpx.USE_CLIENT_DEFAULT,
                    )
                    try:
                        self._check_peer(current, response)
                        response.read()
                    finally:
                        response.close()
                    if response.is_redirect and redirects < MAX_REDIRECTS:
                        location = response.headers.get("location", "")
                        current = urljoin(current, location)
                        request_params = {}
                        redirects += 1
                        continue
                    break
            except (httpx.TimeoutException, httpx.TransportError) as exc:
                if attempt >= self.params.max_retries:
                    raise ApiError(
                        f"the API cannot be reached: {type(exc).__name__}",
                        details={"url": _public(url)},
                    ) from exc
                self.clock.sleep(self._backoff(attempt))
                attempt += 1
                continue
            if (
                response.status_code == 401
                and authenticate
                and self.params.auth.kind is AuthKind.OAUTH2
                and not renewed
            ):
                self._oauth_token(renew=True)
                renewed = True
                continue
            if response.status_code == 429 or response.status_code >= 500:
                if attempt >= self.params.max_retries:
                    raise ApiError(
                        f"the API answered {response.status_code} after {attempt + 1} attempt(s)",
                        details={"status": response.status_code, "url": _public(url)},
                    )
                wait = self._retry_after(response)
                self.clock.sleep(
                    min(MAX_BACKOFF_SECONDS, wait) if wait is not None else self._backoff(attempt)
                )
                attempt += 1
                continue
            return response

    def _check_peer(self, url: str, response: httpx.Response) -> None:
        stream = response.extensions.get("network_stream")
        if stream is None:
            return
        try:
            address = stream.get_extra_info("server_addr")
        except OSError:
            return
        host = urlsplit(url).hostname or ""
        self.guard.check_peer(host, address[0] if address else None)

    def send(self, method: str, url: str) -> httpx.Response:
        """One request with the connection's authentication, retries and checks."""
        return self._send(method, url)

    def get_json(self, url: str, params: dict[str, Any]) -> tuple[httpx.Response, Any]:
        response = self._send("GET", url, params=params)
        if response.status_code >= 400:
            raise ApiError(
                f"the API answered {response.status_code} for {_public(url)}",
                details={"status": response.status_code},
            )
        try:
            return response, response.json()
        except ValueError as exc:
            raise ApiError(f"{_public(url)} did not answer JSON") from exc

    # --- pages ------------------------------------------------------------------------

    def pages(self, endpoint: Endpoint, *, since: str | None = None) -> Iterator[PageResult]:
        """Every page of an endpoint, following its pagination."""
        pagination = self.params.pagination
        url = self.params.base_url + endpoint.path
        base_params: dict[str, Any] = dict(endpoint.params)
        if endpoint.incremental is not None:
            value = since or endpoint.incremental.initial_value
            if value:
                base_params[endpoint.incremental.param] = value
        page = pagination.start_page
        offset = 0
        cursor: str | None = None
        next_url: str | None = None
        for _ in range(pagination.max_pages):
            params = dict(base_params)
            match pagination.kind:
                case PaginationKind.PAGE_NUMBER:
                    params[pagination.page_param] = page
                    if pagination.size_param and pagination.page_size:
                        params[pagination.size_param] = pagination.page_size
                case PaginationKind.OFFSET:
                    params[pagination.offset_param] = offset
                    params[pagination.limit_param] = pagination.page_size or 100
                case PaginationKind.CURSOR:
                    if cursor is not None:
                        params[pagination.cursor_param] = cursor
                    if pagination.size_param and pagination.page_size:
                        params[pagination.size_param] = pagination.page_size
                case _:
                    pass
            if next_url is not None:
                current, params = next_url, {}
            else:
                current = url
            response, document = self.get_json(current, params)
            records, path, detected = find_records(document, endpoint.records_path)
            following: str | None = None
            more = False
            match pagination.kind:
                case PaginationKind.PAGE_NUMBER:
                    size = pagination.page_size
                    more = bool(records) and (size is None or len(records) >= size)
                    page += 1
                case PaginationKind.OFFSET:
                    more = bool(records) and len(records) >= (pagination.page_size or 100)
                    offset += len(records)
                case PaginationKind.CURSOR:
                    value = get_path(document, pagination.cursor_path)
                    cursor = None if value in (None, "") else str(value)
                    more = cursor is not None and bool(records)
                case PaginationKind.LINK_HEADER:
                    link = response.links.get("next", {}).get("url")
                    following = urljoin(str(response.url), link) if link else None
                    more = following is not None
                case PaginationKind.NEXT_URL:
                    value = get_path(document, pagination.next_url_path)
                    following = urljoin(str(response.url), str(value)) if value else None
                    more = following is not None and bool(records)
                case PaginationKind.NONE:
                    more = False
            if following is not None and not self._same_origin(following):
                raise ApiError(
                    "the next page is on another site; Forja only follows pages of the API",
                    details={"next": _public(following)},
                )
            yield PageResult(
                url=_public(str(response.url)),
                status_code=response.status_code,
                records=records,
                records_path=path,
                detected=detected,
                has_next=more,
            )
            if not more:
                return
            next_url = following
        log.warning("api_max_pages_reached", endpoint=endpoint.name, pages=pagination.max_pages)


def _public(url: str) -> str:
    """The URL without its query string (which may carry an API key)."""
    parts = urlsplit(url)
    return f"{parts.scheme}://{parts.netloc}{parts.path}"


# --- flattening --------------------------------------------------------------------------


def flatten_record(record: Any, prefix: str = "") -> tuple[dict[str, Any], dict[str, list[Any]]]:
    """Scalar columns of a record and its nested lists, by column name."""
    if not isinstance(record, dict):
        return {f"{prefix}value" if prefix else "value": record}, {}
    flat: dict[str, Any] = {}
    lists: dict[str, list[Any]] = {}
    for key, value in record.items():
        name = f"{prefix}{key}"
        if isinstance(value, dict) and value:
            inner, inner_lists = flatten_record(value, prefix=f"{name}.")
            flat.update(inner)
            lists.update(inner_lists)
        elif isinstance(value, list):
            lists[name] = value
        elif isinstance(value, dict):
            flat[name] = None
        else:
            flat[name] = value
    return flat, lists


def record_key(record: Any, primary_key: str | None) -> tuple[str, Any]:
    """Column and value identifying a record: its key field, else a content hash."""
    if primary_key:
        value = get_path(record, primary_key)
        if value is not None:
            return primary_key, value
    if isinstance(record, dict) and record.get("id") is not None:
        return "id", record["id"]
    digest = hashlib.sha256(
        json.dumps(record, sort_keys=True, ensure_ascii=False, default=str).encode()
    ).hexdigest()[:32]
    return KEY_COLUMN, digest


@dataclass
class TableWriter:
    """Flattened rows of one table, written as JSON lines to a scratch file."""

    name: str
    path: list[str]
    file: Path
    parent: str | None = None
    parent_key: str | None = None
    rows: int = 0
    sample: list[dict[str, Any]] = field(default_factory=list)
    columns: dict[str, str] = field(default_factory=dict)
    _handle: IO[str] | None = None

    def write(self, row: dict[str, Any], sample_size: int) -> None:
        if self._handle is None:
            self.file.parent.mkdir(parents=True, exist_ok=True)
            self._handle = self.file.open("w", encoding="utf-8")
        self._handle.write(json.dumps(row, ensure_ascii=False, default=str) + "\n")
        self.rows += 1
        for key, value in row.items():
            if value is not None:
                self.columns[key] = _json_type(value)
            elif key not in self.columns:
                self.columns[key] = "null"
        if len(self.sample) < sample_size:
            self.sample.append(row)

    def close(self) -> None:
        if self._handle is not None:
            self._handle.close()
            self._handle = None


def _json_type(value: Any) -> str:
    if isinstance(value, bool):
        return "boolean"
    if isinstance(value, int):
        return "integer"
    if isinstance(value, float):
        return "number"
    return "string"


@dataclass
class Flattener:
    """Spreads the records of an endpoint over the endpoint's table and child tables."""

    endpoint: Endpoint
    directory: Path
    include_children: bool = True
    sample_size: int = 5
    tables: dict[tuple[str, ...], TableWriter] = field(default_factory=dict)

    def _table(
        self, path: tuple[str, ...], parent: TableWriter | None, link: str | None
    ) -> TableWriter:
        writer = self.tables.get(path)
        if writer is None:
            name = "__".join([self.endpoint.name, *(slugify(p, default="items") for p in path)])
            writer = TableWriter(
                name=name,
                path=list(path),
                file=self.directory / f"{name}.jsonl",
                parent=parent.name if parent else None,
                parent_key=link,
            )
            self.tables[path] = writer
        return writer

    def add(self, records: list[Any]) -> None:
        root = self._table((), None, None)
        for record in records:
            self._add(record, (), root, 0, self.endpoint.primary_key)

    def _add(
        self,
        record: Any,
        path: tuple[str, ...],
        table: TableWriter,
        depth: int,
        primary_key: str | None,
    ) -> None:
        flat, lists = flatten_record(record)
        key_column, key_value = record_key(record, primary_key)
        row: dict[str, Any] = {}
        if key_column == KEY_COLUMN:
            row[KEY_COLUMN] = key_value
        row.update(flat)
        for name, items in lists.items():
            if not self.include_children or depth >= MAX_DEPTH:
                row[name] = json.dumps(items, ensure_ascii=False, default=str)
        table.write(row, self.sample_size)
        if not self.include_children or depth >= MAX_DEPTH:
            return
        for name, items in lists.items():
            child_path = (*path, name)
            parent_label = table.name if depth == 0 else table.name.split("__")[-1]
            link_column = (
                f"{slugify(parent_label, default='parent')}_{slugify(key_column, default='key')}"
            )
            child = self._table(child_path, table, link_column)
            for position, item in enumerate(items):
                # The parent key is part of the record, so identical items of two parents
                # keep distinct keys.
                values = item if isinstance(item, dict) else {"value": item}
                enriched = {link_column: key_value, POSITION_COLUMN: position, **values}
                self._add(enriched, child_path, child, depth + 1, None)

    def close(self) -> None:
        for writer in self.tables.values():
            writer.close()

    def preview(self) -> tuple[list[PreviewTable], list[ProposedRelation]]:
        tables: list[PreviewTable] = []
        relations: list[ProposedRelation] = []
        for writer in self.tables.values():
            tables.append(
                PreviewTable(
                    name=writer.name,
                    path=writer.path,
                    columns=[PreviewColumn(name=n, type=t) for n, t in writer.columns.items()],
                    rows=writer.sample,
                    record_count=writer.rows,
                    parent=writer.parent,
                    parent_key=writer.parent_key,
                )
            )
            if writer.parent and writer.parent_key:
                parent = next(w for w in self.tables.values() if w.name == writer.parent)
                target = _target_column(parent, writer.parent_key)
                relations.append(
                    ProposedRelation(
                        from_table=writer.name,
                        from_column=writer.parent_key,
                        to_table=parent.name,
                        to_column=target,
                    )
                )
        return tables, relations


def _target_column(parent: TableWriter, link: str) -> str:
    for candidate in ("id", KEY_COLUMN):
        if candidate in parent.columns and link.endswith(f"_{slugify(candidate, default='key')}"):
            return candidate
    return next((c for c in parent.columns if link.endswith(f"_{slugify(c)}")), "id")


def newest_cursor(rows: Iterator[str], current: str | None) -> str | None:
    best = current
    for value in rows:
        if best is None or _comparable(value) > _comparable(best):
            best = value
    return best


def safe_message(exc: Exception, secrets: dict[str, str]) -> str:
    return redact(str(exc), secrets)
