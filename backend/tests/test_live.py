"""Real live audits: a headless Chromium walks the built web app (web/dist).

Skipped when web/dist hasn't been built (`npm --prefix web run build`).
"""

import asyncio
import json
from collections.abc import Iterator
from pathlib import Path

import httpx
import pytest
from fastapi import FastAPI

from app.config import REPO_DIR
from app.main import create_app
from app.models import ModelSet
from app.replay.player import RecordingLibrary
from scripts.live import DIST, run_live, serve_dist
from scripts.record import save
from tests.conftest import EVENT_VALIDATOR, fake_resolver, make_settings, parse_sse
from tests.judging import scripted_models

pytestmark = [
    pytest.mark.browser,
    pytest.mark.skipif(not (DIST / "index.html").exists(), reason="web/dist not built"),
]


# Both ways of running an audit: the steps in order, and the ADK agent graph (settings.agent_graph).
GRAPH = pytest.mark.parametrize("agent_graph", [False, True], ids=["pipeline", "graph"])


@pytest.fixture(scope="module")
def web_base() -> Iterator[str]:
    with serve_dist() as base:
        yield base


async def live_audit(
    web_base: str, store: str, tmp_path: Path, models: ModelSet | None = None, agent_graph: bool = False
) -> tuple[list[dict], httpx.Response | None]:
    settings = make_settings(enable_live=True, nav_linger_s=2, frames_dir=tmp_path, agent_graph=agent_graph)
    app = create_app(settings, resolver=fake_resolver, models=models)
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test", timeout=120) as client:
        res = await client.post("/api/audits", json={"targetUrl": f"{web_base}/demo/{store}/p/sonicbuds-pro", "mode": "live"})
        assert (res.status_code, res.json()["mode"]) == (202, "live"), res.text
        audit_id = res.json()["auditId"]
        events = [event for _, event in parse_sse((await client.get(f"/api/audits/{audit_id}/events")).text)]
        frame = await client.get(f"/api/audits/{audit_id}/frames/1.jpg")
    await app.state.runner.shutdown()
    for event in events:
        EVENT_VALIDATOR.validate(event)
    assert events[-1]["type"] == "audit.completed", events[-1]
    return events, frame


def of_type(events: list[dict], kind: str) -> list[dict]:
    return [e for e in events if e["type"] == kind]


@GRAPH
async def test_live_store_a(web_base: str, tmp_path: Path, agent_graph: bool):
    events, frame = await live_audit(web_base, "store-a", tmp_path, agent_graph=agent_graph)
    report = events[-1]["report"]
    assert [s["step"] for s in report["steps"]] == ["product", "variant", "cart", "checkout", "payment"]
    assert sorted(f["patternId"] for f in report["findings"]) == sorted(
        ["false_urgency", "false_urgency", "misleading_price", "basket_sneaking", "subscription_trap", "drip_pricing"]
    )
    assert [(p["label"], p["total"]["amount"]) for p in of_type(events, "price.observed")] == [
        ("Product page", 1499),
        ("Cart", 1698),
        ("Checkout", 1797),
        ("Payment", 1894),
    ]
    assert frame is not None and frame.status_code == 200 and frame.content[:2] == b"\xff\xd8"
    # Every screenshot the events cite is one this audit captured.
    shots = {e["screenshotUrl"] for e in of_type(events, "step.captured")}
    assert {fr["screenshotUrl"] for f in report["findings"] for fr in f["evidence"]["frames"]} <= shots


@GRAPH
async def test_live_store_b_has_no_false_alarms(web_base: str, tmp_path: Path, agent_graph: bool):
    events, _ = await live_audit(web_base, "store-b", tmp_path, agent_graph=agent_graph)
    report = events[-1]["report"]
    assert report["findings"] == [] and report["trustScore"] == 100
    assert len(report["steps"]) == 5
    assert {p["total"]["amount"] for p in of_type(events, "price.observed")} == {1508}


