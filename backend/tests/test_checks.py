"""Rule-based checks on real signals from the demo stores, plus honest variants of each trick."""

import copy

import pytest

from app.agents.checks import ALL_CHECKS, Evidence, price_facts
from app.config import REPO_DIR
from app.contract.models import Finding
from app.knowledge import load_knowledge
from tests.conftest import load_walk

KNOWLEDGE = load_knowledge(REPO_DIR / "shared")


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
    # Store B's history: MRP ₹1,999 all quarter and sold at it.
    for c in ev.captures.values():
        c.url = c.url.replace("/store-a/", "/store-b/")
        if block := c.signals.get("priceBlock"):
            block["mrp"] = 1999
    assert "f-inflated-mrp" not in run_checks(ev)


def test_a_cart_holding_only_what_was_added_is_clean():
    ev = store_a()
    cart = ev.captures["cart"].signals
    cart["cartLines"] = cart["cartLines"][:1]
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


def test_price_facts_arithmetic():
    facts = price_facts(1499, 3999, KNOWLEDGE.history_for("http://localhost:5173/demo/store-a/p/sonicbuds-pro"))
    assert facts == {
        "weeks": 13,
        "min_sold": 1499,
        "max_sold": 1599,
        "ever_sold_at_mrp": False,
        "prior_mrp": 1999,
        "mrp_changed_days_ago": 7,
        "mrp_raised_recently": True,
        "advertised_discount": 62,
        "real_discount": 25,
    }
