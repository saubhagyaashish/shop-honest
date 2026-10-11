import pytest

from app.browser.url_guard import check_target, host_allowed, is_internal
from app.errors import ApiError
from tests.conftest import make_settings


def resolver_for(*addresses: str):
    async def resolve(_: str) -> list[str]:
        return list(addresses)

    return resolve


async def test_accepts_allowlisted_public_host():
    url = "https://shop-honest-ai.web.app/demo/store-a/p/sonicbuds-pro"
    assert await check_target(url, make_settings(), resolver_for("199.36.158.100")) == url


@pytest.mark.parametrize("url", ["ftp://shop-honest-ai.web.app/x", "javascript:alert(1)", "shop-honest-ai.web.app/x", "https://", ""])
async def test_rejects_non_http_urls(url: str):
    with pytest.raises(ApiError) as err:
        await check_target(url, make_settings(), resolver_for("199.36.158.100"))
    assert (err.value.status, err.value.code) == (400, "invalid_url")


async def test_rejects_hosts_off_the_allowlist():
    with pytest.raises(ApiError) as err:
        await check_target("https://www.flipkart.com/p/x", make_settings(), resolver_for("93.184.215.14"))
    assert (err.value.status, err.value.code) == (403, "host_not_allowed")


@pytest.mark.parametrize("address", ["169.254.169.254", "10.0.0.7", "127.0.0.1", "192.168.1.4", "::1", "fd00:ec2::254"])
async def test_blocks_internal_addresses_in_production(address: str):
    prod = make_settings(allowed_hosts=["shop-honest-ai.web.app"], allow_private_targets=False)
    with pytest.raises(ApiError) as err:
        await check_target("https://shop-honest-ai.web.app/demo/store-a/", prod, resolver_for(address))
    assert err.value.code == "host_not_allowed"


async def test_metadata_is_blocked_even_with_the_dev_override():
    dev = make_settings(allowed_hosts=["evil.example"], allow_private_targets=True)
    with pytest.raises(ApiError):
        await check_target("http://evil.example/", dev, resolver_for("169.254.169.254"))
    with pytest.raises(ApiError):
        await check_target(
            "http://metadata.google.internal/computeMetadata/v1/", make_settings(allowed_hosts=["metadata.google.internal"])
        )


async def test_dev_override_allows_localhost():
    assert await check_target("http://localhost:5173/demo/store-a/", make_settings(), resolver_for("127.0.0.1"))


async def test_unresolvable_host_is_invalid():
    async def fail(_: str) -> list[str]:
        raise OSError("nodename nor servname provided")

    with pytest.raises(ApiError) as err:
        await check_target("https://shop-honest-ai.web.app/", make_settings(), fail)
    assert err.value.code == "invalid_url"


def test_suffix_entries_cover_subdomains():
    assert host_allowed("shop.example.in", [".example.in"])
    assert host_allowed("example.in", [".example.in"])
    assert not host_allowed("badexample.in", [".example.in"])


def test_internal_ranges():
    assert is_internal("10.1.2.3") and is_internal("169.254.1.1") and not is_internal("8.8.8.8")
