"""The public API (docs/API.md)."""

import json
import secrets
from collections.abc import AsyncIterator
from typing import Any

from fastapi import APIRouter, Header, Query, Request, Response
from sse_starlette import EventSourceResponse

from app.browser.url_guard import check_target
from app.config import Settings
from app.contract.models import TERMINAL_EVENTS, AuditStatusResponse, CreateAuditRequest, CreateAuditResponse
from app.errors import ApiError
from app.replay.player import RecordingLibrary, origin_of
from app.runner.runner import AuditRunner
from app.stores.events import AuditRecord, EventLog

router = APIRouter(prefix="/api")

HEARTBEAT_SECONDS = 15


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
    return record


@router.get("/health")
async def health(request: Request) -> dict[str, Any]:
    return {"ok": True, "version": _settings(request).version}


@router.post("/audits", status_code=202, response_model=CreateAuditResponse)
async def create_audit(body: CreateAuditRequest, request: Request) -> CreateAuditResponse:
    settings = _settings(request)
    url = await check_target(body.targetUrl, settings, request.app.state.resolver)

    if body.mode == "live" or settings.model_provider != "replay":
        raise ApiError(
            501,
            "live_unavailable",
            "Live audits aren't switched on yet. This deployment replays recorded runs of the demo stores.",
        )
    recording = _library(request).match(url)
    if recording is None:
        raise ApiError(409, "no_recording", "There's no recorded run for this page yet. Try one of the demo stores.")

    runner = _runner(request)
    if runner.active >= settings.max_concurrent_audits:
        raise ApiError(503, "at_capacity", "All audit slots are busy. Try again in a moment.")

    audit_id = f"aud_{secrets.token_hex(6)}"
    record = AuditRecord(audit_id=audit_id, target_url=url, mode="replay")
    await _events(request).create(record)
    await runner.start_replay(record, recording, origin_of(url))
    return CreateAuditResponse(auditId=audit_id, mode="replay", eventsUrl=f"/api/audits/{audit_id}/events")


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
            for seq, event in await events.read_after(audit_id, position):
                position = seq
                yield {"id": str(seq), "data": json.dumps(event, ensure_ascii=False, separators=(",", ":"))}
                if event["type"] in TERMINAL_EVENTS:
                    return
            await events.wait(audit_id, position, max_wait=HEARTBEAT_SECONDS)

    return EventSourceResponse(stream(), ping=HEARTBEAT_SECONDS, headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@router.post("/audits/{audit_id}/fast-forward", status_code=202)
async def fast_forward(audit_id: str, request: Request) -> dict[str, bool]:
    record = await _record_or_404(request, audit_id)
    if record.mode != "replay":
        raise ApiError(409, "not_replay", "Only replayed audits can be fast-forwarded.")
    return {"ok": _runner(request).fast_forward(audit_id) or record.finished}


def _parse_seq(value: str | None) -> int:
    try:
        return max(0, int(value)) if value else 0
    except ValueError:
        return 0
