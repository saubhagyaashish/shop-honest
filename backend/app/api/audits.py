"""The public API (docs/API.md)."""

import asyncio
import json
import logging
import secrets
from collections.abc import AsyncIterator
from typing import Any

from fastapi import APIRouter, Header, Query, Request, Response
from sse_starlette import EventSourceResponse

from app.agents import fixer
from app.api.limits import LiveLimits, visitor_of
from app.browser.url_guard import check_target
from app.config import Settings
from app.contract.models import (
    TERMINAL_EVENTS,
    AuditStatusResponse,
    CreateAuditRequest,
    CreateAuditResponse,
    FixProposal,
)
from app.errors import ApiError
from app.journeys import journey_for
from app.knowledge import load_knowledge
from app.models.call import ModelCaller, ModelError
from app.replay.player import RecordingLibrary, origin_of
from app.runner.runner import AuditRunner
from app.stores.events import AuditRecord, EventLog, now_iso, seconds_since
from app.stores.frames import FrameStore

router = APIRouter(prefix="/api")
log = logging.getLogger(__name__)

HEARTBEAT_SECONDS = 15
# Fix proposals kept per instance, so reopening "Fix it" (or replaying the same store) doesn't ask the Fixer again.
MAX_PROPOSALS_KEPT = 256


def _settings(request: Request) -> Settings:
    return request.app.state.settings


def _events(request: Request) -> EventLog:
    return request.app.state.events


def _runner(request: Request) -> AuditRunner:
    return request.app.state.runner


def _library(request: Request) -> RecordingLibrary:
    return request.app.state.library


async def _record_or_404(request: Request, audit_id: str) -> AuditRecord:
    record = await _events(request).get(audit_id)
    if record is None:
        raise ApiError(404, "audit_not_found", f"No audit with id {audit_id}.")
    return await _settle_if_abandoned(request, record)


async def _settle_if_abandoned(request: Request, record: AuditRecord) -> AuditRecord:
    """Take over an audit whose instance went quiet (it restarted or was shut down).

    A replay continues here from the last event stored; a live audit can't
    resume a dead browser, so it's closed as failed. The claim is atomic, so
    when several instances notice at once, exactly one acts.
    """
    settings = _settings(request)
    if record.finished:
        return record
    quiet = seconds_since(record.heartbeat_at or record.created_at) >= settings.abandoned_after_s
    overdue = seconds_since(record.created_at) >= settings.audit_timeout_s + 120
    if not (quiet or overdue):
        return record
    events, runner = _events(request), _runner(request)
    if not await events.claim(record.audit_id, runner.instance, settings.abandoned_after_s):
        return await events.get(record.audit_id) or record
    recording = _library(request).match(record.target_url) if record.mode == "replay" else None
    if recording is not None and not overdue:
        log.warning("audit %s: owner %s went quiet; resuming the replay here", record.audit_id, record.owner)
        fresh = await events.get(record.audit_id) or record
        await runner.start_replay(
            fresh, recording, origin_of(record.target_url), resume_after=await events.last_seq(record.audit_id)
        )
        return fresh
    log.warning("audit %s: owner %s went quiet; closing it", record.audit_id, record.owner)
    error = "The server running this audit restarted before it finished. Please run it again."
    await events.append(record.audit_id, {"type": "audit.failed", "error": error})
    await events.update(record.audit_id, status="failed", completed_at=now_iso(), error=error)
    return await events.get(record.audit_id) or record


@router.get("/health")
async def health(request: Request) -> dict[str, Any]:
    return {"ok": True, "version": _settings(request).version}