@GRAPH
async def test_live_store_c_stops_at_the_sign_in_wall(web_base: str, tmp_path: Path, agent_graph: bool):
    events, _ = await live_audit(web_base, "store-c", tmp_path, agent_graph=agent_graph)
    report = events[-1]["report"]
    blocked = of_type(events, "step.blocked")
    assert [(b["step"], b["reason"]) for b in blocked] == [("checkout", "Sign-in required")]
    assert blocked[0]["screenshotUrl"]
    assert [(s["step"], s["status"]) for s in report["steps"]][-1] == ("checkout", "blocked")
    assert len(report["findings"]) == 4
    assert not [e for e in of_type(events, "step.started") if e["step"] == "payment"]


async def test_a_recorded_live_run_replays(web_base: str, tmp_path: Path):
    target = f"{web_base}/demo/store-c/p/sonicbuds-pro"
    run = await run_live(target, make_settings(nav_linger_s=2, frames_dir=tmp_path / "frames"), resolver=fake_resolver)
    save("store-c", target, run, tmp_path / "recordings", tmp_path / "public")
    assert sorted(p.name for p in (tmp_path / "public" / "store-c").iterdir())[0] == "1.jpg"

    app = create_app(make_settings(recordings_dir=tmp_path / "recordings"), resolver=fake_resolver)
    assert [r.source for r in RecordingLibrary.load(tmp_path / "recordings").recordings] == ["live"]
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        res = await client.post("/api/audits", json={"targetUrl": "https://shop-honest-ai.web.app/demo/store-c/p/sonicbuds-pro"})
        assert res.json()["mode"] == "replay"
        audit_id = res.json()["auditId"]
        events = [e for _, e in parse_sse((await client.get(f"/api/audits/{audit_id}/events")).text)]
    await app.state.runner.shutdown()
    for event in events:
        EVENT_VALIDATOR.validate(event)
    text = json.dumps(events)
    assert "/recordings/store-c/1.jpg" in text and "/api/audits/" not in text
    assert "https://shop-honest-ai.web.app/demo/store-c/" in text and web_base not in text
    assert events[-1]["report"]["auditId"] == audit_id


# With a model judging (a scripted one: these tests check the pipeline, not a model's accuracy)

ANSWER_KEY = json.loads((REPO_DIR / "shared" / "answer_key.json").read_text(encoding="utf-8"))


def by_pattern_and_step(findings: list[dict]) -> list[tuple[str, str]]:
    return sorted((f["patternId"], f["step"]) for f in findings)


@GRAPH
async def test_judged_store_a_finds_every_planted_pattern(web_base: str, tmp_path: Path, agent_graph: bool):
    events, _ = await live_audit(web_base, "store-a", tmp_path, models=scripted_models(), agent_graph=agent_graph)
    report = events[-1]["report"]
    assert by_pattern_and_step(report["findings"]) == by_pattern_and_step(ANSWER_KEY["store-a"]["findings"])
    status = {(f["patternId"], f["step"], f["status"]) for f in report["findings"]}
    assert ("false_urgency", "product", "needs_review") in status
    assert sum(f["status"] == "needs_review" for f in report["findings"]) == 1
    assert "1 claim sent for human review" in report["summary"]
    # Model findings stream as they're decided, each after its adjudicator verdict.
    logs = [e for e in events if e["type"] == "agent.log"]
    assert any(
        e["agent"] == "pattern_analyst" and e["message"].startswith("Reading the checkout page with a scripted model")
        for e in logs
    )
    assert "reviewed all 5 screens" in [e for e in logs if e["agent"] == "adjudicator"][-1]["message"]


@GRAPH
async def test_judged_store_b_still_has_no_false_alarms(web_base: str, tmp_path: Path, agent_graph: bool):
    events, _ = await live_audit(web_base, "store-b", tmp_path, models=scripted_models(), agent_graph=agent_graph)
    report = events[-1]["report"]
    assert report["findings"] == [] and report["trustScore"] == 100
    dropped = [e["message"] for e in events if e["type"] == "agent.log" and e["agent"] == "evidence"]
    assert any("Delivery options steer the shopper" in m and "similar" in m for m in dropped)


