"""REST API connector: pagination, authentication, retries, SSRF, flattening, loads."""

from __future__ import annotations

import json
import logging
from collections.abc import Iterator
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

from forja_core.config import Settings
from forja_core.connectors.models import (
    ApiAuth,
    AuthKind,
    Endpoint,
    Pagination,
    PaginationKind,
    RestApiParams,
)
from forja_core.connectors.rest import ApiError, Clock, Flattener, RestClient, find_records
from forja_core.connectors.ssrf import BlockedAddressError, UrlGuard
from tests.auth import api_client
from tests.fake_api import FakeApiState, make_orders, serve

LOCAL = UrlGuard(allowed=("127.0.0.1",))


class RecordingClock(Clock):
    def __init__(self) -> None:
        self.slept: list[float] = []
        self.now = 0.0
        super().__init__(sleep=self._sleep, monotonic=lambda: self.now)

    def _sleep(self, seconds: float) -> None:
        self.slept.append(seconds)
        self.now += seconds


def _params(base: str, kind: PaginationKind, path: str, **pagination: Any) -> RestApiParams:
    return RestApiParams(
        base_url=base,
        pagination=Pagination(kind=kind, page_size=3, **pagination),
        endpoints=[Endpoint(name="orders", path=path)],
        backoff_seconds=0.5,
    )


def _all_ids(params: RestApiParams, secrets: dict[str, str] | None = None) -> list[int]:
    with RestClient(params=params, secrets=secrets or {}, guard=LOCAL) as client:
        return [r["id"] for page in client.pages(params.endpoints[0]) for r in page.records]


@pytest.fixture
def api() -> Iterator[tuple[str, FakeApiState]]:
    with serve() as running:
        yield running


@pytest.mark.parametrize(
    ("kind", "path", "options"),
    [
        (PaginationKind.NONE, "/none/orders", {}),
        (PaginationKind.PAGE_NUMBER, "/page/orders", {}),
        (
            PaginationKind.OFFSET,
            "/offset/orders",
            {"offset_param": "offset", "limit_param": "limit"},
        ),
        (PaginationKind.CURSOR, "/cursor/orders", {"cursor_path": "next_cursor"}),
        (PaginationKind.LINK_HEADER, "/link/orders", {}),
        (PaginationKind.NEXT_URL, "/next/orders", {"next_url_path": "next"}),
    ],
)
def test_every_pagination_reads_every_record(
    api: tuple[str, FakeApiState], kind: PaginationKind, path: str, options: dict[str, Any]
) -> None:
    base, state = api
    assert _all_ids(_params(base, kind, path, **options)) == list(range(1, 9))
    pages = [r for r in state.requests if r.startswith("GET")]
    assert len(pages) == (1 if kind is PaginationKind.NONE else 3)


@pytest.mark.parametrize(
    ("mode", "auth", "secrets"),
    [
        (
            "api_key_header",
            ApiAuth(kind=AuthKind.API_KEY, key_name="X-API-Key"),
            {"api_key": "secret-key-123"},
        ),
        (
            "api_key_query",
            ApiAuth(kind=AuthKind.API_KEY, key_name="api_key", key_in="query"),
            {"api_key": "secret-key-123"},
        ),
        ("bearer", ApiAuth(kind=AuthKind.BEARER), {"token": "secret-token-456"}),
        ("basic", ApiAuth(kind=AuthKind.BASIC, username="reader"), {"password": "secret-pass-789"}),
        (
            "oauth2",
            ApiAuth(
                kind=AuthKind.OAUTH2,
                token_url="http://127.0.0.1:{port}/v1/oauth/token",
                client_id="forja",
            ),
            {"client_secret": "secret-client-000"},
        ),
    ],
)
def test_every_authentication(mode: str, auth: ApiAuth, secrets: dict[str, str]) -> None:
    with serve(FakeApiState(auth=mode)) as (base, state):
        port = base.split(":")[2].split("/")[0]
        if auth.token_url:
            auth = auth.model_copy(update={"token_url": auth.token_url.format(port=port)})
        params = _params(base, PaginationKind.PAGE_NUMBER, "/page/orders").model_copy(
            update={"auth": auth}
        )
        assert _all_ids(params, secrets) == list(range(1, 9))
        with pytest.raises(ApiError, match="401"):
            _all_ids(params, dict.fromkeys(secrets, "wrong"))
        if mode == "oauth2":
            assert state.requests.count("POST /v1/oauth/token") >= 1


