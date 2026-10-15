"""The Fixer's rules: which stores it may fix, which changes it keeps, and how a re-audit is compared."""

import json

from app.agents import fixer
from app.agents.checks import ALL_CHECKS
from app.config import REPO_DIR
from app.knowledge import load_knowledge
from app.prices.history import JsonPriceHistory, Observation, ReadOnlyPrices
from tests.conftest import load_walk
from tests.judging import demo_store_fixer

KNOWLEDGE = load_knowledge(REPO_DIR / "shared")
STORE_A = "http://localhost:5173/demo/store-a/p/sonicbuds-pro"


def store_a_findings() -> list[dict]:
    ev, _ = load_walk("store-a")
    return [f for check in ALL_CHECKS for f in check(ev, KNOWLEDGE)]


def plan(*changes: tuple[str, str, str]) -> fixer.FixPlan:
    return fixer.FixPlan(changes=[fixer.Change(findingId=f, setting=s, value=v, why="w") for f, s, v in changes])


def test_only_stores_whose_settings_we_control_can_be_fixed():
    assert fixer.current_settings(KNOWLEDGE, STORE_A)["behaviour.autoAddProtection"] is True
    assert fixer.current_settings(KNOWLEDGE, "https://shop-honest-ai.web.app/demo/store-c/p/sonicbuds-pro") is not None
    assert fixer.current_settings(KNOWLEDGE, "https://www.amazon.in/dp/B0DBGP48NW") is None
    assert fixer.current_settings(KNOWLEDGE, "https://example.com/demo/store-a/p/sonicbuds-pro") is None  # not ours


def test_the_store_settings_cover_every_trick_behaviour():
    keys = {s["key"] for s in KNOWLEDGE.store_settings["settings"]}
    behaviour = json.loads((REPO_DIR / "shared" / "store_settings.json").read_text())["stores"]["store-a"]
    assert keys == set(behaviour)
    assert all(value is True for key, value in behaviour.items() if key.startswith("behaviour."))


def test_changes_are_kept_only_for_real_findings_settings_and_values():
    findings = store_a_findings()
    current = fixer.current_settings(KNOWLEDGE, STORE_A)
    fix = fixer.apply_plan(
        plan(
            ("f-sneaked-item", "behaviour.autoAddProtection", "false"),
            ("f-late-fees", "upfrontPlatformFee", "₹97"),
            ("f-sneaked-item", "behaviour.signInWallAt", "false"),  # not a setting the Fixer may change
            ("f-inflated-mrp", "behaviour.frozenStock", "false"),  # a setting for another kind of dark pattern
            ("f-made-up", "behaviour.frozenStock", "false"),  # no such finding
            ("f-frozen-stock", "behaviour.frozenStock", "maybe"),  # not on/off
            ("f-restarting-timer", "behaviour.resettingTimer", "true"),  # already the value: no change
        ),
        findings,
        KNOWLEDGE,
        current,
    )
    assert fix.patch == {"behaviour.autoAddProtection": False, "upfrontPlatformFee": 97}
    assert [(c["setting"], c["from"], c["to"]) for c in fix.changes] == [
        ("behaviour.autoAddProtection", "on", "off"),
        ("upfrontPlatformFee", "₹0", "₹97"),
    ]
    assert set(fix.unfixed) == {f["id"] for f in findings} - {"f-sneaked-item", "f-late-fees"}


def test_a_good_plan_fixes_every_store_a_finding():
    findings = store_a_findings()
    current = fixer.current_settings(KNOWLEDGE, STORE_A)
    text = fixer.request_parts(findings, KNOWLEDGE, current)[0].text
    fix = fixer.apply_plan(fixer.FixPlan(changes=demo_store_fixer(text)), findings, KNOWLEDGE, current)
    assert fix.unfixed == [] and len(fix.changes) == len(findings) + 1  # late fees: two changes
    # The prompt shows every finding with its evidence, and every setting with its current value.
    assert "f-inflated-mrp · misleading_price at the product step" in text
    assert "- behaviour.autoAddProtection [on] (for basket sneaking):" in text
    assert "- upfrontPlatformFee [0] (for drip pricing):" in text


