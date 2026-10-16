import asyncio
import json
from pathlib import Path

import httpx

from app.config import REPO_DIR
from app.contract.models import JOURNEY_STEPS
from evals.answer_key import score
from tests.conftest import EVENT_VALIDATOR, STORE_A, STORE_B, fake_resolver, make_settings, parse_sse, run_audit
from tests.judging import demo_store_fixer


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
    # The recording finds every planted pattern, and nothing that isn't planted or listed as also acceptable.
    result = score("store-a", report["findings"])
    assert (result["hits"], result["missed"], result["false_alarms"]) == (result["expected"], [], [])
    assert result["review_agreed"] == result["review_expected"]


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
        ({"targetUrl": "http://metadata.google.internal/computeMetadata/v1/"}, 403, "host_not_allowed"),
        ({"targetUrl": "http://localhost:5173/some/other/page"}, 409, "no_recording"),
        ({"targetUrl": STORE_A, "mode": "live"}, 501, "live_unavailable"),
        ({"targetUrl": STORE_A, "mode": "sideways"}, 400, "invalid_request"),
        ({"targetUrl": STORE_A, "compareTo": "aud_nope"}, 400, "invalid_request"),
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
            # Any other allowlisted page goes to the general navigator (here: no live browser free).
            ({"targetUrl": "http://localhost:5173/some/other/page"}, 503, "at_capacity"),
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


# "Fix it": the Fixer's proposal for a finished audit.


def recordings_with(tmp_path: Path, fix_plan: list[dict] | None) -> Path:
    """Store A's recording, with this Fixer plan recorded with it (None: none)."""
    data = json.loads((REPO_DIR / "backend" / "app" / "replay" / "recordings" / "store-a.json").read_text())
    data.pop("fixPlan", None)
    if fix_plan is not None:
        data["fixPlan"] = fix_plan
    out = tmp_path / "recordings"
    out.mkdir()
    (out / "store-a.json").write_text(json.dumps(data))
    return out


async def test_a_replay_uses_the_fixer_plan_recorded_with_it(tmp_path: Path):
    from app.main import create_app

    plan = [
        {"findingId": "f-sneaked-item", "setting": "behaviour.autoAddProtection", "value": "false", "why": "No add-on."},
        {"findingId": "f-inflated-mrp", "setting": "behaviour.frozenStock", "value": "false", "why": "Wrong setting."},
    ]
    # No model at all: the recorded plan is enough.
    app = create_app(make_settings(recordings_dir=recordings_with(tmp_path, plan)), resolver=fake_resolver)
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        audit_id, events = await run_audit(client, STORE_A)
        proposal = (await client.post(f"/api/audits/{audit_id}/fixes")).json()
    await app.state.runner.shutdown()
    report = events[-1][1]["report"]
    items = {i["findingId"]: i for i in proposal["items"]}
    assert list(items) == [f["id"] for f in report["findings"]]
    assert items["f-sneaked-item"]["kind"] == "setting" and items["f-sneaked-item"]["changes"][0]["to"] == "off"
    # Checked like any other plan: a setting for another kind of dark pattern is dropped.
    assert items["f-inflated-mrp"]["kind"] == "code" and items["f-inflated-mrp"]["changes"] == []
    assert proposal["canVerify"] is False  # this deployment has no live audits


async def test_fixes_are_proposed_for_a_finished_audit(tmp_path: Path):
    from app.main import create_app
    from app.stores.events import AuditRecord
    from tests.judging import scripted_models

    calls: list[str] = []

    def fixer(user: str) -> list[dict]:
        calls.append(user)
        return demo_store_fixer(user)

    settings = make_settings(recordings_dir=recordings_with(tmp_path, None))
    app = create_app(settings, resolver=fake_resolver, models=scripted_models(fixer=fixer))
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        res = await client.post("/api/audits/aud_nope/fixes")
        assert (res.status_code, res.json()["error"]["code"]) == (404, "audit_not_found")
        running = AuditRecord(audit_id="aud_running", target_url=STORE_A, mode="live", status="running")
        await app.state.events.create(running)
        res = await client.post("/api/audits/aud_running/fixes")
        assert (res.status_code, res.json()["error"]["code"]) == (409, "not_finished")

        # A replay recorded without a plan: the Fixer is asked.
        audit_id, events = await run_audit(client, STORE_A)
        proposal = (await client.post(f"/api/audits/{audit_id}/fixes")).json()
        report = events[-1][1]["report"]
        assert proposal["auditId"] == audit_id and proposal["canVerify"] is False  # this deployment has no live audits
        assert [i["findingId"] for i in proposal["items"]] == [f["id"] for f in report["findings"]]
        for item in proposal["items"]:
            finding = next(f for f in report["findings"] if f["id"] == item["findingId"])
            assert item["kind"] == ("review" if finding["status"] == "needs_review" else "setting")
            assert item["suggestion"] == finding["remediation"]
        sneaked = next(i for i in proposal["items"] if i["findingId"] == "f-sneaked-item")
        assert sneaked["changes"][0] == {
            "findingId": "f-sneaked-item",
            "setting": "behaviour.autoAddProtection",
            "from": "on",
            "to": "off",
            "why": "Fixes f-sneaked-item.",
        }
        # Asked again, or for another replay of the same store: the same proposal, without asking the Fixer again.
        again, _ = await run_audit(client, STORE_A)
        assert (await client.post(f"/api/audits/{again}/fixes")).json()["items"] == proposal["items"]
        assert len(calls) == 1

        # A site whose settings we don't control: every fix is for its developers, and no model is asked.
        real = {**report, "auditId": "aud_real", "targetUrl": "https://www.amazon.in/dp/B0DBGP48NW"}
        record = AuditRecord(audit_id="aud_real", target_url=real["targetUrl"], mode="live", status="completed", report=real)
        await app.state.events.create(record)
        proposal = (await client.post("/api/audits/aud_real/fixes")).json()
        assert {i["kind"] for i in proposal["items"]} == {"code", "review"} and proposal["canVerify"] is False
        assert all(i["changes"] == [] for i in proposal["items"]) and len(calls) == 1
    await app.state.runner.shutdown()