def test_429_and_5xx_are_retried_with_backoff(api: tuple[str, FakeApiState]) -> None:
    base, state = api
    state.failures = [429, 503, 500]
    clock = RecordingClock()
    params = _params(base, PaginationKind.NONE, "/none/orders")
    with RestClient(params=params, secrets={}, guard=LOCAL, clock=clock) as client:
        [page] = list(client.pages(params.endpoints[0]))
    assert len(page.records) == 8
    # Retry-After: 0 on the 429, then exponential backoff for the 5xx.
    assert clock.slept == [0.0, 1.0, 2.0]


def test_retries_give_up_with_a_clear_error(api: tuple[str, FakeApiState]) -> None:
    base, state = api
    state.failures = [503] * 10
    params = _params(base, PaginationKind.NONE, "/none/orders").model_copy(
        update={"max_retries": 2}
    )
    with (
        RestClient(params=params, secrets={}, guard=LOCAL, clock=RecordingClock()) as client,
        pytest.raises(ApiError, match="503 after 3 attempt"),
    ):
        list(client.pages(params.endpoints[0]))


def test_rate_limit_spaces_requests(api: tuple[str, FakeApiState]) -> None:
    base, _ = api
    clock = RecordingClock()
    params = _params(base, PaginationKind.PAGE_NUMBER, "/page/orders").model_copy(
        update={"rate_limit_per_second": 2}
    )
    with RestClient(params=params, secrets={}, guard=LOCAL, clock=clock) as client:
        list(client.pages(params.endpoints[0]))
    assert clock.slept == [0.5, 0.5]


def test_private_addresses_are_refused_by_default(api: tuple[str, FakeApiState]) -> None:
    base, state = api
    params = _params(base, PaginationKind.NONE, "/none/orders")
    with (
        RestClient(params=params, secrets={}, guard=UrlGuard()) as client,
        pytest.raises(BlockedAddressError, match="private or local"),
    ):
        list(client.pages(params.endpoints[0]))
    assert state.requests == []


@pytest.mark.parametrize(
    "url",
    [
        "http://127.0.0.1/",
        "http://localhost:8000/",
        "http://10.1.2.3/",
        "http://169.254.169.254/latest/meta-data/",
        "http://[::1]/",
        "http://[::ffff:127.0.0.1]/",
        "http://0.0.0.0/",
        "file:///etc/passwd",
        "http://user:pass@example.org/",
    ],
)
def test_ssrf_guard_blocks(url: str) -> None:
    with pytest.raises(BlockedAddressError):
        UrlGuard().check(url)


def test_ssrf_allowlist_accepts_hosts_and_ranges() -> None:
    def resolver(host: str, port: int) -> list[str]:
        return {"db.internal": ["10.0.0.7"], "api.example.org": ["93.184.216.34"]}[host]

    UrlGuard(resolver=resolver).check("https://api.example.org/v1")
    with pytest.raises(BlockedAddressError):
        UrlGuard(resolver=resolver).check("https://db.internal/")
    UrlGuard(allowed=("10.0.0.0/8",), resolver=resolver).check("https://db.internal/")
    UrlGuard(allowed=("db.internal",), resolver=resolver).check("https://db.internal/")


def test_connections_go_to_the_validated_address_only(api: tuple[str, FakeApiState]) -> None:
    # « rebind.invalid » exists in no DNS: the request can only reach the fake API through
    # the address the guard resolved and validated, once per request.
    base, state = api
    port = int(base.split(":")[2].split("/")[0])
    calls: list[str] = []

    def resolver(host: str, _port: int) -> list[str]:
        calls.append(host)
        return ["127.0.0.1"]

    guard = UrlGuard(allowed=("127.0.0.0/8",), resolver=resolver)
    params = _params(f"http://rebind.invalid:{port}/v1", PaginationKind.PAGE_NUMBER, "/page/orders")
    with RestClient(params=params, secrets={}, guard=guard) as client:
        ids = [r["id"] for page in client.pages(params.endpoints[0]) for r in page.records]
    assert ids == list(range(1, 9))
    assert calls == ["rebind.invalid"] * 3  # one resolution per request (three pages)
    assert len(state.requests) == 3


