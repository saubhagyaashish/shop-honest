"""Runs audits in the background and writes every event to the log.

Guarantees (checked in tests): `audit.started` first, exactly one terminal
event last, and the record's status/report kept in step with the log.
"""

import asyncio
import contextlib
import logging
from typing import Any

from app.config import Settings
from app.contract.models import TERMINAL_EVENTS
from app.replay.player import Recording
from app.stores.events import AuditRecord, EventLog, now_iso

log = logging.getLogger(__name__)


class AuditRunner:
    def __init__(self, events: EventLog, settings: Settings) -> None:
        self._events = events
        self._settings = settings
        self._tasks: dict[str, asyncio.Task[None]] = {}
        self._skip: dict[str, asyncio.Event] = {}

    @property
    def active(self) -> int:
        return len(self._tasks)

    async def start_replay(self, record: AuditRecord, recording: Recording, origin: str) -> None:
        self._skip[record.audit_id] = asyncio.Event()
        task = asyncio.create_task(self._replay(record, recording, origin), name=f"audit-{record.audit_id}")
        self._tasks[record.audit_id] = task
        task.add_done_callback(lambda _: self._forget(record.audit_id))

    def fast_forward(self, audit_id: str) -> bool:
        """Play the rest of a replay without delays. False if the audit isn't running."""
        skip = self._skip.get(audit_id)
        if skip is None:
            return False
        skip.set()
        return True

    async def shutdown(self) -> None:
        for task in list(self._tasks.values()):
            task.cancel()
        for task in list(self._tasks.values()):
            with contextlib.suppress(asyncio.CancelledError):
                await task

    def _forget(self, audit_id: str) -> None:
        self._tasks.pop(audit_id, None)
        self._skip.pop(audit_id, None)

    async def _replay(self, record: AuditRecord, recording: Recording, origin: str) -> None:
        audit_id = record.audit_id
        skip = self._skip[audit_id]
        started_at = now_iso()
        await self._events.update(audit_id, status="running", started_at=started_at)
        try:
            for delay, event in recording.play(audit_id, origin):
                await self._pause(delay, skip)
                if event["type"] == "audit.started":
                    event["startedAt"] = started_at
                elif event["type"] == "audit.completed":
                    event["report"]["startedAt"] = started_at
                    event["report"]["completedAt"] = now_iso()
                await self._emit(audit_id, event)
                if event["type"] in TERMINAL_EVENTS:
                    return
            await self._emit(audit_id, {"type": "audit.failed", "error": "The recording ended without a result."})
        except asyncio.CancelledError:
            await self._emit(audit_id, {"type": "audit.failed", "error": "The server stopped before the audit finished."})
            raise
        except Exception:
            log.exception("audit %s crashed", audit_id)
            await self._emit(audit_id, {"type": "audit.failed", "error": "Something went wrong while running the audit."})

    async def _emit(self, audit_id: str, event: dict[str, Any]) -> None:
        await self._events.append(audit_id, event)
        if event["type"] == "audit.completed":
            await self._events.update(
                audit_id, status="completed", completed_at=event["report"]["completedAt"], report=event["report"]
            )
        elif event["type"] == "audit.failed":
            await self._events.update(audit_id, status="failed", completed_at=now_iso(), error=event["error"])

    async def _pause(self, seconds: float, skip: asyncio.Event) -> None:
        speed = self._settings.replay_speed
        if seconds <= 0 or speed <= 0 or skip.is_set():
            return
        with contextlib.suppress(TimeoutError):
            await asyncio.wait_for(skip.wait(), timeout=seconds / speed)
