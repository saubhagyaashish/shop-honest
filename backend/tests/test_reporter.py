"""The report built from real walks: score, summary, price drift and legal exposure."""

from app.agents.checks import ALL_CHECKS
from app.agents.reporter import build_report
from app.config import REPO_DIR
from app.contract.models import AuditReport, dump
from app.knowledge import load_knowledge
from tests.conftest import EVENT_VALIDATOR, load_walk

KNOWLEDGE = load_knowledge(REPO_DIR / "shared")


def report_for(store: str) -> dict:
    ev, steps = load_walk(store)
    findings = [f for check in ALL_CHECKS for f in check(ev, KNOWLEDGE)]
    report = build_report(
        audit_id="aud_test",
        target_url=f"http://localhost:5173/demo/{store}/p/sonicbuds-pro",
        started_at="2026-10-10T10:00:00Z",
        completed_at="2026-10-10T10:00:30Z",
        steps=steps,
        findings=findings,
        ev=ev,
        knowledge=KNOWLEDGE,
    )
    return dump(AuditReport.model_validate(report))


def amounts(lines: list[dict]) -> list[tuple]:
    return [(line["kind"], line["firstSeen"], line["amount"]["amount"], line.get("findingId")) for line in lines]


def test_reports_match_the_event_schema():
    for store in ("store-a", "store-b", "store-c"):
        EVENT_VALIDATOR.validate({"type": "audit.completed", "report": report_for(store)})


def test_store_a_price_drift_adds_up():
    report = report_for("store-a")
    drift = report["exposure"]["priceDrift"]
    assert (drift["advertised"]["amount"], drift["payable"]["amount"]) == (1499, 1894)
    assert amounts(drift["lines"]) == [
        ("sneaked_item", "cart", 199, "f-sneaked-item"),
        ("subscription", "checkout", 99, "f-pre-ticked-subscription"),
        ("fee", "payment", 29, "f-late-fees"),
        ("fee", "payment", 49, "f-late-fees"),
        ("fee", "payment", 19, "f-late-fees"),
    ]
    assert drift["advertised"]["amount"] + sum(line["amount"]["amount"] for line in drift["lines"]) == drift["payable"]["amount"]
    assert drift["lines"][1]["recurring"] == "monthly"
    assert (drift["claimedSaving"]["amount"], drift["genuineSaving"]["amount"], drift["savingFindingId"]) == (
        2500,
        500,
        "f-inflated-mrp",
    )


def test_store_a_score_and_summary():
    report = report_for("store-a")
    assert report["trustScore"] == 100 - 5 * 12 - 6
    assert report["summary"] == (
        "6 violations confirmed across 4 of 5 journey steps. "
        "The amount payable rose from ₹1,499 on the product page to ₹1,894 (+26%)."
    )
    assert [s["step"] for s in report["steps"]] == ["product", "variant", "cart", "checkout", "payment"]


def test_store_b_report_is_clean():
    report = report_for("store-b")
    drift = report["exposure"]["priceDrift"]
    assert report["trustScore"] == 100 and report["findings"] == []
    assert (drift["advertised"]["amount"], drift["payable"]["amount"], drift["lines"]) == (1508, 1508, [])
    assert drift["claimedSaving"] == drift["genuineSaving"]
    assert report["summary"].startswith("No deceptive patterns found on all 5 steps")


def test_store_c_report_is_partial():
    report = report_for("store-c")
    assert [(s["step"], s["status"]) for s in report["steps"]] == [
        ("product", "audited"),
        ("variant", "audited"),
        ("cart", "audited"),
        ("checkout", "blocked"),
    ]
    assert report["steps"][-1]["blockedReason"] == "Sign-in required"
    assert report["exposure"]["priceDrift"]["payable"]["amount"] == 1698
    assert report["summary"].endswith("Checkout and Payment could not be audited: sign-in required.")
    assert "of the 3 reachable journey steps" in report["summary"]


def test_exposure_cites_a_rule_per_finding_in_every_region():
    report = report_for("store-a")
    ids = {f["id"] for f in report["findings"]}
    regions = report["exposure"]["jurisdictions"]
    assert {r["code"] for r in regions} == {"IN", "SG", "GB", "EU", "US", "KR", "AU"}
    for region in regions:
        assert set(region["citations"]) == ids
