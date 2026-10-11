"""One contract for every store implementation: in-memory always; Firestore and Cloud Storage with -m cloud.

Cloud tests write under a unique prefix and delete what they wrote.
"""

import asyncio
import os
import secrets
from collections.abc import AsyncIterator, Iterator

import httpx
import pytest

from app.api.limits import MemoryLimits
from app.config import Settings
from app.stores.events import AuditRecord, EventLog, MemoryEventLog
from app.stores.frames import FrameStore, LocalFrameStore
from tests.conftest import STORE_A, fake_resolver, make_settings

CLOUD = os.environ.get("SHOP_HONEST_CLOUD_TESTS") == "1"
cloud = [pytest.mark.cloud, pytest.mark.skipif(not CLOUD, reason="set SHOP_HONEST_CLOUD_TESTS=1 to use the real project")]
PREFIX = f"test-{secrets.token_hex(4)}-"


def cloud_settings() -> Settings:
    return make_settings(store_backend="gcp", store_prefix=PREFIX)


@pytest.fixture(params=["memory", pytest.param("firestore", marks=cloud)])
async def events(request) -> AsyncIterator[EventLog]:
    if request.param == "memory":
        yield MemoryEventLog()
        return
    from google.cloud import firestore

    from app.stores.firestore_events import FirestoreEventLog

    client = firestore.AsyncClient(project=cloud_settings().google_cloud_project)
    yield FirestoreEventLog(client, prefix=PREFIX, poll_s=0.2)
    async for doc in client.collection(f"{PREFIX}audits").list_documents():
        async for event in doc.collection("events").list_documents():
            await event.delete()
        await doc.delete()


@pytest.fixture(params=["local", pytest.param("gcs", marks=cloud)])
def frames(request, tmp_path) -> Iterator[FrameStore]:
    if request.param == "local":
        yield LocalFrameStore(tmp_path)
        return
    from app.stores.frames import GcsFrameStore

    settings = cloud_settings()
    store = GcsFrameStore(settings.frames_bucket, project=settings.google_cloud_project, prefix=PREFIX)
    yield store
    for blob in store._bucket.list_blobs(prefix=PREFIX):
        blob.delete()


def new_record(**fields) -> AuditRecord:
    return AuditRecord(audit_id=f"aud_{secrets.token_hex(6)}", target_url=STORE_A, mode="replay", **fields)


# Event log


async def test_records_round_trip(events: EventLog):
    record = new_record()
    await events.create(record)
    assert await events.get(record.audit_id) == record
    report = {"auditId": record.audit_id, "findings": [{"id": "f-1", "evidence": {"frames": [{"bbox": {"x": 0.1}}]}}]}
    await events.update(record.audit_id, status="completed", completed_at="2026-10-11T00:00:00Z", report=report)
    stored = await events.get(record.audit_id)
    assert stored is not None and stored.finished and stored.report == report
    assert await events.get("aud_missing") is None


async def test_events_keep_their_order_and_resume_from_any_point(events: EventLog):
    record = new_record()
    await events.create(record)
    sent = [{"type": "agent.log", "agent": "navigator", "message": f"step {i}"} for i in range(12)]
    assert [await events.append(record.audit_id, e) for e in sent] == list(range(1, 13))
    assert [e for _, e in await events.read_after(record.audit_id, 0)] == sent
    assert [seq for seq, _ in await events.read_after(record.audit_id, 9)] == [10, 11, 12]
    assert await events.last_seq(record.audit_id) == 12


async def test_concurrent_appends_get_unique_ordered_numbers(events: EventLog):
    # The navigator and background model reviews write to the same audit at the same time.
    record = new_record()
    await events.create(record)
    sent = [{"type": "agent.log", "agent": "navigator", "message": f"m{i}"} for i in range(15)]
    seqs = await asyncio.gather(*(events.append(record.audit_id, e) for e in sent))
    assert sorted(seqs) == list(range(1, 16))
    stored = await events.read_after(record.audit_id, 0)
    assert [seq for seq, _ in stored] == list(range(1, 16))
    assert sorted(e["message"] for _, e in stored) == sorted(e["message"] for e in sent)


async def test_waiting_wakes_on_a_new_event_and_times_out_without_one(events: EventLog):
    record = new_record()
    await events.create(record)
    loop = asyncio.get_running_loop()
    started = loop.time()
    await events.wait(record.audit_id, 0, max_wait=0.3)
    assert loop.time() - started >= 0.25

    async def later() -> None:
        await asyncio.sleep(0.1)
        await events.append(record.audit_id, {"type": "audit.started"})

    task = asyncio.create_task(later())
    started = loop.time()
    await events.wait(record.audit_id, 0, max_wait=5)
    await task
    assert loop.time() - started < 2


# Frames


def test_frames_round_trip(frames: FrameStore):
    audit_id = f"aud_{secrets.token_hex(6)}"
    assert frames.save(audit_id, 1, b"\xff\xd8one") == f"/api/audits/{audit_id}/frames/1.jpg"
    assert frames.read(audit_id, 1) == b"\xff\xd8one"
    assert frames.read(audit_id, 2) is None


# Live-audit limits


async def test_limits_per_visitor_and_per_day():
    limits = MemoryLimits(make_settings(live_per_ip_per_hour=2, live_per_day=3))
    assert [await limits.take("v1"), await limits.take("v1")] == [None, None]
    assert "this hour" in (await limits.take("v1") or "")
    assert await limits.take("v2") is None
    assert "daily limit" in (await limits.take("v3") or "")


async def test_no_limits_by_default():
    limits = MemoryLimits(make_settings())
    for _ in range(20):
        assert await limits.take("v") is None


async def test_the_api_refuses_live_audits_over_the_limit_without_starting_a_browser():
    from app.main import create_app

    app = create_app(make_settings(enable_live=True, live_per_day=1), resolver=fake_resolver)
    assert await app.state.limits.take("someone else") is None  # the day's only live audit is gone
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        res = await client.post("/api/audits", json={"targetUrl": STORE_A, "mode": "live"})
        assert (res.status_code, res.json()["error"]["code"]) == (429, "rate_limited")
        # Replays aren't limited.
        res = await client.post("/api/audits", json={"targetUrl": STORE_A})
        assert (res.status_code, res.json()["mode"]) == (202, "replay")
    assert app.state.runner.active_live == 0
    await app.state.runner.shutdown()


# Audits abandoned by a restarted server


async def test_an_audit_left_running_past_its_time_limit_is_closed():
    from app.main import create_app

    app = create_app(make_settings(audit_timeout_s=10), resolver=fake_resolver)
    stale = new_record(status="running", created_at="2026-01-01T00:00:00.000Z")
    await app.state.events.create(stale)
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        body = (await client.get(f"/api/audits/{stale.audit_id}")).json()
        assert body["status"] == "failed" and "restarted" in body["error"]
        stream = await client.get(f"/api/audits/{stale.audit_id}/events")
        assert '"audit.failed"' in stream.text
    await app.state.runner.shutdown()
