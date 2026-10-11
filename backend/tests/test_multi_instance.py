"""Several Cloud Run instances share one event log (Firestore). Two apps on one MemoryEventLog stand in for them."""

import asyncio
from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI

from app.main import create_app
from app.replay.player import origin_of
from app.stores.events import AuditRecord, MemoryEventLog, now_iso
from tests.conftest import STORE_B, fake_resolver, make_settings, parse_sse

LONG_AGO = "2026-01-01T00:00:00.000Z"


@asynccontextmanager
async def client(app: FastAPI):
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test", timeout=30) as c:
        yield c


def instances(**settings):
    shared = MemoryEventLog()
    config = make_settings(**settings)
    return (
        shared,
        create_app(config, resolver=fake_resolver, events=shared),
        create_app(config, resolver=fake_resolver, events=shared),
    )


async def stop(*apps: FastAPI) -> None:
    for app in apps:
        await app.state.runner.shutdown()


async def test_skip_on_one_instance_reaches_the_replay_running_on_another():
    _, one, two = instances(replay_speed=1)
    loop = asyncio.get_running_loop()
    async with client(one) as c1, client(two) as c2:
        audit_id = (await c1.post("/api/audits", json={"targetUrl": STORE_B})).json()["auditId"]
        await asyncio.sleep(0.3)
        assert (await c2.post(f"/api/audits/{audit_id}/fast-forward")).json() == {"ok": True}
        assert (one.state.runner.active, two.state.runner.active) == (1, 0)
        started = loop.time()
        stream = await asyncio.wait_for(c2.get(f"/api/audits/{audit_id}/events"), timeout=10)
        assert parse_sse(stream.text)[-1][1]["type"] == "audit.completed"
        assert loop.time() - started < 5  # in real time, store B's replay takes about 35 s
    await stop(one, two)


async def test_a_replay_whose_instance_died_continues_on_another():
    shared, _, two = instances(abandoned_after_s=1)
    recording = two.state.library.match(STORE_B)
    record = AuditRecord(
        audit_id="aud_orphan",
        target_url=STORE_B,
        mode="replay",
        status="running",
        started_at=now_iso(),
        owner="instance-that-died",
        heartbeat_at=LONG_AGO,
    )
    await shared.create(record)
    played = list(recording.play(record.audit_id, origin_of(STORE_B)))
    for _, event in played[:10]:
        await shared.append(record.audit_id, event)

    async with client(two) as c2:
        events = parse_sse((await asyncio.wait_for(c2.get("/api/audits/aud_orphan/events"), timeout=10)).text)
    assert [seq for seq, _ in events] == list(range(1, len(played) + 1))
    assert [e["type"] for _, e in events] == [e["type"] for _, e in played]
    stored = await shared.get("aud_orphan")
    assert stored is not None and stored.status == "completed" and stored.owner == two.state.runner.instance
    await stop(two)


async def test_a_live_audit_whose_instance_died_fails_within_a_minute_not_eight():
    shared, _, two = instances(abandoned_after_s=1)
    await shared.create(
        AuditRecord(audit_id="aud_lost", target_url=STORE_B, mode="live", status="running", owner="gone", heartbeat_at=LONG_AGO)
    )
    async with client(two) as c2:
        body = (await c2.get("/api/audits/aud_lost")).json()
    assert body["status"] == "failed" and "restarted" in body["error"]
    assert two.state.runner.active == 0
    await stop(two)


async def test_an_alive_owner_is_never_taken_over():
    shared, one, two = instances(replay_speed=1, heartbeat_s=0.1, abandoned_after_s=1)
    async with client(one) as c1, client(two) as c2:
        audit_id = (await c1.post("/api/audits", json={"targetUrl": STORE_B})).json()["auditId"]
        await asyncio.sleep(1.5)  # longer than abandoned_after_s: only the heartbeat keeps it owned
        assert (await c2.get(f"/api/audits/{audit_id}")).json()["status"] == "running"
        assert (await shared.get(audit_id)).owner == one.state.runner.instance
        assert two.state.runner.active == 0
    await stop(one, two)


async def test_an_instance_that_lost_its_audit_stops_without_writing():
    shared, one, _ = instances(replay_speed=1, heartbeat_s=0.1)
    async with client(one) as c1:
        audit_id = (await c1.post("/api/audits", json={"targetUrl": STORE_B})).json()["auditId"]
        await asyncio.sleep(0.3)
        await shared.update(audit_id, owner="another-instance")  # it took over
        await asyncio.sleep(0.5)
    assert one.state.runner.active == 0
    written = [e["type"] for _, e in await shared.read_after(audit_id, 0)]
    assert "audit.failed" not in written and "audit.completed" not in written
    await stop(one)
