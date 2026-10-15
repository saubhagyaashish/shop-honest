"""Where price history comes from: the demo catalog file (local, tests) or BigQuery (deployed)."""

import asyncio
import json
import logging
import time
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import TYPE_CHECKING, Protocol

from app.prices.facts import History, PricePoint
from app.prices.keys import product_key

if TYPE_CHECKING:
    from app.config import Settings

log = logging.getLogger(__name__)


@dataclass(frozen=True)
class Observation:
    key: str
    price: float
    mrp: float | None
    currency: str
    audit_id: str


class PriceHistory(Protocol):
    name: str  # how the narration names it

    async def lookup(self, key: str) -> History | None: ...

    async def record(self, observation: Observation) -> None: ...


class JsonPriceHistory:
    """shared/price_history.json (exported from the web app's catalog): history relative to today, read-only."""

    name = "the demo catalog"

    def __init__(self, file: Path) -> None:
        self._data = json.loads(file.read_text(encoding="utf-8"))

    def get(self, key: str) -> History | None:
        today = datetime.now(UTC).date()
        for path, entry in self._data.items():
            if product_key(f"http://localhost{path}") == key:
                points = [
                    PricePoint(day=today - timedelta(days=p["daysAgo"]), low=p["price"], high=p["price"], mrp=p["mrp"])
                    for p in sorted(entry["points"], key=lambda p: -p["daysAgo"])
                ]
                return History(key=key, currency=entry.get("currency", "INR"), points=points)
        return None

    async def lookup(self, key: str) -> History | None:
        return self.get(key)

    async def record(self, observation: Observation) -> None:
        return None


class ReadOnlyPrices:
    """Looks prices up but records nothing: for a fixed copy of a store, whose prices aren't the store's real ones."""

    def __init__(self, inner: PriceHistory) -> None:
        self._inner = inner
        self.name = inner.name

    async def lookup(self, key: str) -> History | None:
        return await self._inner.lookup(key)

    async def record(self, observation: Observation) -> None:
        return None


class BigQueryPriceHistory:
    """`<project>.<dataset>.price_history`: one row per observation (catalog seed or audit), queried per product."""

    name = "BigQuery"

    def __init__(
        self, project: str, dataset: str, table: str = "price_history", *, days: int = 180, cache_s: float = 600
    ) -> None:
        from google.cloud import bigquery

        self._bq = bigquery
        self._client = bigquery.Client(project=project)
        self.table = f"{project}.{dataset}.{table}"
        self._days = days
        self._cache_s = cache_s
        self._cache: dict[str, tuple[float, History | None]] = {}

    async def lookup(self, key: str) -> History | None:
        cached = self._cache.get(key)
        if cached and time.monotonic() - cached[0] < self._cache_s:
            return cached[1]
        history = await asyncio.to_thread(self._query, key)
        self._cache[key] = (time.monotonic(), history)
        return history

    def _query(self, key: str) -> History | None:
        sql = f"""
            SELECT DATE(observed_at) AS day, MIN(price) AS low, MAX(price) AS high, MAX(mrp) AS mrp,
                   ANY_VALUE(currency) AS currency
            FROM `{self.table}`
            WHERE product_key = @key AND observed_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL @days DAY)
            GROUP BY day
            ORDER BY day
        """
        config = self._bq.QueryJobConfig(
            query_parameters=[
                self._bq.ScalarQueryParameter("key", "STRING", key),
                self._bq.ScalarQueryParameter("days", "INT64", self._days),
            ]
        )
        rows = list(self._client.query(sql, job_config=config).result())
        if not rows:
            return None
        points = [
            PricePoint(
                day=r["day"], low=float(r["low"]), high=float(r["high"]), mrp=float(r["mrp"]) if r["mrp"] is not None else None
            )
            for r in rows
        ]
        return History(key=key, currency=rows[-1]["currency"] or "INR", points=points)

    async def record(self, observation: Observation) -> None:
        row = {
            "product_key": observation.key,
            "observed_at": datetime.now(UTC).isoformat(),
            "price": observation.price,
            "mrp": observation.mrp,
            "currency": observation.currency,
            "source": "audit",
            "audit_id": observation.audit_id,
        }
        errors = await asyncio.to_thread(self._client.insert_rows_json, self.table, [row])
        if errors:
            raise RuntimeError(f"BigQuery insert failed: {errors}")
        self._cache.pop(observation.key, None)


def price_history_for(settings: "Settings") -> PriceHistory:
    if settings.price_history_backend == "bigquery":
        return BigQueryPriceHistory(settings.google_cloud_project, settings.bq_dataset, settings.bq_table)
    return JsonPriceHistory(settings.shared_dir / "price_history.json")
