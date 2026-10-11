"""Price history: product keys, the catalog source, and BigQuery (with -m cloud)."""

import os
import secrets
from datetime import UTC, datetime

import pytest

from app.config import REPO_DIR
from app.prices.history import JsonPriceHistory, Observation
from app.prices.keys import product_key

CLOUD = os.environ.get("SHOP_HONEST_CLOUD_TESTS") == "1"


@pytest.mark.parametrize(
    ("url", "key"),
    [
        ("http://localhost:5173/demo/store-a/p/sonicbuds-pro", "bazaarnest/demo/store-a/p/sonicbuds-pro"),
        ("https://shop-honest-ai.web.app/demo/store-a/p/sonicbuds-pro?colour=ocean", "bazaarnest/demo/store-a/p/sonicbuds-pro"),
        ("https://shop-honest-ai--preview-1.web.app/demo/store-a/p/sonicbuds-pro/", "bazaarnest/demo/store-a/p/sonicbuds-pro"),
        ("https://www.Example.com/Shop/Item-1?ref=ad", "www.example.com/shop/item-1"),
        ("https://evil.example/demo/store-a/p/sonicbuds-pro", "evil.example/demo/store-a/p/sonicbuds-pro"),
    ],
)
def test_one_key_per_product_wherever_it_is_served(url: str, key: str):
    assert product_key(url) == key


async def test_the_catalog_history_is_relative_to_today_and_read_only():
    catalog = JsonPriceHistory(REPO_DIR / "shared" / "price_history.json")
    history = await catalog.lookup("bazaarnest/demo/store-a/p/sonicbuds-pro")
    assert history is not None and history.points[-1].day == datetime.now(UTC).date()
    assert (history.points[-1].day - history.points[0].day).days == 91
    assert await catalog.lookup("www.example.com/unknown") is None
    await catalog.record(Observation(key="k", price=1, mrp=2, currency="INR", audit_id="a"))  # a no-op


@pytest.mark.cloud
@pytest.mark.skipif(not CLOUD, reason="set SHOP_HONEST_CLOUD_TESTS=1 to use the real project")
async def test_bigquery_records_observations_and_reads_them_back():
    from google.cloud import bigquery

    from app.prices.history import BigQueryPriceHistory

    project, dataset = "shop-honest-72fd8", "shop_honest"
    client = bigquery.Client(project=project)
    source = client.get_table(f"{project}.{dataset}.price_history")
    name = f"test_{secrets.token_hex(4)}"
    client.create_table(bigquery.Table(f"{project}.{dataset}.{name}", schema=source.schema))
    try:
        history = BigQueryPriceHistory(project, dataset, name, cache_s=0)
        key = f"test.example/{name}"
        assert await history.lookup(key) is None
        for price in (1499, 1599):
            await history.record(Observation(key=key, price=price, mrp=3999, currency="INR", audit_id="aud_test"))
        found = await history.lookup(key)
        assert found is not None and len(found.points) == 1  # one point per day
        point = found.points[0]
        assert (point.day, point.low, point.high, point.mrp) == (datetime.now(UTC).date(), 1499, 1599, 3999)
    finally:
        client.delete_table(f"{project}.{dataset}.{name}", not_found_ok=True)
