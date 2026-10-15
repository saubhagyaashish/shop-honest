"""Runs audits in the background and writes every event to the log.

Guarantees (checked in tests): `audit.started` first, exactly one terminal
event last, and the record's status/report kept in step with the log.

With several instances (Cloud Run), the instance running an audit writes a
heartbeat while it works. If it loses the audit (another instance took over
after its heartbeat went quiet), it stops without writing anything more.
"""

import asyncio
import contextlib
import logging
import secrets
import socket
from collections.abc import AsyncIterator
from typing import TYPE_CHECKING, Any

from playwright.async_api import TimeoutError as PlaywrightTimeout

from app.agents.judge import Judge
from app.browser.url_guard import Resolver, system_resolver
from app.config import Settings
from app.contract.models import AUDIT_EVENT, TERMINAL_EVENTS, AuditReport, dump
from app.knowledge import load_knowledge
from app.models import ModelSet, model_set
from app.prices.history import PriceHistory, price_history_for
from app.replay.player import Recording
from app.runner.audit_graph import AuditGraph
from app.runner.steps import LiveAudit
from app.stores.events import AuditRecord, EventLog, now_iso
from app.stores.frames import FrameStore, LocalFrameStore

if TYPE_CHECKING:
    from app.journeys import Journey

log = logging.getLogger(__name__)

# How often a paused replay checks whether a viewer on another instance asked to skip.
SKIP_POLL_S = 1.0


