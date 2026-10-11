"""The audit event log (docs/decisions/0002-event-log-resumable-sse.md).

Every event is stored before it's streamed; its sequence number (1, 2, 3…)
is the SSE id, so a client can resume from any point. Firestore implements
the same interface (firestore_events.py).

With several instances, each audit has an owner (the instance running it) that
writes a heartbeat. An instance serving a viewer can claim an audit whose owner
went quiet, atomically, so exactly one instance takes over.
"""

import asyncio
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any, Protocol

from app.contract.models import AuditMode, AuditStatus


def now_iso() -> str:
    return datetime.now(UTC).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def seconds_since(iso: str | None) -> float:
    """Seconds since an ISO timestamp; infinite for None."""
    if not iso:
        return float("inf")
    return (datetime.now(UTC) - datetime.fromisoformat(iso.replace("Z", "+00:00"))).total_seconds()


def claimable(owner: str | None, heartbeat_at: str | None, claimer: str, stale_after_s: float) -> bool:
    return owner in (None, claimer) or seconds_since(heartbeat_at) >= stale_after_s


@dataclass
class AuditRecord:
    audit_id: str
    target_url: str
    mode: AuditMode
    status: AuditStatus = "queued"
    created_at: str = field(default_factory=now_iso)
    started_at: str | None = None
    completed_at: str | None = None
    report: dict[str, Any] | None = None
    error: str | None = None
    # The instance running the audit, and when it last said it's alive.
    owner: str | None = None
    heartbeat_at: str | None = None
    # A viewer, on any instance, asked to skip to the end (replays only).
    skip_requested: bool = False

    @property
    def finished(self) -> bool:
        return self.status in ("completed", "failed")


class EventLog(Protocol):
    async def create(self, record: AuditRecord) -> None: ...
    async def get(self, audit_id: str) -> AuditRecord | None: ...
    async def update(self, audit_id: str, **fields: Any) -> None: ...
    async def append(self, audit_id: str, event: dict[str, Any]) -> int: ...
    async def read_after(self, audit_id: str, after: int) -> list[tuple[int, dict[str, Any]]]: ...
    async def last_seq(self, audit_id: str) -> int: ...
    async def wait(self, audit_id: str, after: int, max_wait: float) -> None: ...
    async def claim(self, audit_id: str, owner: str, stale_after_s: float) -> bool:
        """Atomically make `owner` the runner if the audit has none, or its owner's heartbeat is older than stale_after_s."""
        ...

    async def heartbeat(self, audit_id: str, owner: str) -> bool:
        """Record that `owner` is alive; False if another instance owns the audit now (or it's finished)."""
        ...


class MemoryEventLog:
    """In-process log for development and tests. Lost on restart, by design."""

    def __init__(self) -> None:
        self._records: dict[str, AuditRecord] = {}
        self._events: dict[str, list[dict[str, Any]]] = {}
        self._changed: dict[str, asyncio.Condition] = {}

    async def create(self, record: AuditRecord) -> None:
        self._records[record.audit_id] = record
        self._events[record.audit_id] = []
        self._changed[record.audit_id] = asyncio.Condition()

    async def get(self, audit_id: str) -> AuditRecord | None:
        return self._records.get(audit_id)

    async def update(self, audit_id: str, **fields: Any) -> None:
        record = self._records[audit_id]
        for name, value in fields.items():
            setattr(record, name, value)

    async def append(self, audit_id: str, event: dict[str, Any]) -> int:
        events = self._events[audit_id]
        events.append(event)
        async with self._changed[audit_id]:
            self._changed[audit_id].notify_all()
        return len(events)

    async def read_after(self, audit_id: str, after: int) -> list[tuple[int, dict[str, Any]]]:
        events = self._events.get(audit_id, [])
        return [(seq, event) for seq, event in enumerate(events[after:], start=after + 1)]

    async def last_seq(self, audit_id: str) -> int:
        return len(self._events.get(audit_id, []))

    async def wait(self, audit_id: str, after: int, max_wait: float) -> None:
        condition = self._changed[audit_id]
        async with condition:
            try:
                await asyncio.wait_for(condition.wait_for(lambda: len(self._events[audit_id]) > after), max_wait)
            except TimeoutError:
                pass

    async def claim(self, audit_id: str, owner: str, stale_after_s: float) -> bool:
        record = self._records.get(audit_id)
        if record is None or record.finished or not claimable(record.owner, record.heartbeat_at, owner, stale_after_s):
            return False
        record.owner, record.heartbeat_at = owner, now_iso()
        return True

    async def heartbeat(self, audit_id: str, owner: str) -> bool:
        record = self._records.get(audit_id)
        if record is None or record.owner != owner:
            return False
        record.heartbeat_at = now_iso()
        return True
