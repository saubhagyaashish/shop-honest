"""Runs audits in the background and writes every event to the log.

Guarantees (checked in tests): `audit.started` first, exactly one terminal
event last, and the record's status/report kept in step with the log.
"""

import asyncio
import contextlib
import logging
from typing import TYPE_CHECKING, Any

from playwright.async_api import Error as PlaywrightError
from playwright.async_api import TimeoutError as PlaywrightTimeout

from app.agents.reporter import build_report
from app.browser.session import browser_page
from app.browser.url_guard import Resolver, system_resolver
from app.config import Settings
from app.contract.models import AUDIT_EVENT, TERMINAL_EVENTS, AuditReport, dump
from app.knowledge import load_knowledge
from app.replay.player import Recording
from app.runner.walk import Walk
from app.stores.events import AuditRecord, EventLog, now_iso
from app.stores.frames import FrameStore, LocalFrameStore

if TYPE_CHECKING:
    from app.journeys import Journey

log = logging.getLogger(__name__)


class AuditRunner:
    def __init__(
        self,
        events: EventLog,
        settings: Settings,
        frames: FrameStore | None = None,
        resolver: Resolver = system_resolver,
    ) -> None:
        self._events = events
        self._settings = settings
        self._frames = frames or LocalFrameStore(settings.frames_dir)
        self._resolver = resolver
        self._tasks: dict[str, asyncio.Task[None]] = {}
        self._skip: dict[str, asyncio.Event] = {}
        self._live: set[str] = set()

    @property
    def active(self) -> int:
        return len(self._tasks)

    @property
    def active_live(self) -> int:
        return len(self._live)

    async def start_replay(self, record: AuditRecord, recording: Recording, origin: str) -> None:
        self._skip[record.audit_id] = asyncio.Event()
        task = asyncio.create_task(self._replay(record, recording, origin), name=f"audit-{record.audit_id}")
        self._tasks[record.audit_id] = task
        task.add_done_callback(lambda _: self._forget(record.audit_id))

    async def start_live(self, record: AuditRecord, journey: "Journey") -> None:
        self._live.add(record.audit_id)
        task = asyncio.create_task(self._run_live(record, journey), name=f"audit-{record.audit_id}")
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
        self._live.discard(audit_id)

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

    async def _run_live(self, record: AuditRecord, journey: "Journey") -> None:
        audit_id, settings = record.audit_id, self._settings
        started_at = now_iso()
        await self._events.update(audit_id, status="running", started_at=started_at)

        async def emit(event: dict[str, Any]) -> None:
            # Live events are built here, so check every one against the contract before it goes out.
            await self._emit(audit_id, dump(AUDIT_EVENT.validate_python(event)))

        try:
            await emit({"type": "audit.started", "auditId": audit_id, "targetUrl": record.target_url, "startedAt": started_at})
            knowledge = load_knowledge(settings.shared_dir)
            async with asyncio.timeout(settings.audit_timeout_s):
                async with browser_page(settings, self._resolver) as (page, guard):
                    walk = Walk(
                        audit_id=audit_id,
                        target_url=record.target_url,
                        page=page,
                        guard=guard,
                        frames=self._frames,
                        knowledge=knowledge,
                        settings=settings,
                        emit=emit,
                    )
                    await walk.log("navigator", "Launching a fresh browser: 1280×800, no cookies, not signed in.")
                    try:
                        await journey.walk(walk)
                    except PlaywrightError as err:
                        if not walk.steps:
                            raise
                        # Keep what was audited: the report covers the steps reached.
                        reason = "Left the approved site" if guard.blocked else "The page stopped responding"
                        log.warning("audit %s stopped at %s: %s", audit_id, walk.step, err)
                        await walk.log("navigator", f"Couldn't go further: {reason.lower()}. Reporting what I reached.")
                        await walk.blocked(reason)

            confirmed = sum(f["status"] == "confirmed" for f in walk.findings)
            verdict = (
                f"{confirmed} finding{'s' if confirmed != 1 else ''} confirmed by measurement, "
                "each with a screenshot and a rule citation."
                if confirmed
                else "Every measured check passed: nothing to confirm."
            )
            await walk.log(
                "adjudicator", f"{verdict} Wording and design checks need a model's judgement and aren't part of this run."
            )
            await walk.log("reporter", "Building the audit report…")
            report = build_report(
                audit_id=audit_id,
                target_url=record.target_url,
                started_at=started_at,
                completed_at=now_iso(),
                steps=walk.steps,
                findings=walk.findings,
                ev=walk.evidence,
                knowledge=knowledge,
            )
            await emit({"type": "audit.completed", "report": dump(AuditReport.model_validate(report))})
        except asyncio.CancelledError:
            await self._emit(audit_id, {"type": "audit.failed", "error": "The server stopped before the audit finished."})
            raise
        except TimeoutError:
            await self._emit(
                audit_id,
                {"type": "audit.failed", "error": f"The audit took longer than {settings.audit_timeout_s:g} s and was stopped."},
            )
        except PlaywrightTimeout:
            log.exception("audit %s: page timed out", audit_id)
            await self._emit(audit_id, {"type": "audit.failed", "error": "The store didn't respond in time."})
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