@GRAPH
async def test_a_slow_model_cannot_hold_the_audit_past_its_time_limit(web_base: str, tmp_path: Path, agent_graph: bool):
    settings = make_settings(
        enable_live=True, nav_linger_s=2, frames_dir=tmp_path, audit_timeout_s=20, model_timeout_s=60, agent_graph=agent_graph
    )
    app = create_app(settings, resolver=fake_resolver, models=scripted_models(delay=45))
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test", timeout=120) as client:
        res = await client.post("/api/audits", json={"targetUrl": f"{web_base}/demo/store-c/p/sonicbuds-pro", "mode": "live"})
        events = [e for _, e in parse_sse((await client.get(f"/api/audits/{res.json()['auditId']}/events")).text)]
    await app.state.runner.shutdown()
    report = events[-1]["report"]
    # Measured findings stand; the unfinished model reviews were cancelled, not waited for.
    assert len(report["findings"]) == 4 and all(f["id"].startswith("f-") for f in report["findings"])
    assert any("Ran out of time" in e.get("message", "") for e in events)


# Failures and cancellation come out the same through the agent graph.


async def start_live(web_base: str, store: str, **settings) -> tuple[httpx.AsyncClient, FastAPI, str]:
    app = create_app(make_settings(enable_live=True, **settings), resolver=fake_resolver)
    client = httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test", timeout=120)
    res = await client.post("/api/audits", json={"targetUrl": f"{web_base}/demo/{store}/p/sonicbuds-pro", "mode": "live"})
    assert res.status_code == 202, res.text
    return client, app, res.json()["auditId"]


@GRAPH
async def test_an_audit_past_its_time_limit_fails_with_the_same_message(web_base: str, tmp_path: Path, agent_graph: bool):
    client, app, audit_id = await start_live(
        web_base, "store-a", nav_linger_s=2, frames_dir=tmp_path, audit_timeout_s=1, agent_graph=agent_graph
    )
    events = [e for _, e in parse_sse((await client.get(f"/api/audits/{audit_id}/events")).text)]
    await client.aclose()
    await app.state.runner.shutdown()
    assert events[-1] == {"type": "audit.failed", "error": "The audit took longer than 1 s and was stopped."}


@GRAPH
async def test_a_server_stopping_mid_audit_says_so(web_base: str, tmp_path: Path, agent_graph: bool):
    client, app, audit_id = await start_live(web_base, "store-a", nav_linger_s=5, frames_dir=tmp_path, agent_graph=agent_graph)
    await asyncio.sleep(2)
    await app.state.runner.shutdown()
    record = await app.state.events.get(audit_id)
    await client.aclose()
    assert (record.status, record.error) == ("failed", "The server stopped before the audit finished.")


@GRAPH
async def test_a_live_audit_taken_over_mid_run_stops_without_writing(web_base: str, tmp_path: Path, agent_graph: bool):
    client, app, audit_id = await start_live(
        web_base, "store-a", nav_linger_s=5, frames_dir=tmp_path, heartbeat_s=0.2, agent_graph=agent_graph
    )
    events = app.state.events
    await asyncio.sleep(2)
    await events.update(audit_id, owner="another-instance")  # it took over
    for _ in range(50):
        if app.state.runner.active == 0:
            break
        await asyncio.sleep(0.2)
    written = [e["type"] for _, e in await events.read_after(audit_id, 0)]
    await client.aclose()
    await app.state.runner.shutdown()
    assert app.state.runner.active == 0
    assert "audit.failed" not in written and "audit.completed" not in written


# "Fix it": fixes proposed for a finished audit, verified on a copy of the store; "Re-audit this page".


async def finish(client: httpx.AsyncClient, body: dict) -> tuple[str, list[dict]]:
    res = await client.post("/api/audits", json=body)
    assert res.status_code == 202, res.text
    audit_id = res.json()["auditId"]
    events = [e for _, e in parse_sse((await client.get(f"/api/audits/{audit_id}/events")).text)]
    for event in events:
        EVENT_VALIDATOR.validate(event)
    assert events[-1]["type"] == "audit.completed", events[-1]
    return audit_id, events


