"""The event log in Firestore (STORE_BACKEND=gcp), so audits outlive the instance that ran them.

    audits/{auditId}               the AuditRecord, plus expireAt for a TTL policy
    audits/{auditId}/events/{seq}  {seq, type, payload, at}; seq is zero-padded so ids sort

One instance runs an audit and writes its events, so it keeps the sequence
number, appends one at a time per audit, and writes each event with create()
(which never overwrites). Streams
served by the same instance are woken at once; a stream on another instance
polls Firestore every `poll_s` seconds.
"""

import asyncio
import dataclasses
from datetime import UTC, datetime, timedelta
from typing import Any

from google.cloud import firestore

from app.stores.events import AuditRecord

RECORD_FIELDS = {f.name for f in dataclasses.fields(AuditRecord)}


class FirestoreEventLog:
    def __init__(self, client: firestore.AsyncClient, *, prefix: str = "", retention_days: int = 30, poll_s: float = 1.0) -> None:
        self._audits = client.collection(f"{prefix}audits")
        self._retention = timedelta(days=retention_days)
        self._poll_s = poll_s
        self._seq: dict[str, int] = {}
        self._signals: dict[str, asyncio.Event] = {}
        self._locks: dict[str, asyncio.Lock] = {}

    def _doc(self, audit_id: str) -> firestore.AsyncDocumentReference:
        return self._audits.document(audit_id)

    def _events(self, audit_id: str) -> firestore.AsyncCollectionReference:
        return self._doc(audit_id).collection("events")

    def _expire_at(self) -> datetime:
        return datetime.now(UTC) + self._retention

    async def create(self, record: AuditRecord) -> None:
        await self._doc(record.audit_id).create({**dataclasses.asdict(record), "expireAt": self._expire_at()})
        self._seq[record.audit_id] = 0

    async def get(self, audit_id: str) -> AuditRecord | None:
        snapshot = await self._doc(audit_id).get()
        if not snapshot.exists:
            return None
        data = snapshot.to_dict() or {}
        return AuditRecord(**{k: v for k, v in data.items() if k in RECORD_FIELDS})

    async def update(self, audit_id: str, **fields: Any) -> None:
        await self._doc(audit_id).update(fields)

    async def append(self, audit_id: str, event: dict[str, Any]) -> int:
        # The navigator and background model reviews append concurrently. One at a time per audit,
        # so event N is stored before N+1 exists and a reader can never skip past a missing one.
        lock = self._locks.setdefault(audit_id, asyncio.Lock())
        async with lock:
            if audit_id not in self._seq:
                self._seq[audit_id] = await self.last_seq(audit_id)
            seq = self._seq[audit_id] + 1
            doc = {
                "seq": seq,
                "type": event["type"],
                "payload": event,
                "at": firestore.SERVER_TIMESTAMP,
                "expireAt": self._expire_at(),
            }
            await self._events(audit_id).document(f"{seq:06d}").create(doc)
            self._seq[audit_id] = seq
        if event["type"] in ("audit.completed", "audit.failed"):
            self._seq.pop(audit_id, None)
            self._locks.pop(audit_id, None)
        self._wake(audit_id)
        return seq

    async def read_after(self, audit_id: str, after: int) -> list[tuple[int, dict[str, Any]]]:
        query = self._events(audit_id).where(filter=firestore.FieldFilter("seq", ">", after)).order_by("seq")
        return [(doc.get("seq"), doc.get("payload")) async for doc in query.stream()]

    async def last_seq(self, audit_id: str) -> int:
        query = self._events(audit_id).order_by("seq", direction=firestore.Query.DESCENDING).limit(1)
        async for doc in query.stream():
            return int(doc.get("seq"))
        return 0

    async def wait(self, audit_id: str, after: int, max_wait: float) -> None:
        loop = asyncio.get_running_loop()
        deadline = loop.time() + max_wait
        while (remaining := deadline - loop.time()) > 0:
            signal = self._signals.setdefault(audit_id, asyncio.Event())
            try:
                await asyncio.wait_for(signal.wait(), timeout=min(self._poll_s, remaining))
                return
            except TimeoutError:
                pass
            if await self.last_seq(audit_id) > after:
                return

    def _wake(self, audit_id: str) -> None:
        # Wake everyone waiting on this audit, then start a fresh signal for the next event.
        signal = self._signals.pop(audit_id, None)
        if signal is not None:
            signal.set()
