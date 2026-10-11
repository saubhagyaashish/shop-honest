"""Real live audits: a headless Chromium walks the built web app (web/dist).

Skipped when web/dist hasn't been built (`npm --prefix web run build`).
"""

import json
from collections.abc import Iterator
from pathlib import Path

import httpx
import pytest

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


@pytest.fixture(scope="module")
def web_base() -> Iterator[str]:
    with serve_dist() as base:
        yield base


async def live_audit(
    web_base: str, store: str, tmp_path: Path, models: ModelSet | None = None
) -> tuple[list[dict], httpx.Response | None]:
    settings = make_settings(enable_live=True, nav_linger_s=2, frames_dir=tmp_path)
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


async def test_live_store_a(web_base: str, tmp_path: Path):
    events, frame = await live_audit(web_base, "store-a", tmp_path)
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


async def test_live_store_b_has_no_false_alarms(web_base: str, tmp_path: Path):
    events, _ = await live_audit(web_base, "store-b", tmp_path)
    report = events[-1]["report"]
    assert report["findings"] == [] and report["trustScore"] == 100
    assert len(report["steps"]) == 5
    assert {p["total"]["amount"] for p in of_type(events, "price.observed")} == {1508}


async def test_live_store_c_stops_at_the_sign_in_wall(web_base: str, tmp_path: Path):
    events, _ = await live_audit(web_base, "store-c", tmp_path)
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
        res = await client.post("/api/audits", json={"targetUrl": "https://shop-honest.web.app/demo/store-c/p/sonicbuds-pro"})
        assert res.json()["mode"] == "replay"
        audit_id = res.json()["auditId"]
        events = [e for _, e in parse_sse((await client.get(f"/api/audits/{audit_id}/events")).text)]
    await app.state.runner.shutdown()
    for event in events:
        EVENT_VALIDATOR.validate(event)
    text = json.dumps(events)
    assert "/recordings/store-c/1.jpg" in text and "/api/audits/" not in text
    assert "https://shop-honest.web.app/demo/store-c/" in text and web_base not in text
    assert events[-1]["report"]["auditId"] == audit_id


# With a model judging (a scripted one: these tests check the pipeline, not a model's accuracy)

ANSWER_KEY = json.loads((REPO_DIR / "shared" / "answer_key.json").read_text(encoding="utf-8"))


def by_pattern_and_step(findings: list[dict]) -> list[tuple[str, str]]:
    return sorted((f["patternId"], f["step"]) for f in findings)


async def test_judged_store_a_finds_every_planted_pattern(web_base: str, tmp_path: Path):
    events, _ = await live_audit(web_base, "store-a", tmp_path, models=scripted_models())
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


async def test_judged_store_b_still_has_no_false_alarms(web_base: str, tmp_path: Path):
    events, _ = await live_audit(web_base, "store-b", tmp_path, models=scripted_models())
    report = events[-1]["report"]
    assert report["findings"] == [] and report["trustScore"] == 100
    dropped = [e["message"] for e in events if e["type"] == "agent.log" and e["agent"] == "evidence"]
    assert any("Delivery options steer the shopper" in m and "similar" in m for m in dropped)


async def test_a_slow_model_cannot_hold_the_audit_past_its_time_limit(web_base: str, tmp_path: Path):
    settings = make_settings(enable_live=True, nav_linger_s=2, frames_dir=tmp_path, audit_timeout_s=20, model_timeout_s=60)
    app = create_app(settings, resolver=fake_resolver, models=scripted_models(delay=45))
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test", timeout=120) as client:
        res = await client.post("/api/audits", json={"targetUrl": f"{web_base}/demo/store-c/p/sonicbuds-pro", "mode": "live"})
        events = [e for _, e in parse_sse((await client.get(f"/api/audits/{res.json()['auditId']}/events")).text)]
    await app.state.runner.shutdown()
    report = events[-1]["report"]
    # Measured findings stand; the unfinished model reviews were cancelled, not waited for.
    assert len(report["findings"]) == 4 and all(f["id"].startswith("f-") for f in report["findings"])
    assert any("Ran out of time" in e.get("message", "") for e in events)
