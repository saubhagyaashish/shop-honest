import asyncio

import httpx

from app.contract.models import JOURNEY_STEPS
from tests.conftest import EVENT_VALIDATOR, STORE_A, STORE_B, fake_resolver, make_settings, parse_sse, run_audit


async def test_health(client: httpx.AsyncClient):
    res = await client.get("/api/health")
    assert res.status_code == 200 and res.json()["ok"] is True


async def test_store_a_replay_streams_a_valid_ordered_audit(client: httpx.AsyncClient):
    audit_id, events = await run_audit(client, STORE_A)

    # Every event matches the TypeScript contract, ids are 1..n.
    for _, event in events:
        errors = sorted(EVENT_VALIDATOR.iter_errors(event), key=str)
        assert not errors, f"{event['type']}: {errors[0].message}"
    assert [seq for seq, _ in events] == list(range(1, len(events) + 1))

    types = [e["type"] for _, e in events]
    assert types[0] == "audit.started" and types[-1] == "audit.completed"
    assert sum(t in ("audit.completed", "audit.failed") for t in types) == 1

    steps = [e["step"] for _, e in events if e["type"] == "step.started"]
    assert steps == sorted(steps, key=JOURNEY_STEPS.index)

    started = events[0][1]
    assert started["auditId"] == audit_id and started["targetUrl"] == STORE_A
    report = events[-1][1]["report"]
    assert report["auditId"] == audit_id
    assert "__" not in str(report)  # no placeholders left behind
    assert len(report["findings"]) == 9
    assert sum(f["status"] == "confirmed" for f in report["findings"]) == 8


async def test_store_b_is_clean(client: httpx.AsyncClient):
    _, events = await run_audit(client, STORE_B)
    assert not [e for _, e in events if e["type"] == "finding"]
    assert events[-1][1]["report"]["trustScore"] == 100


async def test_get_audit_returns_the_report_when_done(client: httpx.AsyncClient):
    audit_id, _ = await run_audit(client)
    res = await client.get(f"/api/audits/{audit_id}")
    body = res.json()
    assert res.status_code == 200
    assert body["status"] == "completed" and body["mode"] == "replay"
    assert body["report"]["auditId"] == audit_id
    assert "error" not in body


async def test_resume_after_last_event_id(client: httpx.AsyncClient):
    audit_id, events = await run_audit(client)
    resumed = await client.get(f"/api/audits/{audit_id}/events", headers={"Last-Event-ID": "10"})
    later = parse_sse(resumed.text)
    assert [seq for seq, _ in later] == [seq for seq, _ in events if seq > 10]
    via_query = await client.get(f"/api/audits/{audit_id}/events?after=40")
    assert parse_sse(via_query.text)[0][0] == 41


async def test_caught_up_client_gets_204(client: httpx.AsyncClient):
    audit_id, events = await run_audit(client)
    res = await client.get(f"/api/audits/{audit_id}/events", headers={"Last-Event-ID": str(len(events))})
    assert res.status_code == 204


async def test_errors_share_one_shape(client: httpx.AsyncClient):
    cases = [
        ({"targetUrl": "not a url"}, 400, "invalid_url"),
        ({"targetUrl": "https://www.amazon.in/dp/B0"}, 403, "host_not_allowed"),
        ({"targetUrl": "http://localhost:5173/some/other/page"}, 409, "no_recording"),
        ({"targetUrl": STORE_A, "mode": "live"}, 501, "live_unavailable"),
        ({"targetUrl": STORE_A, "mode": "sideways"}, 400, "invalid_request"),
        ({}, 400, "invalid_request"),
    ]
    for body, status, code in cases:
        res = await client.post("/api/audits", json=body)
        assert (res.status_code, res.json()["error"]["code"]) == (status, code), body
        assert res.json()["error"]["message"]
    for path in ("/api/audits/aud_nope", "/api/audits/aud_nope/events", "/api/audits/aud_nope/frames/1.jpg"):
        res = await client.get(path)
        assert (res.status_code, res.json()["error"]["code"]) == (404, "audit_not_found")


async def test_live_mode_errors_without_starting_a_browser():
    from app.main import create_app

    app = create_app(make_settings(enable_live=True, max_live_audits=0), resolver=fake_resolver)
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        cases = [
            ({"targetUrl": "http://localhost:5173/some/other/page"}, 409, "no_navigator"),
            ({"targetUrl": "http://localhost:5173/some/other/page", "mode": "replay"}, 409, "no_recording"),
            ({"targetUrl": STORE_A, "mode": "live"}, 503, "at_capacity"),
        ]
        for body, status, code in cases:
            res = await client.post("/api/audits", json=body)
            assert (res.status_code, res.json()["error"]["code"]) == (status, code), body
        # auto still replays when a recording exists, even with every live browser busy
        res = await client.post("/api/audits", json={"targetUrl": STORE_A})
        assert (res.status_code, res.json()["mode"]) == (202, "replay")
    await app.state.runner.shutdown()


async def test_frames_are_served_for_known_audits(tmp_path):
    from app.main import create_app

    app = create_app(make_settings(frames_dir=tmp_path), resolver=fake_resolver)
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        audit_id = (await client.post("/api/audits", json={"targetUrl": STORE_B})).json()["auditId"]
        assert app.state.frames.save(audit_id, 1, b"\xff\xd8jpeg") == f"/api/audits/{audit_id}/frames/1.jpg"
        res = await client.get(f"/api/audits/{audit_id}/frames/1.jpg")
        assert (res.status_code, res.headers["content-type"], res.content) == (200, "image/jpeg", b"\xff\xd8jpeg")
        res = await client.get(f"/api/audits/{audit_id}/frames/2.jpg")
        assert (res.status_code, res.json()["error"]["code"]) == (404, "not_found")
    await app.state.runner.shutdown()


async def test_fast_forward_finishes_a_slow_replay():
    app_settings = make_settings(replay_speed=1)  # real time: store B takes ~35 s
    from app.main import create_app

    app = create_app(app_settings, resolver=fake_resolver)
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        audit_id = (await client.post("/api/audits", json={"targetUrl": STORE_B})).json()["auditId"]
        await asyncio.sleep(0.2)
        res = await client.post(f"/api/audits/{audit_id}/fast-forward")
        assert res.status_code == 202
        stream = await asyncio.wait_for(client.get(f"/api/audits/{audit_id}/events"), timeout=5)
        assert parse_sse(stream.text)[-1][1]["type"] == "audit.completed"
    await app.state.runner.shutdown()


async def test_capacity_limit():
    from app.main import create_app

    app = create_app(make_settings(replay_speed=1, max_concurrent_audits=1), resolver=fake_resolver)
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        assert (await client.post("/api/audits", json={"targetUrl": STORE_A})).status_code == 202
        busy = await client.post("/api/audits", json={"targetUrl": STORE_B})
        assert (busy.status_code, busy.json()["error"]["code"]) == (503, "at_capacity")
    await app.state.runner.shutdown()


async def test_unknown_routes_use_the_same_error_shape(client: httpx.AsyncClient):
    res = await client.get("/api/nope")
    assert (res.status_code, res.json()["error"]["code"]) == (404, "not_found")
    res = await client.delete("/api/audits")
    assert (res.status_code, res.json()["error"]["code"]) == (405, "method_not_allowed")