async def test_fixes_are_proposed_then_verified_on_a_copy_of_the_store(web_base: str, tmp_path: Path):
    settings = make_settings(enable_live=True, nav_linger_s=2, frames_dir=tmp_path, agent_graph=True)
    app = create_app(settings, resolver=fake_resolver, models=scripted_models())
    url = f"{web_base}/demo/store-a/p/sonicbuds-pro"
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test", timeout=180) as client:
        first, events = await finish(client, {"targetUrl": url, "mode": "live"})
        assert "appliedFixes" not in events[-1]["report"] and "comparison" not in events[-1]["report"]
        assert not any(e["type"] == "agent.log" and e["agent"] == "fixer" for e in events)  # fixing is a separate step

        proposal = (await client.post(f"/api/audits/{first}/fixes")).json()
        assert proposal["canVerify"] is True and len(proposal["items"]) == 9
        kinds = {i["findingId"]: i["kind"] for i in proposal["items"]}
        assert [k for k in kinds.values() if k != "setting"] == ["review"]  # the unsourced "bought" claim: a human's call
        assert all(i["changes"] for i in proposal["items"])
        changes = [
            {"findingId": i["findingId"], "setting": c["setting"], "value": c["to"], "why": c["why"]}
            for i in proposal["items"]
            for c in i["changes"]
        ]

        # Every fix on: every finding is gone from the copy.
        _, events = await finish(client, {"targetUrl": url, "compareTo": first, "applyFixes": changes})
        report = events[-1]["report"]
        assert len(report["appliedFixes"]) == len(changes) and report["findings"] == []
        comparison = report["comparison"]
        assert {r["outcome"] for r in comparison["results"]} == {"resolved"} and comparison["newFindings"] == []
        assert (comparison["trustBefore"], comparison["trustAfter"]) == (22, 100)
        # ₹1,499 plus the ₹97 of fees, now shown from the product page: no protection plan, membership or late fees.
        assert (comparison["payableBefore"]["amount"], comparison["payableAfter"]["amount"]) == (1894, 1596)
        fixer_lines = [e for e in events if e["type"] == "agent.log" and e["agent"] == "fixer"]
        assert {"name": "set", "input": "behaviour.autoAddProtection = off"} in [e.get("tool") for e in fixer_lines]
        assert fixer_lines[-1]["message"].startswith("Verified on the fixed copy: 9 of 9 fixed findings are gone.")

        # Only the protection plan fixed: only that finding is gone.
        only = [c for c in changes if c["findingId"] == "f-sneaked-item"]
        _, events = await finish(client, {"targetUrl": url, "compareTo": first, "applyFixes": only})
        outcomes = {r["findingId"]: r["outcome"] for r in events[-1]["report"]["comparison"]["results"]}
        assert outcomes.pop("f-sneaked-item") == "resolved" and set(outcomes.values()) == {"still_present"}

        # A fix must name a finding of that audit and a setting of this store.
        bad = [{"findingId": "f-sneaked-item", "setting": "behaviour.signInWallAt", "value": "false"}]
        res = await client.post("/api/audits", json={"targetUrl": url, "compareTo": first, "applyFixes": bad})
        assert res.status_code == 400
    await app.state.runner.shutdown()


async def test_re_auditing_a_page_compares_with_the_earlier_audit(web_base: str, tmp_path: Path):
    app = create_app(make_settings(enable_live=True, nav_linger_s=2, frames_dir=tmp_path), resolver=fake_resolver)
    url = f"{web_base}/demo/store-a/p/sonicbuds-pro"
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test", timeout=120) as client:
        first, _ = await finish(client, {"targetUrl": url, "mode": "live"})
        # Another page can't be compared with it.
        store_b = f"{web_base}/demo/store-b/p/sonicbuds-pro"
        assert (await client.post("/api/audits", json={"targetUrl": store_b, "compareTo": first})).status_code == 400
        # Measured-only: no model to write fixes, so every fix is described for the developers.
        proposal = (await client.post(f"/api/audits/{first}/fixes")).json()
        assert proposal["canVerify"] is False and {i["kind"] for i in proposal["items"]} == {"code"}
        _, events = await finish(client, {"targetUrl": url, "compareTo": first})
    await app.state.runner.shutdown()
    comparison = events[-1]["report"]["comparison"]
    assert comparison["previousAuditId"] == first
    # Nothing changed in between: every finding is still there.
    assert {r["outcome"] for r in comparison["results"]} == {"still_present"} and comparison["newFindings"] == []
    assert comparison["trustBefore"] == comparison["trustAfter"]
    assert any("Compared with the earlier audit of this page: 0 of 6" in e.get("message", "") for e in events)
