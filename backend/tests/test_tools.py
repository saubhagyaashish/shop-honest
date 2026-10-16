"""The Adjudicator's evidence tools, on real signals from the demo stores (tests/fixtures)."""

import copy

from app.agents.elements import build_elements
from app.agents.tools import Screen, check_for, compare_looks, describe, measure, seen_elsewhere
from tests.conftest import load_walk


def screen(store: str, label: str, edit=None) -> Screen:
    ev, _ = load_walk(store)
    if edit:
        ev.captures = copy.deepcopy(ev.captures)
        edit(ev.captures)
    capture = ev.captures[label]
    return Screen(capture=capture, elements=build_elements(capture, []), evidence=ev)


def ref(s: Screen, text: str) -> str:
    return next(e.ref for e in s.elements if text.lower() in e.text.lower() and e.kind != "popup")


def test_measure_shows_how_much_louder_the_preferred_option_is():
    s = screen("store-a", "checkout")
    express, standard = ref(s, "upgrade to express"), ref(s, "continue with standard")
    out = measure(s, [standard, express])
    assert out["largest"] == express and out["smallest"] == standard
    assert out["areaRatio"] >= 3 and out["fontRatio"] > 1
    call, line = describe("measure_elements", {"refs": [express, standard]}, out)
    assert call == {"name": "measure_elements", "input": f"{express}, {standard}"}
    assert "UPGRADE TO EXPRESS" in line and "× the space of" in line


def test_measure_finds_even_options_even():
    s = screen("store-b", "checkout")
    options = [e.ref for e in s.elements if e.kind == "radio option" and "delivery" in e.text.lower()]
    assert measure(s, options)["areaRatio"] < 1.5


def test_measure_reports_refs_it_doesnt_know():
    s = screen("store-a", "checkout")
    assert measure(s, ["e99"]) == {"elements": [], "unknown": ["e99"]}


def test_compare_looks_on_a_steady_claim():
    s = screen("store-a", "product-first")
    out = compare_looks(s, ref(s, "bought in the last"))
    assert out["result"] == "unchanged after reload"


def test_compare_looks_catches_a_claim_that_moves():
    def bump(captures):
        captures["product-reload"].signals["salesClaims"][0]["text"] = "🔥 135+ bought in the last 24 hours"

    s = screen("store-a", "product-first", bump)
    out = compare_looks(s, ref(s, "bought in the last"))
    assert out["result"] == "changed after reload"
    assert (out["before"], out["after"]) == ("🔥 120+ bought in the last 24 hours", "🔥 135+ bought in the last 24 hours")
    assert "became" in describe("compare_reloads", {"ref": "e1"}, out)[1]


def test_compare_looks_only_applies_to_the_product_page():
    s = screen("store-a", "checkout")
    assert compare_looks(s, ref(s, "upgrade to express"))["result"] == "not compared"


def test_seen_elsewhere_finds_a_repeated_popup():
    def repeat(captures):
        captures["cart"].signals["dialogs"] = copy.deepcopy(captures["product-popup"].signals["dialogs"])

    s = screen("store-a", "product-popup", repeat)
    out = seen_elsewhere(s, ref(s, "prefer paying full price"))
    assert out["otherScreens"] == ["cart"]
    assert describe("find_on_other_screens", {"ref": "e3"}, out)[1] == "Also shown on the cart."


def test_seen_elsewhere_ignores_the_same_step():
    s = screen("store-a", "product-first")
    assert seen_elsewhere(s, ref(s, "bought in the last"))["otherScreens"] == []


def test_each_kind_of_claim_gets_the_one_check_that_settles_it():
    checkout, product = screen("store-a", "checkout"), screen("store-a", "product-first")
    assert check_for(checkout, "interface_interference")[0].__name__ == "measure_elements"  # type: ignore[index]
    assert check_for(product, "false_urgency")[0].__name__ == "compare_reloads"  # type: ignore[index]
    assert check_for(product, "nagging")[0].__name__ == "find_on_other_screens"  # type: ignore[index]
    # Wording is ruled on directly, and only the product page is looked at twice.
    assert check_for(checkout, "confirm_shaming") is None
    assert check_for(checkout, "false_urgency") is None


def test_the_check_runs_on_its_screen():
    s = screen("store-a", "checkout")
    tool, note = check_for(s, "interface_interference")  # type: ignore[misc]
    out = tool(refs=[ref(s, "upgrade to express"), ref(s, "continue with standard")])
    assert out["areaRatio"] >= 3 and "measure_elements" in note
