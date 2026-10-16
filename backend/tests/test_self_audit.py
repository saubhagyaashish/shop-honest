"""What the CCPA self-audit report relies on: how each pattern is checked (shared/patterns.json), and the steps a model judged."""

from app.agents.checks import ALL_CHECKS
from app.agents.pattern_analyst import JUDGED
from app.agents.reporter import build_report
from app.config import REPO_DIR
from app.contract.models import AuditReport, dump
from app.knowledge import load_knowledge
from tests.conftest import EVENT_VALIDATOR, load_walk

KNOWLEDGE = load_knowledge(REPO_DIR / "shared")
CCPA_13 = [p for p, info in KNOWLEDGE.patterns.items() if info["rule"]["source"].startswith("CCPA")]


def test_the_thirteen_ccpa_patterns_each_say_how_they_are_checked():
    assert len(CCPA_13) == 13
    for pattern in CCPA_13:
        check = KNOWLEDGE.pattern(pattern)["check"]
        assert check.get("measured") or check.get("judged") or check.get("limits"), pattern


def test_judged_patterns_match_the_pattern_analyst():
    assert {p for p, info in KNOWLEDGE.patterns.items() if info["check"].get("judged")} == set(JUDGED)


def test_every_measured_finding_comes_from_a_pattern_marked_measured():
    measured = {p for p, info in KNOWLEDGE.patterns.items() if info["check"].get("measured")}
    for store in ("store-a", "store-b", "store-c"):
        ev, _ = load_walk(store)
        found = {f["patternId"] for check in ALL_CHECKS for f in check(ev, KNOWLEDGE)}
        assert found <= measured, (store, found - measured)


def report_with(reviewed: set[str] | None) -> dict:
    ev, steps = load_walk("store-c")
    report = build_report(
        audit_id="aud_test",
        target_url="http://localhost:5173/demo/store-c/p/sonicbuds-pro",
        started_at="2026-10-15T10:00:00Z",
        completed_at="2026-10-15T10:00:30Z",
        steps=steps,
        findings=[],
        ev=ev,
        knowledge=KNOWLEDGE,
        reviewed_steps=reviewed,
    )
    return dump(AuditReport.model_validate(report))


def test_the_report_lists_the_steps_a_model_judged_in_journey_order():
    report = report_with({"cart", "product"})
    assert report["reviewedSteps"] == ["product", "cart"]
    EVENT_VALIDATOR.validate({"type": "audit.completed", "report": report})


def test_a_measured_only_audit_says_no_step_was_judged():
    assert report_with(set())["reviewedSteps"] == []
    assert "reviewedSteps" not in report_with(None)
