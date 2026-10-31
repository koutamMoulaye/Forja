"""Protection against server-side request forgery for REST API connections.

A connection makes the server send requests to an address chosen by a user: without
care, it could reach services that only the server sees (cloud metadata endpoints,
databases, the Forja API itself). Before each request, the host name is resolved
**once**; every address obtained must be allowed (private, loopback, link-local,
multicast and reserved addresses are refused unless the instance administrator allows
them: host names, IP addresses or CIDR ranges). The request then goes to that validated
address through :class:`PinnedTransport`, with the original Host header and TLS
verified against the host name: a name re-resolved to another address between the check
and the connection (DNS rebinding) is never connected to. Redirects are not followed
automatically: each one is checked like a new request.
"""

from __future__ import annotations

import ipaddress
import socket
import ssl
import threading
import typing
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from urllib.parse import urlsplit

import httpcore
import httpx

from forja_core.errors import ForjaError

IPAddress = ipaddress.IPv4Address | ipaddress.IPv6Address
Resolver = Callable[[str, int], list[str]]


class BlockedAddressError(ForjaError):
    code = "address_not_allowed"


def system_resolver(host: str, port: int) -> list[str]:
    try:
        infos = socket.getaddrinfo(host, port, proto=socket.IPPROTO_TCP)
    except socket.gaierror as exc:
        raise BlockedAddressError(
            f"the host '{host}' cannot be resolved", details={"host": host}
        ) from exc
    return sorted({str(info[4][0]) for info in infos})


def is_public(address: IPAddress) -> bool:
    if isinstance(address, ipaddress.IPv6Address) and address.ipv4_mapped is not None:
        return is_public(address.ipv4_mapped)
    return not (
        address.is_private
        or address.is_loopback
        or address.is_link_local
        or address.is_multicast
        or address.is_reserved
        or address.is_unspecified
        or not address.is_global
    )


@dataclass(frozen=True)
class Target:
    """A validated destination: where to connect for this host and port."""

    host: str
    port: int
    address: str


@dataclass(frozen=True)
class UrlGuard:
    allowed: Sequence[str] = ()
    resolver: Resolver = system_resolver

    def _allowed_networks(self) -> list[ipaddress.IPv4Network | ipaddress.IPv6Network]:
        networks = []
        for entry in self.allowed:
            try:
                networks.append(ipaddress.ip_network(entry.strip(), strict=False))
            except ValueError:
                continue
        return networks

    def _host_allowed(self, host: str) -> bool:
        names = {entry.strip().lower() for entry in self.allowed}
        return host.lower() in names

    def address_allowed(self, address: str) -> bool:
        ip = ipaddress.ip_address(address.split("%", 1)[0])
        if is_public(ip):
            return True
        if isinstance(ip, ipaddress.IPv6Address) and ip.ipv4_mapped is not None:
            ip = ip.ipv4_mapped
        return any(ip in network for network in self._allowed_networks())

    def _parse(self, url: str) -> tuple[str, int]:
        parts = urlsplit(url)
        if parts.scheme not in ("http", "https"):
            raise BlockedAddressError(
                "only http and https URLs are allowed", details={"scheme": parts.scheme}
            )
        if parts.username or parts.password:
            raise BlockedAddressError("credentials are not allowed in the URL")
        host = parts.hostname
        if not host:
            raise BlockedAddressError("the URL has no host")
        return host, parts.port or (443 if parts.scheme == "https" else 80)

    def validate(self, url: str) -> None:
        """Raise unless ``url`` may be saved: an http(s) URL whose host is allowed by name,
        or resolves to allowed addresses only. Connections are checked again on use."""
        host, _port = self._parse(url)
        if not self._host_allowed(host):
            self.check(url)

    def check(self, url: str) -> Target:
        """The address to connect to for ``url``: an http(s) URL whose host resolves, once,
        to allowed addresses only. Raises :class:`BlockedAddressError` otherwise."""
        host, port = self._parse(url)
        addresses = self.resolver(host, port)
        if not addresses:
            raise BlockedAddressError(f"the host '{host}' cannot be resolved")
        if not self._host_allowed(host):
            blocked = [a for a in addresses if not self.address_allowed(a)]
            if blocked:
                raise BlockedAddressError(
                    f"'{host}' resolves to a private or local address; an administrator can "
                    "allow it in Settings > Connectors",
                    details={"host": host, "addresses": blocked},
                )
        return Target(host=host.lower(), port=port, address=addresses[0])


class _PinnedBackend(httpcore.SyncBackend):
    """Connects only to the address validated for a host and port."""

    def __init__(self) -> None:
        self._pins: dict[tuple[str, int], str] = {}
        self._lock = threading.Lock()

    def pin(self, target: Target) -> None:
        with self._lock:
            self._pins[(target.host, target.port)] = target.address

    def connect_tcp(
        self,
        host: str,
        port: int,
        timeout: float | None = None,
        local_address: str | None = None,
        socket_options: typing.Iterable[httpcore.SOCKET_OPTION] | None = None,
    ) -> httpcore.NetworkStream:
        with self._lock:
            address = self._pins.get((host.lower(), port))
        if address is None:
            raise httpcore.ConnectError(f"{host}:{port} was not checked before connecting")
        return super().connect_tcp(address, port, timeout, local_address, socket_options)


class PinnedTransport(httpx.HTTPTransport):
    """An httpx transport whose connections go to the addresses :meth:`pin` received.

    The request keeps its URL, so the Host header and TLS (SNI and certificate
    verification) use the host name; only the TCP connection uses the pinned address.
    """

    def __init__(self) -> None:
        super().__init__(trust_env=False)
        self.backend = _PinnedBackend()
        context: ssl.SSLContext = httpx.create_ssl_context(trust_env=False)
        self._pool = httpcore.ConnectionPool(ssl_context=context, network_backend=self.backend)

    def pin(self, target: Target) -> None:
        self.backend.pin(target)
