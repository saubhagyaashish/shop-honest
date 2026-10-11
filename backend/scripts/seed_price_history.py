"""Load the demo catalog's price history into BigQuery (safe to re-run).

    uv run python -m scripts.seed_price_history

Rows come from shared/price_history.json (exported from the web app's catalog)
with observed_at = now - daysAgo and source=catalog. Earlier catalog rows are
replaced; rows recorded by audits (source=audit) are left alone. The MRP rule
doesn't depend on how recent the seed is (ADR-0012), but re-seeding before
judging keeps "raised 7 days ago" saying 7.
"""

import json
from datetime import UTC, datetime, timedelta

from google.cloud import bigquery

from app.config import Settings
from app.prices.keys import product_key


def main() -> None:
    settings = Settings()
    client = bigquery.Client(project=settings.google_cloud_project)
    table = f"{settings.google_cloud_project}.{settings.bq_dataset}.{settings.bq_table}"
    catalog = json.loads((settings.shared_dir / "price_history.json").read_text(encoding="utf-8"))
    now = datetime.now(UTC)
    rows = [
        {
            "product_key": product_key(f"http://localhost{path}"),
            "observed_at": (now - timedelta(days=point["daysAgo"])).isoformat(),
            "price": point["price"],
            "mrp": point["mrp"],
            "currency": entry.get("currency", "INR"),
            "source": "catalog",
            "audit_id": None,
        }
        for path, entry in catalog.items()
        for point in entry["points"]
    ]
    client.query(f"DELETE FROM `{table}` WHERE source = 'catalog'").result()
    job = client.load_table_from_json(rows, table, job_config=bigquery.LoadJobConfig(write_disposition="WRITE_APPEND"))
    job.result()
    print(f"Loaded {len(rows)} catalog rows for {len(catalog)} products into {table}")


if __name__ == "__main__":
    main()