def test_a_re_audit_finds_the_same_finding_by_check_or_by_screen_and_pattern():
    before = [
        {"id": "f-restarting-timer", "title": "Timer", "patternId": "false_urgency", "step": "product"},
        {"id": "f-frozen-stock", "title": "Stock", "patternId": "false_urgency", "step": "product"},
        {"id": "m-product-popup-confirm_shaming-1", "title": "Shame", "patternId": "confirm_shaming", "step": "product"},
        {"id": "m-checkout-false_urgency-2", "title": "Bought", "patternId": "false_urgency", "step": "checkout"},
    ]
    after = [
        # The stock counter is fixed, the timer isn't: one doesn't hide the other.
        {"id": "f-restarting-timer", "title": "Timer", "patternId": "false_urgency", "step": "product"},
        # A model numbers its findings per screen, so the same one may come back with another number.
        {"id": "m-checkout-false_urgency-1", "title": "Bought again", "patternId": "false_urgency", "step": "checkout"},
        {"id": "m-cart-nagging-1", "title": "New nag", "patternId": "nagging", "step": "cart"},
    ]
    v = fixer.verify(before, after, trust_before=70, trust_after=82, payable_before=None, payable_after=None)
    assert [(r["findingId"], r["outcome"]) for r in v["results"]] == [
        ("f-restarting-timer", "still_present"),
        ("f-frozen-stock", "resolved"),
        ("m-product-popup-confirm_shaming-1", "resolved"),
        ("m-checkout-false_urgency-2", "still_present"),
    ]
    assert v["newFindings"] == [{"title": "New nag", "patternId": "nagging", "step": "cart"}]
    line = fixer.outcome_line(v, fixed={"f-restarting-timer", "f-frozen-stock"})
    assert "1 of 2 fixed findings are gone" in line and "New nag" in line


def test_each_finding_is_fixed_here_by_its_developers_or_a_human_call():
    findings = store_a_findings()
    current = fixer.current_settings(KNOWLEDGE, STORE_A)
    fix = fixer.apply_plan(plan(("f-sneaked-item", "behaviour.autoAddProtection", "false")), findings, KNOWLEDGE, current)
    review = {**findings[0], "id": "m-checkout-false_urgency-1", "status": "needs_review"}
    items = {i["findingId"]: i for i in fixer.proposal([*findings, review], fix)}
    assert items["f-sneaked-item"]["kind"] == "setting" and items["f-sneaked-item"]["changes"] == fix.changes
    assert items["f-late-fees"]["kind"] == "code" and items["f-late-fees"]["changes"] == []
    assert items["f-late-fees"]["suggestion"] == next(f["remediation"] for f in findings if f["id"] == "f-late-fees")
    assert items["m-checkout-false_urgency-1"]["kind"] == "review"
    # Without a Fixer (a site we don't control, or no model): no changes, only fixes in words.
    assert {i["kind"] for i in fixer.proposal(findings, None)} == {"code"}


async def test_the_fixed_copy_never_records_prices():
    catalog = JsonPriceHistory(REPO_DIR / "shared" / "price_history.json")
    recorded: list[Observation] = []

    class Recording:
        name = catalog.name

        async def lookup(self, key: str):
            return await catalog.lookup(key)

        async def record(self, observation: Observation) -> None:
            recorded.append(observation)

    prices = ReadOnlyPrices(Recording())
    assert await prices.lookup("bazaarnest/demo/store-a/p/sonicbuds-pro") is not None
    await prices.record(Observation(key="/demo/store-a/p/sonicbuds-pro", price=1499, mrp=1599, currency="INR", audit_id="a"))
    assert recorded == []
