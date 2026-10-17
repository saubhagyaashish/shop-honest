"""The in-browser request guard: navigation stays on the allowlist ("*": any public site); nothing reaches internal or
metadata addresses."""

from app.browser.session import RequestGuard
from tests.conftest import make_settings


async def resolver(host: str) -> list[str]:
    return {
        "localhost": ["127.0.0.1"],
        "shop-honest-ai.web.app": ["199.36.158.100"],
        "fonts.gstatic.com": ["142.250.1.1"],
        "evil.example": ["93.184.216.34"],
        "rebind.example": ["10.0.0.5"],
        "meta.example": ["169.254.169.254"],
    }[host]


async def test_navigation_stays_on_an_explicit_allowlist():
    guard = RequestGuard(make_settings(allowed_hosts=["shop-honest-ai.web.app", "localhost"]), resolver)
    assert await guard.allows("https://shop-honest-ai.web.app/demo/store-a/cart", navigation=True)
    assert await guard.allows("http://localhost:5173/demo/store-a/cart", navigation=True)
    assert not await guard.allows("https://evil.example/phish", navigation=True)
    assert not await guard.allows("file:///etc/passwd", navigation=True)


async def test_any_public_site_but_never_a_private_one_by_default():
    guard = RequestGuard(make_settings(), resolver)
    assert await guard.allows("https://evil.example/product", navigation=True)
    assert await guard.allows("http://localhost:5173/demo/store-a/cart", navigation=True)
    assert not await guard.allows("http://rebind.example/admin", navigation=True)
    assert not await guard.allows("http://meta.example/computeMetadata/v1/", navigation=True)


async def test_subresources_may_be_public_but_never_internal():
    guard = RequestGuard(make_settings(), resolver)
    assert await guard.allows("https://fonts.gstatic.com/s/font.woff2", navigation=False)
    assert not await guard.allows("http://rebind.example/admin", navigation=False)
    assert not await guard.allows("http://meta.example/computeMetadata/v1/", navigation=False)
    assert not await guard.allows("http://metadata.google.internal/computeMetadata/v1/", navigation=False)
    assert await guard.allows("data:image/png;base64,AAAA", navigation=False)


async def test_only_a_blocked_navigation_counts_as_leaving_the_site():
    """A tracker the guard refuses (New Relic's beacon on veirdo.in) isn't the page leaving the approved site."""
    from types import SimpleNamespace

    class Route:
        async def abort(self, reason: str) -> None: ...

        async def continue_(self) -> None: ...

    def request(url: str, navigation: bool) -> SimpleNamespace:
        return SimpleNamespace(url=url, is_navigation_request=lambda: navigation, frame=SimpleNamespace(parent_frame=None))

    guard = RequestGuard(make_settings(), resolver)
    await guard.handle(Route(), request("http://rebind.example/beacon", navigation=False))  # type: ignore[arg-type]
    assert (guard.blocked, guard.left) == (["http://rebind.example/beacon"], [])
    await guard.handle(Route(), request("http://rebind.example/admin", navigation=True))  # type: ignore[arg-type]
    assert guard.left == ["http://rebind.example/admin"]


async def test_private_targets_can_be_switched_off():
    guard = RequestGuard(make_settings(allow_private_targets=False), resolver)
    assert not await guard.allows("http://localhost:5173/demo/store-a/p/sonicbuds-pro", navigation=True)