def test_dns_rebinding_cannot_reach_a_private_address(api: tuple[str, FakeApiState]) -> None:
    # The first resolution looks public; a second one, made by the connection itself,
    # would give the private address. The guard resolves once and connects there.
    base, state = api
    port = int(base.split(":")[2].split("/")[0])
    answers = iter([["93.184.216.34"], ["127.0.0.1"]])

    def resolver(host: str, _port: int) -> list[str]:
        return next(answers)

    guard = UrlGuard(resolver=resolver)
    params = _params(
        f"http://rebind.invalid:{port}/v1", PaginationKind.NONE, "/none/orders"
    ).model_copy(update={"max_retries": 0, "timeout_seconds": 1})
    with (
        RestClient(params=params, secrets={}, guard=guard) as client,
        pytest.raises(ApiError, match="cannot be reached"),
    ):
        list(client.pages(params.endpoints[0]))
    # The connection went to the validated public address (unreachable here), never to
    # the local fake API.
    assert state.requests == []


def test_redirect_to_a_private_address_is_refused(api: tuple[str, FakeApiState]) -> None:
    base, _ = api
    params = _params(base, PaginationKind.NONE, "/redirect/orders")
    with (
        RestClient(params=params, secrets={}, guard=LOCAL) as client,
        pytest.raises(BlockedAddressError, match="private or local"),
    ):
        list(client.pages(params.endpoints[0]))


def test_ipv4_mapped_ipv6_follows_the_ipv4_rules() -> None:
    def resolver(host: str, _port: int) -> list[str]:
        return ["::ffff:10.1.2.3"]

    with pytest.raises(BlockedAddressError):
        UrlGuard(resolver=resolver).check("http://mapped.example/")
    target = UrlGuard(allowed=("10.0.0.0/8",), resolver=resolver).check("http://mapped.example/")
    assert target.address == "::ffff:10.1.2.3"


def test_tls_is_verified_against_the_host_name() -> None:
    from forja_core.connectors.ssrf import PinnedTransport

    context = PinnedTransport()._pool._ssl_context
    assert context is not None
    assert context.check_hostname is True
    assert context.verify_mode.name == "CERT_REQUIRED"


def test_next_page_on_another_site_is_refused(api: tuple[str, FakeApiState]) -> None:
    base, _ = api
    params = _params(base, PaginationKind.NEXT_URL, "/elsewhere/orders", next_url_path="next")
    with (
        RestClient(params=params, secrets={}, guard=LOCAL) as client,
        pytest.raises(ApiError, match="another site"),
    ):
        list(client.pages(params.endpoints[0]))


def test_records_path_is_detected() -> None:
    assert find_records({"data": [{"a": 1}]}, None)[1:] == ("data", True)
    assert find_records({"meta": {}, "payload": {"items": [{"a": 1}]}}, None)[0] == [{"a": 1}]
    assert find_records([{"a": 1}], None)[1:] == (None, True)
    assert find_records({"x": {"y": [1, 2]}}, "x.y") == ([1, 2], "x.y", False)


def test_nested_lists_become_linked_child_tables(tmp_path: Path) -> None:
    flattener = Flattener(endpoint=Endpoint(name="orders", path="/orders"), directory=tmp_path)
    flattener.add(make_orders(4))
    flattener.close()
    tables, relations = flattener.preview()
    by_name = {t.name: t for t in tables}
    assert set(by_name) == {"orders", "orders__items", "orders__tags"}
    orders = by_name["orders"]
    assert {"id", "customer.name", "customer.city", "amount"} <= {c.name for c in orders.columns}
    assert "items" not in {c.name for c in orders.columns}
    items = by_name["orders__items"]
    assert items.parent == "orders" and items.parent_key == "orders_id"
    assert items.record_count == sum(i % 3 for i in range(1, 5))
    assert {r["orders_id"] for r in items.rows} <= {1, 2, 3, 4}
    [tag] = by_name["orders__tags"].rows
    assert {k: tag[k] for k in ("orders_id", "_position", "value")} == {
        "orders_id": 4,
        "_position": 0,
        "value": "vip",
    }
    assert {(r.from_table, r.from_column, r.to_table, r.to_column) for r in relations} == {
        ("orders__items", "orders_id", "orders", "id"),
        ("orders__tags", "orders_id", "orders", "id"),
    }


