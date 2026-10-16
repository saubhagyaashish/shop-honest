"""Every audit target passes here first (docs/decisions/0005-allowlist-and-safety.md).

A user-supplied URL makes our browser visit it, so we only allow http(s),
only allowlisted hosts ("*" allows any public site), and never addresses inside
our own network or the cloud metadata server.
"""

import asyncio
import ipaddress
import socket
from collections.abc import Awaitable, Callable
from urllib.parse import urlsplit

from app.config import Settings
from app.errors import ApiError

Resolver = Callable[[str], Awaitable[list[str]]]

METADATA_HOSTS = frozenset({"metadata.google.internal", "metadata", "metadata.goog"})
METADATA_IPS = frozenset({ipaddress.ip_address("169.254.169.254"), ipaddress.ip_address("fd00:ec2::254")})
# An allowlist entry that allows any public site.
ANY_HOST = "*"


async def system_resolver(host: str) -> list[str]:
    infos = await asyncio.to_thread(socket.getaddrinfo, host, None, proto=socket.IPPROTO_TCP)
    return sorted({str(info[4][0]) for info in infos})


def host_allowed(host: str, allowlist: list[str]) -> bool:
    """Exact match, a ".example.com" entry for a domain and its subdomains, or "*" for any host."""
    for entry in allowlist:
        if entry == ANY_HOST:
            return True
        if entry.startswith("."):
            if host == entry[1:] or host.endswith(entry):
                return True
        elif host == entry:
            return True
    return False


def private_allowed(host: str, settings: Settings) -> bool:
    """A private address is reachable only for a host listed by name (localhost in development), never through "*"."""
    named = [entry for entry in settings.allowed_hosts if entry != ANY_HOST]
    return settings.allow_private_targets and host_allowed(host, named)


def is_internal(address: str) -> bool:
    ip = ipaddress.ip_address(address)
    return (
        ip in METADATA_IPS
        or ip.is_private
        or ip.is_loopback
        or ip.is_link_local
        or ip.is_reserved
        or ip.is_multicast
        or ip.is_unspecified
    )


async def check_target(url: str, settings: Settings, resolver: Resolver = system_resolver) -> str:
    """Return the cleaned URL, or raise ApiError (400 invalid_url / 403 host_not_allowed)."""
    candidate = url.strip()
    parts = urlsplit(candidate)
    if parts.scheme not in ("http", "https") or not parts.hostname:
        raise ApiError(400, "invalid_url", "Enter a full product URL starting with http:// or https://.")
    host = parts.hostname.lower()

    if host in METADATA_HOSTS:
        raise ApiError(403, "host_not_allowed", "That address can't be audited.")
    if not host_allowed(host, settings.allowed_hosts):
        raise ApiError(403, "host_not_allowed", "Only the demo stores and approved sites can be audited in this deployment.")

    try:
        addresses = await resolver(host)
    except OSError as exc:
        raise ApiError(400, "invalid_url", f"Couldn't find the site {host}.") from exc
    if not addresses:
        raise ApiError(400, "invalid_url", f"Couldn't find the site {host}.")

    for address in addresses:
        if ipaddress.ip_address(address) in METADATA_IPS or (is_internal(address) and not private_allowed(host, settings)):
            raise ApiError(403, "host_not_allowed", "That address points inside a private network and can't be audited.")
    return candidate
