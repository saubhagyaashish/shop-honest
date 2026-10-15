"""Rule-based checks on real signals from the demo stores, plus honest variants of each trick."""

import copy
from datetime import UTC, datetime, timedelta

import pytest

from app.agents.checks import ALL_CHECKS, Evidence
from app.config import REPO_DIR
from app.contract.models import Finding
from app.knowledge import load_knowledge
from app.prices.facts import History, PricePoint, price_facts
from app.prices.history import JsonPriceHistory
from tests.conftest import load_walk

KNOWLEDGE = load_knowledge(REPO_DIR / "shared")
CATALOG = JsonPriceHistory(REPO_DIR / "shared" / "price_history.json")


def run_checks(ev: Evidence) -> dict[str, dict]:
    return {f["id"]: f for check in ALL_CHECKS for f in check(ev, KNOWLEDGE)}


def store_a() -> Evidence:
    return copy.deepcopy(load_walk("store-a")[0])


def test_store_a_measurable_tricks_are_all_found():
    found = run_checks(store_a())
    assert {(f["id"], f["patternId"], f["step"]) for f in found.values()} == {
        ("f-restarting-timer", "false_urgency", "product"),
        ("f-frozen-stock", "false_urgency", "product"),
        ("f-inflated-mrp", "misleading_price", "product"),
        ("f-sneaked-item", "basket_sneaking", "cart"),
        ("f-pre-ticked-subscription", "subscription_trap", "checkout"),
        ("f-late-fees", "drip_pricing", "payment"),
    }
    for f in found.values():
        Finding.model_validate(f)
        assert f["status"] == "confirmed" and f["confidence"] >= 0.75
        assert f["evidence"]["observations"]
        assert all(frame.get("bbox") for frame in f["evidence"]["frames"]), f["id"]


def test_store_b_is_clean():
    assert run_checks(load_walk("store-b")[0]) == {}


def test_store_c_only_has_findings_before_the_wall():
    assert set(run_checks(load_walk("store-c")[0])) == {
        "f-restarting-timer",
        "f-frozen-stock",
        "f-inflated-mrp",
        "f-sneaked-item",
    }


def test_findings_quote_what_was_measured():
    found = run_checks(store_a())
    assert "09:59" in found["f-restarting-timer"]["explanation"]
    assert "₹97 in fees" in found["f-late-fees"]["title"]
    assert "62% discount" in found["f-inflated-mrp"]["title"] and "7 days ago" in found["f-inflated-mrp"]["title"]
    assert found["f-sneaked-item"]["title"].startswith("1-Year Accidental Damage Protection")
    assert "₹99 a month" in found["f-pre-ticked-subscription"]["explanation"]


# Honest variants: the same journey with one trick removed must not produce that finding.


def test_a_timer_that_counts_down_is_not_flagged():
    ev = store_a()
    first = ev.captures["product-first"].signals["timers"][0]["seconds"]
    for timer in ev.captures["product-reload"].signals["timers"]:
        timer["seconds"] = first - 5
    assert "f-restarting-timer" not in run_checks(ev)


def test_stock_that_changes_between_looks_is_not_flagged():
    ev = store_a()
    ev.captures["variant"].signals["stock"][0]["count"] = 7
    assert "f-frozen-stock" not in run_checks(ev)


def test_large_stock_counts_are_not_scarcity():
    ev = store_a()
    for label in ("product-first", "product-reload", "variant"):
        ev.captures[label].signals["stock"][0]["count"] = 40
    assert "f-frozen-stock" not in run_checks(ev)


def test_an_mrp_the_product_really_sold_at_is_not_flagged():
    ev = store_a()
    # Store B's history: sold at its ₹1,999 MRP for weeks before the sale.
    ev.price_history = CATALOG.get("bazaarnest/demo/store-b/p/sonicbuds-pro")
    for c in ev.captures.values():
        if block := c.signals.get("priceBlock"):
            block["mrp"] = 1999
    assert "f-inflated-mrp" not in run_checks(ev)


def history(*points: tuple[int, float, float]) -> History:
    """(days ago, selling price, MRP) points, oldest first."""
    today = datetime.now(UTC).date()
    return History(
        key="k", currency="INR", points=[PricePoint(day=today - timedelta(days=d), low=p, high=p, mrp=m) for d, p, m in points]
    )