class AuditRunner:
    def __init__(
        self,
        events: EventLog,
        settings: Settings,
        frames: FrameStore | None = None,
        resolver: Resolver = system_resolver,
        models: ModelSet | None = None,
        prices: PriceHistory | None = None,
    ) -> None:
        self._events = events
        self._prices = prices if prices is not None else price_history_for(settings)
        # Tests inject scripted models; otherwise MODEL_PROVIDER decides (None = measured-only audits).
        self._models = models if models is not None else model_set(settings)
        self._settings = settings
        self._frames = frames or LocalFrameStore(settings.frames_dir)
        self._resolver = resolver
        self._tasks: dict[str, asyncio.Task[None]] = {}
        self._skip: dict[str, asyncio.Event] = {}
        self._live: set[str] = set()
        # Audits another instance took over: this one stops quietly.
        self._lost: set[str] = set()
        # Who this process is, as an audit owner.
        self.instance = f"{socket.gethostname()}-{secrets.token_hex(3)}"

    @property
    def active(self) -> int:
        return len(self._tasks)

    @property
    def active_live(self) -> int:
        return len(self._live)

    async def start_replay(self, record: AuditRecord, recording: Recording, origin: str, resume_after: int = 0) -> None:
        """Play a recording; `resume_after` continues an abandoned replay after the events already stored."""
        self._skip[record.audit_id] = asyncio.Event()
        task = asyncio.create_task(self._replay(record, recording, origin, resume_after), name=f"audit-{record.audit_id}")
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
        self._lost.discard(audit_id)

    @contextlib.asynccontextmanager
    async def _heartbeat(self, audit_id: str) -> AsyncIterator[None]:
        beater = self._start_heartbeat(audit_id)
        try:
            yield
        finally:
            beater.cancel()

    def _start_heartbeat(self, audit_id: str) -> asyncio.Task[None]:
        """Keep saying this instance is alive; if another instance took the audit over, stop the work here."""
        work = asyncio.current_task()
        assert work is not None

        async def beat() -> None:
            while True:
                await asyncio.sleep(self._settings.heartbeat_s)
                try:
                    alive = await self._events.heartbeat(audit_id, self.instance)
                except Exception:
                    log.warning("audit %s: heartbeat failed, will retry", audit_id, exc_info=True)
                    continue
                if not alive:
                    log.warning("audit %s: taken over by another instance; stopping here", audit_id)
                    self._lost.add(audit_id)
                    work.cancel()
                    return

        return asyncio.create_task(beat(), name=f"heartbeat-{audit_id}")

    async def _still_mine(self, audit_id: str) -> bool:
        if audit_id in self._lost:
            return False
        record = await self._events.get(audit_id)
        return record is not None and record.owner == self.instance

    async def _replay(self, record: AuditRecord, recording: Recording, origin: str, resume_after: int = 0) -> None:
        audit_id = record.audit_id
        skip = self._skip[audit_id]
        started_at = record.started_at if resume_after and record.started_at else now_iso()
        await self._events.update(audit_id, status="running", started_at=started_at)
        try:
            async with self._heartbeat(audit_id):
                for n, (delay, event) in enumerate(recording.play(audit_id, origin), start=1):
                    if n <= resume_after:
                        continue
                    await self._pause(delay, skip, audit_id)
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
            if audit_id in self._lost:
                return
            await self._emit(audit_id, {"type": "audit.failed", "error": "The server stopped before the audit finished."})
            raise
        except Exception:
            if not await self._still_mine(audit_id):
                log.warning("audit %s: stopped after another instance took over", audit_id)
                return
            log.exception("audit %s crashed", audit_id)
            await self._emit(audit_id, {"type": "audit.failed", "error": "Something went wrong while running the audit."})

    async def _run_live(self, record: AuditRecord, journey: "Journey") -> None:
        audit_id, settings = record.audit_id, self._settings
        started_at = now_iso()
        await self._events.update(audit_id, status="running", started_at=started_at)

        async def emit(event: dict[str, Any]) -> None:
            # Live events are built here, so check every one against the contract before it goes out.
            await self._emit(audit_id, dump(AUDIT_EVENT.validate_python(event)))

        audit: LiveAudit | None = None
        deadline = asyncio.get_running_loop().time() + settings.audit_timeout_s
        beater = self._start_heartbeat(audit_id)
        try:
            await emit({"type": "audit.started", "auditId": audit_id, "targetUrl": record.target_url, "startedAt": started_at})
            knowledge = load_knowledge(settings.shared_dir)
            audit = LiveAudit(
                audit_id=audit_id,
                target_url=record.target_url,
                started_at=started_at,
                journey=journey,
                settings=settings,
                knowledge=knowledge,
                judge=Judge(self._models, knowledge, settings) if self._models else None,
                frames=self._frames,
                resolver=self._resolver,
                prices=self._prices,
                emit=emit,
                deadline=deadline,
            )
            report = await (AuditGraph(audit).run() if settings.agent_graph else audit.run())
            await emit({"type": "audit.completed", "report": dump(AuditReport.model_validate(report))})
        except asyncio.CancelledError:
            if audit_id in self._lost:
                return
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
            if not await self._still_mine(audit_id):
                log.warning("audit %s: stopped after another instance took over", audit_id)
                return
            log.exception("audit %s crashed", audit_id)
            await self._emit(audit_id, {"type": "audit.failed", "error": "Something went wrong while running the audit."})
        finally:
            beater.cancel()
            # Model reviews never outlive their audit.
            if audit is not None and audit.walk is not None:
                await audit.walk.cancel_reviews()

    async def _emit(self, audit_id: str, event: dict[str, Any]) -> None:
        await self._events.append(audit_id, event)
        if event["type"] == "audit.completed":
            await self._events.update(
                audit_id, status="completed", completed_at=event["report"]["completedAt"], report=event["report"]
            )
        elif event["type"] == "audit.failed":
            await self._events.update(audit_id, status="failed", completed_at=now_iso(), error=event["error"])

    async def _pause(self, seconds: float, skip: asyncio.Event, audit_id: str) -> None:
        """Wait between replayed events, unless someone asked to skip: here (fast_forward) or on another instance (the flag)."""
        speed = self._settings.replay_speed
        if seconds <= 0 or speed <= 0 or skip.is_set():
            return
        loop = asyncio.get_running_loop()
        deadline = loop.time() + seconds / speed
        while (left := deadline - loop.time()) > 0:
            with contextlib.suppress(TimeoutError):
                await asyncio.wait_for(skip.wait(), timeout=min(left, SKIP_POLL_S))
                return
            record = await self._events.get(audit_id)
            if record is not None and record.skip_requested:
                skip.set()
                return