@router.post("/audits", status_code=202, response_model=CreateAuditResponse)
async def create_audit(body: CreateAuditRequest, request: Request) -> CreateAuditResponse:
    settings = _settings(request)
    url = await check_target(body.targetUrl, settings, request.app.state.resolver)
    runner = _runner(request)
    if runner.active >= settings.max_concurrent_audits:
        raise ApiError(503, "at_capacity", "All audit slots are busy. Try again in a moment.")

    # auto: a recorded run if there is one, otherwise a live run.
    # Re-auditing a page: compare with an earlier finished audit of it, on a fresh live run.
    previous = None
    if body.compareTo:
        previous = await _events(request).get(body.compareTo)
        if previous is None or previous.status != "completed" or not previous.report or previous.target_url != url:
            raise ApiError(400, "invalid_request", "compareTo must be a finished audit of the same page.")
    # Verifying fixes: apply them to a copy of the store, in the audit's own browser only.
    applied = _applied_fixes(body, previous.report if previous else None, url, settings) if body.applyFixes else None
    recording = _library(request).match(url) if body.mode != "live" and previous is None else None
    if recording is None and body.mode == "replay":
        raise ApiError(409, "no_recording", "There's no recorded run for this page yet. Try one of the demo stores.")

    audit_id = f"aud_{secrets.token_hex(6)}"
    if recording is not None:
        record = AuditRecord(audit_id=audit_id, target_url=url, mode="replay", owner=runner.instance, heartbeat_at=now_iso())
        await _events(request).create(record)
        await runner.start_replay(record, recording, origin_of(url))
        return CreateAuditResponse(auditId=audit_id, mode="replay", eventsUrl=f"/api/audits/{audit_id}/events")

    if not settings.enable_live:
        if body.mode == "auto":
            raise ApiError(409, "no_recording", "There's no recorded run for this page yet. Try one of the demo stores.")
        raise ApiError(
            501,
            "live_unavailable",
            "Live audits are switched off in this deployment. It replays recorded runs of the demo stores.",
        )
    journey = journey_for(url)
    if journey is None:
        raise ApiError(
            409,
            "no_navigator",
            "The agents don't know how to shop this site. Try a demo store or a real store suggested on the home page.",
        )
    if runner.active_live >= settings.max_live_audits:
        raise ApiError(503, "at_capacity", "Every live browser is busy. Try again in a minute, or replay a recorded run.")
    limits: LiveLimits = request.app.state.limits
    if refusal := await limits.take(visitor_of(request, settings.google_cloud_project)):
        raise ApiError(429, "rate_limited", refusal)

    record = AuditRecord(audit_id=audit_id, target_url=url, mode="live", owner=runner.instance, heartbeat_at=now_iso())
    await _events(request).create(record)
    await runner.start_live(record, journey, previous=previous.report if previous else None, applied=applied)
    return CreateAuditResponse(auditId=audit_id, mode="live", eventsUrl=f"/api/audits/{audit_id}/events")


def _applied_fixes(body: CreateAuditRequest, previous: dict[str, Any] | None, url: str, settings: Settings) -> fixer.Fix:
    """The fixes to verify, checked against the audit they came from and the store's settings."""
    knowledge = load_knowledge(settings.shared_dir)
    current = fixer.current_settings(knowledge, url)
    if previous is None or current is None:
        raise ApiError(400, "invalid_request", "Fixes can be applied only with compareTo, and only to a demo store.")
    plan = fixer.FixPlan(changes=[fixer.Change(**c.model_dump()) for c in body.applyFixes or []])
    fix = fixer.apply_plan(plan, previous["findings"], knowledge, current)
    if not fix.patch or len(fix.changes) != len(plan.changes):
        raise ApiError(
            400, "invalid_request", "Each fix must name a finding of that audit, a setting of this store and a new value."
        )
    return fix