def test_an_mrp_raised_long_ago_is_still_flagged():
    # The demo must not age out: never selling at the MRP is what matters, not how recently it was set.
    ev = store_a()
    ev.price_history = history((150, 1499, 1999), (90, 1599, 1999), (60, 1499, 3999), (0, 1499, 3999))
    found = run_checks(ev)["f-inflated-mrp"]
    assert found["title"] == "62% discount is calculated off an MRP raised 60 days ago"
    assert "₹1,599" in found["remediation"] and "₹3,999" in found["remediation"]


def test_a_fake_mrp_with_no_known_raise_is_still_flagged():
    ev = store_a()
    ev.price_history = history((120, 1499, 3999), (60, 1599, 3999), (0, 1499, 3999))
    assert run_checks(ev)["f-inflated-mrp"]["title"] == "62% discount is calculated off an MRP it never sold at"


@pytest.mark.parametrize("known", ["none", "too_short"])
def test_without_enough_history_the_mrp_claim_is_not_judged(known: str):
    ev = store_a()
    ev.price_history = None if known == "none" else history((40, 1499, 1999), (0, 1499, 3999))
    assert "f-inflated-mrp" not in run_checks(ev)


def test_a_cart_holding_only_what_was_added_is_clean():
    ev = store_a()
    cart = ev.captures["cart"].signals
    cart["cartLines"] = cart["cartLines"][:1]
    assert "f-sneaked-item" not in run_checks(ev)


def test_one_item_added_and_one_line_in_the_cart_is_never_sneaking():
    # Big marketplaces label the line with a deal badge ("Limited time"), not the product's name.
    ev = store_a()
    cart = ev.captures["cart"].signals
    cart["cartLines"] = [{**cart["cartLines"][0], "name": "Limited time", "text": "Limited time ₹1,899.00 Quantity is 1"}]
    assert "f-sneaked-item" not in run_checks(ev)


@pytest.mark.parametrize("change", ["unticked", "one_off"])
def test_membership_needs_to_be_ticked_and_recurring(change: str):
    ev = store_a()
    box = ev.captures["checkout"].signals["checkboxes"][0]
    if change == "unticked":
        box["checked"] = False
    else:
        box["recurring"] = False
    assert "f-pre-ticked-subscription" not in run_checks(ev)


def test_fees_disclosed_on_the_product_page_are_not_drip_pricing():
    ev = store_a()
    ev.captures["product-first"].signals["feeDisclosures"] = [
        {"label": "platform fee", "amount": 29},
        {"label": "handling fee", "amount": 49},
        {"label": "convenience fee", "amount": 19},
    ]
    assert "f-late-fees" not in run_checks(ev)


def test_fees_already_shown_in_the_cart_are_not_drip_pricing():
    ev = store_a()
    payment_rows = ev.captures["payment"].signals["summary"]["rows"]
    ev.captures["cart"].signals["summary"]["rows"] += [r for r in payment_rows if "fee" in r["label"].lower()]
    assert "f-late-fees" not in run_checks(ev)


def test_price_facts_come_from_dates_not_point_counts():
    facts = price_facts(1499, 3999, CATALOG.get("bazaarnest/demo/store-a/p/sonicbuds-pro"))
    assert (facts.weeks, facts.lowest_sold, facts.highest_sold, facts.ever_sold_at_mrp) == (13, 1499, 1599, False)
    assert (facts.prior_mrp, facts.mrp_changed_days_ago) == (1999, 7)
    assert (facts.advertised_discount, facts.real_discount, facts.misleading) == (62, 6, True)
    # Many observations on one day (audits) don't stretch the history.
    busy = history(*[(0, 1499, 3999)] * 40)
    assert price_facts(1499, 3999, busy).weeks == 0


def test_measured_findings_say_specifically_what_to_fix():
    found = run_checks(store_a())
    assert "Platform fee" in found["f-late-fees"]["remediation"]
    assert "1-Year Accidental Damage Protection" in found["f-sneaked-item"]["remediation"]
    assert "₹99/month" in found["f-pre-ticked-subscription"]["remediation"]
    assert "₹1,599" in found["f-inflated-mrp"]["remediation"]
    generic = {KNOWLEDGE.pattern(f["patternId"])["fix"] for f in found.values()}
    assert not generic & {f["remediation"] for f in found.values()}
