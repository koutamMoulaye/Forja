"""A fake REST API for the connector tests: every pagination and authentication kind,
nested records, rate limiting (429) and server errors (5xx) on demand.

    uv run python -m tests.fake_api --port 8765          # for the end-to-end tests

Records are orders with a customer object, an ``items`` list of objects and a ``tags``
list of strings. ``since`` filters on ``updated_at`` (incremental loads).

Routes (prefix ``/v1``):

- ``/none/orders``: every record, a bare JSON list
- ``/page/orders?page=&per_page=``: ``{"data": [...], "meta": {"page": n}}``
- ``/offset/orders?offset=&limit=``: ``{"results": [...], "total": n}``
- ``/cursor/orders?cursor=&per_page=``: ``{"items": [...], "next_cursor": "..."}``
- ``/link/orders?page=``: a list, the next page in the ``Link`` header
- ``/next/orders?page=``: ``{"records": [...], "next": "<absolute url>"}``
- ``/oauth/token``: client credentials grant
"""

from __future__ import annotations

import argparse
import base64
import json
import threading
from collections.abc import Iterator
from contextlib import contextmanager
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any
from urllib.parse import parse_qs, urlsplit

PAGE_SIZE = 3
TOKEN = "fake-access-token"


def make_orders(count: int, *, start: int = 1) -> list[dict[str, Any]]:
    return [
        {
            "id": i,
            "updated_at": (datetime(2026, 1, 1) + timedelta(hours=i)).isoformat() + "Z",
            "status": "paid" if i % 2 else "pending",
            "amount": round(10.5 * i, 2),
            "customer": {"name": f"Client {i}", "city": "Lyon" if i % 3 else "Paris"},
            "items": [{"sku": f"SKU-{i}-{n}", "qty": n + 1} for n in range(i % 3)],
            "tags": ["vip"] if i % 4 == 0 else [],
        }
        for i in range(start, start + count)
    ]


@dataclass
class FakeApiState:
    orders: list[dict[str, Any]] = field(default_factory=lambda: make_orders(8))
    auth: str = "none"  # none, api_key_header, api_key_query, bearer, basic, oauth2
    api_key: str = "secret-key-123"
    token: str = "secret-token-456"
    username: str = "reader"
    password: str = "secret-pass-789"
    client_id: str = "forja"
    client_secret: str = "secret-client-000"
    failures: list[int] = field(default_factory=list)
    requests: list[str] = field(default_factory=list)
    lock: threading.Lock = field(default_factory=threading.Lock)

    def next_failure(self) -> int | None:
        with self.lock:
            return self.failures.pop(0) if self.failures else None


def _authorized(
    state: FakeApiState, handler: BaseHTTPRequestHandler, query: dict[str, str]
) -> bool:
    header = handler.headers.get("Authorization", "")
    match state.auth:
        case "none":
            return True
        case "api_key_header":
            return handler.headers.get("X-API-Key") == state.api_key
        case "api_key_query":
            return query.get("api_key") == state.api_key
        case "bearer":
            return header == f"Bearer {state.token}"
        case "basic":
            expected = base64.b64encode(f"{state.username}:{state.password}".encode()).decode()
            return header == f"Basic {expected}"
        case "oauth2":
            return header == f"Bearer {TOKEN}"
    return False


def _handler(state: FakeApiState) -> type[BaseHTTPRequestHandler]:
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *_args: Any) -> None:
            return

        def _send(self, status: int, body: Any, headers: dict[str, str] | None = None) -> None:
            data = json.dumps(body).encode()
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(data)))
            for name, value in (headers or {}).items():
                self.send_header(name, value)
            self.end_headers()
            self.wfile.write(data)

        def do_POST(self) -> None:
            parts = urlsplit(self.path)
            length = int(self.headers.get("Content-Length") or 0)
            form = parse_qs(self.rfile.read(length).decode())
            state.requests.append(f"POST {parts.path}")
            if parts.path != "/v1/oauth/token":
                self._send(404, {"error": "not found"})
                return
            expected = base64.b64encode(f"{state.client_id}:{state.client_secret}".encode())
            if self.headers.get("Authorization") != f"Basic {expected.decode()}":
                self._send(401, {"error": "invalid_client"})
                return
            if form.get("grant_type") != ["client_credentials"]:
                self._send(400, {"error": "unsupported_grant_type"})
                return
            self._send(200, {"access_token": TOKEN, "token_type": "bearer", "expires_in": 3600})

        def do_GET(self) -> None:
            parts = urlsplit(self.path)
            query = {k: v[0] for k, v in parse_qs(parts.query).items()}
            state.requests.append(f"GET {parts.path}?{parts.query}")
            failure = state.next_failure()
            if failure is not None:
                headers = {"Retry-After": "0"} if failure == 429 else {}
                self._send(failure, {"error": "try again"}, headers)
                return
            if not _authorized(state, self, query):
                self._send(401, {"error": "unauthorized"})
                return
            records = state.orders
            if "since" in query:
                records = [r for r in records if r["updated_at"] > query["since"]]
            base = f"http://{self.headers.get('Host')}"
            kind = parts.path.split("/")[2] if parts.path.count("/") >= 3 else ""
            if not parts.path.endswith("/orders"):
                self._send(404, {"error": "not found"})
                return
            size = int(query.get("per_page") or query.get("limit") or PAGE_SIZE)
            match kind:
                case "none":
                    self._send(200, records)
                case "page":
                    page = int(query.get("page", "1"))
                    chunk = records[(page - 1) * size : page * size]
                    self._send(200, {"data": chunk, "meta": {"page": page}})
                case "offset":
                    offset = int(query.get("offset", "0"))
                    self._send(
                        200, {"results": records[offset : offset + size], "total": len(records)}
                    )
                case "cursor":
                    start = int(query.get("cursor") or 0)
                    chunk = records[start : start + size]
                    following = start + size if start + size < len(records) else None
                    self._send(
                        200,
                        {
                            "items": chunk,
                            "next_cursor": None if following is None else str(following),
                        },
                    )
                case "link" | "next":
                    page = int(query.get("page", "1"))
                    chunk = records[(page - 1) * size : page * size]
                    more = page * size < len(records)
                    url = f"{base}{parts.path}?page={page + 1}"
                    if kind == "link":
                        headers = {"Link": f'<{url}>; rel="next"'} if more else {}
                        self._send(200, chunk, headers)
                    else:
                        self._send(200, {"records": chunk, "next": url if more else None})
                case "elsewhere":
                    self._send(200, {"records": records[:1], "next": "http://example.org/x"})
                case "redirect":
                    # To the cloud metadata address: must never be followed.
                    self._send(302, {}, {"Location": "http://169.254.169.254/latest/meta-data/"})
                case _:
                    self._send(404, {"error": "not found"})

    return Handler


@contextmanager
def serve(state: FakeApiState | None = None, port: int = 0) -> Iterator[tuple[str, FakeApiState]]:
    """Run the fake API on 127.0.0.1 in a thread; yields its base URL and state."""
    state = state or FakeApiState()
    server = ThreadingHTTPServer(("127.0.0.1", port), _handler(state))
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        yield f"http://127.0.0.1:{server.server_address[1]}/v1", state
    finally:
        server.shutdown()
        server.server_close()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--orders", type=int, default=12)
    args = parser.parse_args()
    state = FakeApiState(orders=make_orders(args.orders), auth="bearer")
    server = ThreadingHTTPServer(("127.0.0.1", args.port), _handler(state))
    print(f"fake API on http://127.0.0.1:{args.port}/v1 (bearer {state.token})", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
