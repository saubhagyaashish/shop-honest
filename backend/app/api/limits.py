"""How many live audits a visitor, and the whole site, may start (replays are never limited).

Live audits run a real browser and a paid model, so the deployed site caps them:
per visitor per clock hour, and site-wide per day (UTC). Visitors are counted by a
hash of their IP, never the IP itself. The forwarded IP can be spoofed, so the
per-visitor cap is a courtesy; the daily cap is what protects the budget.
"""

import hashlib
from collections import Counter
from datetime import UTC, datetime, timedelta
from typing import Protocol

from fastapi import Request
from google.cloud import firestore

from app.config import Settings


def visitor_of(request: Request, salt: str) -> str:
    forwarded = request.headers.get("x-forwarded-for", "")
    ip = forwarded.split(",")[0].strip() or (request.client.host if request.client else "unknown")
    return hashlib.sha256(f"{salt}:{ip}".encode()).hexdigest()[:20]


def _hour(now: datetime) -> str:
    return now.strftime("%Y-%m-%dT%H")


def _day(now: datetime) -> str:
    return now.strftime("%Y-%m-%d")


class LiveLimits(Protocol):
    async def take(self, visitor: str) -> str | None:
        """Count one live audit; return why it's refused instead (nothing is counted then)."""
        ...


class Refusals:
    def __init__(self, settings: Settings) -> None:
        self.per_hour = settings.live_per_ip_per_hour
        self.per_day = settings.live_per_day

    def check(self, visitor_this_hour: int, site_today: int) -> str | None:
        if self.per_day and site_today >= self.per_day:
            return "Live audits are paused for today: the site's daily limit is reached. “Scan it” still replays recorded runs."
        if self.per_hour and visitor_this_hour >= self.per_hour:
            n = self.per_hour
            audits = f"{n} live audit{'s' if n != 1 else ''}"
            return f"You've started {audits} this hour. Try again later, or use “Scan it” to replay a recorded run."
        return None


class MemoryLimits:
    def __init__(self, settings: Settings) -> None:
        self._rules = Refusals(settings)
        self._counts: Counter[str] = Counter()

    async def take(self, visitor: str) -> str | None:
        now = datetime.now(UTC)
        hour, day = f"{visitor}@{_hour(now)}", f"site@{_day(now)}"
        if refusal := self._rules.check(self._counts[hour], self._counts[day]):
            return refusal
        self._counts[hour] += 1
        self._counts[day] += 1
        return None


class FirestoreLimits:
    """Counters in <prefix>limits/{site-YYYY-MM-DD | visitor-hash-YYYY-MM-DDTHH}, expiring after two days."""

    def __init__(self, client: firestore.AsyncClient, settings: Settings) -> None:
        self._client = client
        self._limits = client.collection(f"{settings.store_prefix}limits")
        self._rules = Refusals(settings)

    async def take(self, visitor: str) -> str | None:
        now = datetime.now(UTC)
        site = self._limits.document(f"site-{_day(now)}")
        mine = self._limits.document(f"visitor-{visitor}-{_hour(now)}")
        expire = now + timedelta(days=2)
        rules = self._rules

        @firestore.async_transactional
        async def count(transaction: firestore.AsyncTransaction) -> str | None:
            site_snap = await site.get(transaction=transaction)
            mine_snap = await mine.get(transaction=transaction)
            site_n = (site_snap.to_dict() or {}).get("count", 0) if site_snap.exists else 0
            mine_n = (mine_snap.to_dict() or {}).get("count", 0) if mine_snap.exists else 0
            if refusal := rules.check(mine_n, site_n):
                return refusal
            transaction.set(site, {"count": site_n + 1, "expireAt": expire})
            transaction.set(mine, {"count": mine_n + 1, "expireAt": expire})
            return None

        return await count(self._client.transaction())