@router.post("/audits/{audit_id}/fixes", response_model=FixProposal)
async def propose_fixes(audit_id: str, request: Request) -> FixProposal:
    """The Fixer's proposal for each finding of a finished audit (docs/API.md)."""
    record = await _record_or_404(request, audit_id)
    if record.status != "completed" or not record.report:
        raise ApiError(409, "not_finished", "Fixes can be proposed once the audit has finished.")
    settings, models = _settings(request), _runner(request).models
    knowledge = load_knowledge(settings.shared_dir)
    findings: list[dict[str, Any]] = record.report["findings"]
    current = fixer.current_settings(knowledge, record.target_url)
    recording = _library(request).match(record.target_url) if record.mode == "replay" else None
    fix = None
    # Only a store whose settings we control can be fixed here; anywhere else every fix is for the site's developers.
    if current is not None and findings and recording is not None and recording.fix_plan is not None:
        # A replay: the plan recorded with it, checked like any other.
        plan = fixer.FixPlan.model_validate({"changes": recording.fix_plan})
        fix = fixer.apply_plan(plan, findings, knowledge, current)
    elif current is not None and findings and models is not None:
        kept: dict[str, fixer.Fix] = request.app.state.fix_proposals
        key = json.dumps([record.target_url, [(f["id"], f["status"], f["title"]) for f in findings]])
        fix = kept.get(key)
        if fix is None:
            try:
                plan = await fixer.write_plan(ModelCaller(settings), models, findings, knowledge, current)
            except ModelError as err:
                log.warning("audit %s: the Fixer had no answer (%s)", audit_id, err)
                message = "The Fixer couldn't write fixes just now. Try again in a moment."
                raise ApiError(503, "fixer_unavailable", message) from err
            fix = kept[key] = fixer.apply_plan(plan, findings, knowledge, current)
            while len(kept) > MAX_PROPOSALS_KEPT:
                kept.pop(next(iter(kept)))
    return FixProposal(
        auditId=audit_id,
        items=fixer.proposal(findings, fix),
        canVerify=bool(fix and fix.patch) and settings.enable_live,
    )


@router.get("/audits/{audit_id}", response_model=AuditStatusResponse, response_model_exclude_none=True)
async def get_audit(audit_id: str, request: Request) -> AuditStatusResponse:
    record = await _record_or_404(request, audit_id)
    return AuditStatusResponse(
        auditId=record.audit_id,
        status=record.status,
        mode=record.mode,
        targetUrl=record.target_url,
        createdAt=record.created_at,
        report=record.report,
        error=record.error,
    )


@router.get("/audits/{audit_id}/events", response_model=None)
async def stream_events(
    audit_id: str,
    request: Request,
    after: int | None = Query(default=None, ge=0),
    last_event_id: str | None = Header(default=None),
) -> Response | EventSourceResponse:
    record = await _record_or_404(request, audit_id)
    events = _events(request)
    cursor = after if after is not None else _parse_seq(last_event_id)

    # Finished and the client already has everything: 204 tells EventSource to stop reconnecting.
    if record.finished and cursor >= await events.last_seq(audit_id):
        return Response(status_code=204)

    async def stream() -> AsyncIterator[dict[str, str]]:
        position = cursor
        while True:
            fresh = False
            for seq, event in await events.read_after(audit_id, position):
                position, fresh = seq, True
                yield {"id": str(seq), "data": json.dumps(event, ensure_ascii=False, separators=(",", ":"))}
                if event["type"] in TERMINAL_EVENTS:
                    return
            if not fresh and (current := await events.get(audit_id)) is not None:
                # Nothing new for a while: make sure the audit still has a live owner (or take it over).
                await _settle_if_abandoned(request, current)
            await events.wait(audit_id, position, max_wait=HEARTBEAT_SECONDS)

    return EventSourceResponse(stream(), ping=HEARTBEAT_SECONDS, headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@router.get("/audits/{audit_id}/frames/{n}.jpg", response_class=Response)
async def get_frame(audit_id: str, n: int, request: Request) -> Response:
    await _record_or_404(request, audit_id)
    frames: FrameStore = request.app.state.frames
    jpeg = await asyncio.to_thread(frames.read, audit_id, n)
    if jpeg is None:
        raise ApiError(404, "not_found", f"Audit {audit_id} has no frame {n}.")
    # Frames never change once written, so the CDN in front (Firebase Hosting) can keep them.
    return Response(jpeg, media_type="image/jpeg", headers={"Cache-Control": "public, max-age=86400, immutable"})


@router.post("/audits/{audit_id}/fast-forward", status_code=202)
async def fast_forward(audit_id: str, request: Request) -> dict[str, bool]:
    record = await _record_or_404(request, audit_id)
    if record.mode != "replay":
        raise ApiError(409, "not_replay", "Only replayed audits can be fast-forwarded.")
    if not record.finished:
        # Instant if this instance runs the replay; the flag reaches it on any other instance within a second.
        _runner(request).fast_forward(audit_id)
        await _events(request).update(audit_id, skip_requested=True)
    return {"ok": True}


def _parse_seq(value: str | None) -> int:
    try:
        return max(0, int(value)) if value else 0
    except ValueError:
        return 0
