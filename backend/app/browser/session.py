"""One headless Chromium per live audit, with the URL guard on every request."""

import ipaddress
import logging
import re
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from urllib.parse import urlsplit

from playwright.async_api import Page, Request, Route, async_playwright

from app.browser.url_guard import METADATA_HOSTS, METADATA_IPS, Resolver, host_allowed, is_internal, private_allowed
from app.config import Settings

log = logging.getLogger(__name__)

VIEWPORT = {"width": 1280, "height": 800}
AD_NETWORKS = re.compile(
    r"(^|\.)(doubleclick\.net|googlesyndication\.com|googleadservices\.com|googletagservices\.com|adservice\.google\.[a-z.]+|"
    r"amazon-adsystem\.com|adnxs\.com|criteo\.(com|net)|taboola\.com|outbrain\.com)$"
)


class RequestGuard:
    """Blocks navigations off the allowlist and any request into private networks or the metadata server."""

    def __init__(self, settings: Settings, resolver: Resolver) -> None:
        self._settings = settings
        self._resolver = resolver
        self._verdicts: dict[tuple[str, bool], bool] = {}
        self.blocked: list[str] = []

    async def allows(self, url: str, navigation: bool) -> bool:
        parts = urlsplit(url)
        if parts.scheme in ("data", "blob", "about"):
            return True
        if parts.scheme not in ("http", "https") or not parts.hostname:
            return False
        host = parts.hostname.lower()
        key = (host, navigation)
        if key not in self._verdicts:
            self._verdicts[key] = await self._decide(host, navigation)
        return self._verdicts[key]

    async def _decide(self, host: str, navigation: bool) -> bool:
        if host in METADATA_HOSTS:
            return False
        if navigation and not host_allowed(host, self._settings.allowed_hosts):
            return False
        try:
            addresses = await self._resolver(host)
        except OSError:
            return False
        for address in addresses:
            if ipaddress.ip_address(address) in METADATA_IPS:
                return False
            if is_internal(address) and not private_allowed(host, self._settings):
                return False
        return True

    async def handle(self, route: Route, request: Request) -> None:
        navigation = request.is_navigation_request() and request.frame.parent_frame is None
        if not navigation and AD_NETWORKS.search(urlsplit(request.url).hostname or ""):
            # Ad networks: full-page interstitials would hijack the journey. First-party "sponsored" items still load.
            await route.abort("blockedbyclient")
            return
        if await self.allows(request.url, navigation):
            await route.continue_()
        else:
            self.blocked.append(request.url)
            log.warning("blocked request to %s", request.url)
            await route.abort("blockedbyclient")


@asynccontextmanager
async def browser_page(settings: Settings, resolver: Resolver) -> AsyncIterator[tuple[Page, RequestGuard]]:
    """A fresh, cookie-less page that behaves like a shopper in India."""
    guard = RequestGuard(settings, resolver)
    async with async_playwright() as pw:
        # Containers often have a tiny /dev/shm; Chromium crashes on it without this flag.
        browser = await pw.chromium.launch(headless=settings.headless, args=["--disable-dev-shm-usage"])
        try:
            context = await browser.new_context(viewport=VIEWPORT, locale="en-IN", timezone_id="Asia/Kolkata")
            context.set_default_timeout(settings.nav_step_timeout_s * 1000)
            await context.route("**/*", guard.handle)
            page = await context.new_page()
            yield page, guard
        finally:
            await browser.close()