# --- through the API ----------------------------------------------------------------------


@pytest.fixture
def local_settings(settings: Settings) -> Settings:
    return settings.model_copy(
        update={
            "job_runner": "inline",
            "scheduler_enabled": False,
            "connector_allowed_hosts": ["127.0.0.1"],
        }
    )


@pytest.fixture
def client(local_settings: Settings) -> Iterator[TestClient]:
    with api_client(local_settings) as test_client:
        yield test_client


def _project(client: TestClient) -> str:
    response = client.post("/projects", json={"name": "API"})
    assert response.status_code == 201, response.text
    project_id: str = response.json()["id"]
    return project_id


def _api_connection(client: TestClient, project_id: str, base: str) -> dict[str, Any]:
    body = {
        "name": "Boutique",
        "type": "rest_api",
        "params": {
            "base_url": base,
            "auth": {"kind": "bearer"},
            "pagination": {"kind": "page_number", "page_size": 3},
            "endpoints": [
                {
                    "name": "orders",
                    "path": "/page/orders",
                    "incremental": {"param": "since", "cursor_field": "updated_at"},
                }
            ],
        },
        "secrets": {"token": "secret-token-456"},
    }
    response = client.post(f"/projects/{project_id}/connections", json=body)
    assert response.status_code == 201, response.text
    connection: dict[str, Any] = response.json()
    return connection


def test_api_connection_preview_import_and_incremental_load(
    client: TestClient, caplog: pytest.LogCaptureFixture
) -> None:
    caplog.set_level(logging.DEBUG)
    with serve(FakeApiState(auth="bearer")) as (base, state):
        project_id = _project(client)
        connection = _api_connection(client, project_id, base)
        assert connection["secrets_set"] == ["token"]
        assert "secret-token-456" not in json.dumps(connection)

        preview = client.post(
            f"/projects/{project_id}/connections/preview",
            json={"params": connection["params"], "connection_id": connection["id"]},
        )
        assert preview.status_code == 200, preview.text
        body = preview.json()
        assert body["records_path"] == "data" and body["records_path_detected"] is True
        assert body["record_count"] == 3 and body["has_next_page"] is True
        assert {t["name"] for t in body["tables"]} >= {"orders", "orders__items"}
        assert body["relations"][0]["to_column"] == "id"

        imported = client.post(
            f"/connections/{connection['id']}/import", json={"endpoints": [{"endpoint": "orders"}]}
        )
        assert imported.status_code == 201, imported.text
        run = imported.json()["run"]
        assert run["status"] == "succeeded", run
        assert run["metrics"]["rows_loaded"] >= 8

        sources = {s["name"]: s for s in client.get(f"/projects/{project_id}/sources").json()}
        assert {"orders", "orders__items", "orders__tags"} <= set(sources)
        orders = sources["orders"]
        assert orders["format"] == "api" and orders["row_count"] == 8
        assert orders["origin"]["connection_name"] == "Boutique"
        assert orders["origin"]["mode"] == "incremental"

        # Two new orders, one updated: the second load only asks for what changed.
        state.orders += make_orders(2, start=20)
        state.requests.clear()
        again = client.post(f"/connections/{connection['id']}/load", json={})
        assert again.status_code == 202, again.text
        assert again.json()["status"] == "succeeded", again.json()
        assert all("since=2026-01-" in r for r in state.requests if "/page/orders" in r)
        loads = {m["object"]: m for m in again.json()["metrics"]["loads"]}
        assert loads["orders"]["rows"] == 2
        refreshed = client.get(f"/sources/{orders['id']}").json()
        assert refreshed["version"] == 2 and refreshed["row_count"] == 2

        # Nothing new: no version is created.
        third = client.post(f"/connections/{connection['id']}/load", json={}).json()
        assert {m["skipped"] for m in third["metrics"]["loads"]} == {"aucune nouveauté"}
        assert client.get(f"/sources/{orders['id']}").json()["version"] == 2

    logs = caplog.text + json.dumps(client.get("/audit").json())
    assert "secret-token-456" not in logs


