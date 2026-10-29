"""Protection against server-side request forgery for REST API connections.

A connection makes the server send requests to an address chosen by a user: without
care, it could reach services that only the server sees (cloud metadata endpoints,
databases, the Forja API itself). Every URL is resolved before each request; private,
loopback, link-local, multicast and reserved addresses are refused unless the instance
administrator allows them (host names, IP addresses or CIDR ranges). Redirects are not
followed automatically: each one is checked like a new request. After the connection,
the peer address is checked again, so a name re-resolved to a private address between
the check and the request (DNS rebinding) gets no answer read.
"""

from __future__ import annotations

import ipaddress
import socket
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from urllib.parse import urlsplit

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
        return any(ip in network for network in self._allowed_networks())

    def check(self, url: str) -> None:
        """Raise unless ``url`` is an http(s) URL whose host resolves to allowed addresses."""
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
        if self._host_allowed(host):
            return
        port = parts.port or (443 if parts.scheme == "https" else 80)
        addresses = self.resolver(host, port)
        if not addresses:
            raise BlockedAddressError(f"the host '{host}' cannot be resolved")
        blocked = [a for a in addresses if not self.address_allowed(a)]
        if blocked:
            raise BlockedAddressError(
                f"'{host}' resolves to a private or local address; an administrator can "
                "allow it in Settings > Connectors",
                details={"host": host, "addresses": blocked},
            )

    def check_peer(self, host: str, address: str | None) -> None:
        """The address actually connected to (after DNS rebinding, for instance)."""
        if address is None or self._host_allowed(host):
            return
        if not self.address_allowed(address):
            raise BlockedAddressError(
                f"'{host}' answered from a private or local address",
                details={"host": host, "address": address},
            )
