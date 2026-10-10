"""The in-browser request guard: navigation stays on the allowlist; nothing reaches internal or metadata addresses."""

from app.browser.session import RequestGuard
from tests.conftest import make_settings


async def resolver(host: str) -> list[str]:
    return {
        "localhost": ["127.0.0.1"],
        "shop-honest.web.app": ["199.36.158.100"],
        "fonts.gstatic.com": ["142.250.1.1"],
        "evil.example": ["93.184.216.34"],
        "rebind.example": ["10.0.0.5"],
        "meta.example": ["169.254.169.254"],
    }[host]


async def test_navigation_stays_on_the_allowlist():
    guard = RequestGuard(make_settings(), resolver)
    assert await guard.allows("https://shop-honest.web.app/demo/store-a/cart", navigation=True)
    assert await guard.allows("http://localhost:5173/demo/store-a/cart", navigation=True)
    assert not await guard.allows("https://evil.example/phish", navigation=True)
    assert not await guard.allows("file:///etc/passwd", navigation=True)


async def test_subresources_may_be_public_but_never_internal():
    guard = RequestGuard(make_settings(), resolver)
    assert await guard.allows("https://fonts.gstatic.com/s/font.woff2", navigation=False)
    assert not await guard.allows("http://rebind.example/admin", navigation=False)
    assert not await guard.allows("http://meta.example/computeMetadata/v1/", navigation=False)
    assert not await guard.allows("http://metadata.google.internal/computeMetadata/v1/", navigation=False)
    assert await guard.allows("data:image/png;base64,AAAA", navigation=False)


async def test_private_targets_can_be_switched_off():
    guard = RequestGuard(make_settings(allow_private_targets=False), resolver)
    assert not await guard.allows("http://localhost:5173/demo/store-a/p/sonicbuds-pro", navigation=True)