def test_wrong_credentials_are_reported_without_the_secret(client: TestClient) -> None:
    with serve(FakeApiState(auth="bearer", token="right")) as (base, _):
        project_id = _project(client)
        connection = _api_connection(client, project_id, base)
        tested = client.post(f"/connections/{connection['id']}/test")
        assert tested.status_code == 200
        assert tested.json()["ok"] is False and "401" in tested.json()["message"]
        assert "secret-token-456" not in tested.text


def test_private_api_needs_the_administrators_allowlist(settings: Settings) -> None:
    strict = settings.model_copy(update={"job_runner": "inline", "scheduler_enabled": False})
    with api_client(strict) as client, serve() as (base, _):
        project_id = _project(client)
        refused = client.post(
            f"/projects/{project_id}/connections",
            json={"name": "Local", "type": "rest_api", "params": {"base_url": base}},
        )
        assert refused.status_code == 422, refused.text
        assert refused.json()["error"]["code"] == "address_not_allowed"

        allowed = client.put("/settings/connectors", json={"allowed_hosts": ["127.0.0.0/8"]})
        assert allowed.status_code == 200, allowed.text
        created = client.post(
            f"/projects/{project_id}/connections",
            json={"name": "Local", "type": "rest_api", "params": {"base_url": base}},
        )
        assert created.status_code == 201, created.text


def test_lookback_reads_late_records_once(client: TestClient) -> None:
    """A record committed late, with a change date just before the cursor, is caught by
    the lookback window; the records read again are not loaded twice."""
    with serve(FakeApiState(auth="bearer")) as (base, state):
        project_id = _project(client)
        connection = _api_connection(client, project_id, base)
        params = connection["params"]
        params["endpoints"][0]["incremental"]["lookback_minutes"] = 180
        assert (
            client.patch(f"/connections/{connection['id']}", json={"params": params}).status_code
            == 200
        )
        first = client.post(
            f"/connections/{connection['id']}/import", json={"endpoints": [{"endpoint": "orders"}]}
        ).json()["run"]
        assert first["status"] == "succeeded", first["error"]
        # Late: changed one hour before the newest record (2026-01-01T08:00Z), visible now.
        late = make_orders(1, start=50)[0] | {"updated_at": "2026-01-01T07:00:00Z", "items": []}
        state.orders.append(late)
        state.orders += make_orders(1, start=9)
        again = client.post(f"/connections/{connection['id']}/load", json={}).json()
        assert again["status"] == "succeeded", again["error"]
        assert all(
            "since=2026-01-01T05%3A00%3A00Z" in r or "since=2026-01-01T05:00:00Z" in r
            for r in state.requests
            if r.startswith("GET /v1/page/orders") and "since" in r
        )
        loads = {m["object"]: m for m in again["metrics"]["loads"]}
        orders = client.get(f"/sources/{loads['orders']['source_id']}/versions").json()
        assert orders[-1]["row_count"] == 2  # the late record and the new one, nothing twice
        third = client.post(f"/connections/{connection['id']}/load", json={}).json()
        assert {m["skipped"] for m in third["metrics"]["loads"] if m["object"] == "orders"} == {
            "aucune nouveauté"
        }


def test_rewind_text_moves_the_cursor_back() -> None:
    from forja_core.connectors.service import rewind_text

    assert rewind_text("2026-01-01T08:00:00Z", 90, 0) == "2026-01-01T06:30:00Z"
    assert rewind_text("2026-01-01T08:00:00+01:00", 30, 0) == "2026-01-01T07:30:00+01:00"
    assert rewind_text("1250", 0, 50) == "1200"
    assert rewind_text("abc", 30, 5) == "abc"
