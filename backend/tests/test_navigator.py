"""The general navigator: the click guard, the model fallback, page signals on real-site patterns, and a full walk.

The fixture store (tests/sites/) mimics what real stores do: Rs. prices, the product name in an h2 beside a
sidebar of headings, a cookie banner, an "Add to cart" built from plain divs, a cart "x" link and a
"Proceed To Checkout" without an href, and checkout behind "Register / Login account to proceed".
"""

import json
import os
from pathlib import Path

import httpx
import pytest

from app.agents.judge import Judge
from app.config import REPO_DIR
from app.journeys.generic import CHECKOUT, allowed
from app.knowledge import load_knowledge
from app.main import create_app
from app.models import ModelSet
from app.models.scripted import ScriptedLlm
from scripts.live import serve_dist
from tests.conftest import EVENT_VALIDATOR, fake_resolver, make_settings, parse_sse

SITES = Path(__file__).parent / "sites"
SIGNALS = (REPO_DIR / "backend" / "app" / "browser" / "signals.js").read_text(encoding="utf-8")


# The click guard


@pytest.mark.parametrize("text", ["Add to cart", "View Cart", "Go to cart", "Close", "Reject all", "Continue Shopping"])
def test_ordinary_shopping_clicks_are_allowed(text: str):
    assert allowed(text)


@pytest.mark.parametrize(
    "text",
    ["Pay ₹1,894", "Buy now", "Place Order", "Confirm order", "Sign in", "Login", "Register / Login", "Sign up", "Accept all"],
)
def test_the_agent_never_pays_signs_in_or_accepts(text: str):
    assert not allowed(text)


def test_only_the_checkout_step_may_press_place_order():
    assert allowed("Place Order", allow=CHECKOUT) and allowed("Proceed To Checkout", allow=CHECKOUT)
    assert not allowed("Pay now", allow=CHECKOUT)


# The model fallback


async def test_the_model_can_pick_a_control_but_only_one_that_exists():
    controls = [{"ref": "c1", "text": "Home", "kind": "link", "href": "/"}, {"ref": "c2", "text": "ADD TO BAG", "kind": "button"}]

    def judge_answering(ref: str | None) -> Judge:
        model = ScriptedLlm(responder=lambda s, u, i: json.dumps({"reason": "test", "ref": ref}))
        return Judge(ModelSet(smart=model, fast=model, name="scripted"), load_knowledge(REPO_DIR / "shared"), make_settings())

    assert await judge_answering("c2").pick("adds this product to the cart", controls) == "c2"
    assert await judge_answering(None).pick("adds this product to the cart", controls) is None
    assert await judge_answering("c99").pick("adds this product to the cart", controls) is None


# Page signals on real-site patterns (a browser, no internet)


async def signals_of(html: str) -> dict:
    from playwright.async_api import async_playwright

    async with async_playwright() as pw:
        browser = await pw.chromium.launch()
        page = await browser.new_page(viewport={"width": 1280, "height": 800})
        await page.set_content(html)
        signals = await page.evaluate(SIGNALS)
        await browser.close()
    return signals


@pytest.mark.browser
async def test_rupee_prices_written_as_rs_and_the_product_name_beside_the_price():
    s = await signals_of((SITES / "product.html").read_text())
    assert s["mainPrice"]["price"] == 799
    assert s["heading"] == "Linen Shirt"  # not the sidebar's "CATEGORY" or "BRANDS"


@pytest.mark.browser
async def test_an_mrp_struck_without_its_rupee_sign_beside_the_title():
    html = """<h1>Earbuds Pro</h1><div><s>3,999</s> <b style="font-size:28px">₹699</b> 82% off</div>
              <div style="margin-top:900px"><h3>Sponsored</h3><s>₹2,999</s> <b>₹599</b></div>"""
    block = (await signals_of(html))["priceBlock"]
    assert (block["price"], block["mrp"]) == (699, 3999)


@pytest.mark.browser
async def test_cart_rows_with_an_x_remove_link():
    lines = (await signals_of((SITES / "cart.html").read_text()))["cartLines"]
    assert [(line["name"], line["amount"]) for line in lines] == [("Linen Shirt", 799)]


@pytest.mark.browser
@pytest.mark.parametrize(
    "html",
    [
        "<p>Register / Login account to proceed on checkout.</p>",
        "<h3>Login or Signup</h3><input type=tel placeholder='Mobile number'><button>Request OTP</button>",
        "<form><input type=password></form>",
    ],
)
async def test_sign_in_walls_in_their_usual_wordings(html: str):
    assert (await signals_of(html))["signInWall"]["reason"] == "Sign-in required"


@pytest.mark.browser
async def test_bot_walls_and_error_pages_are_recognised():
    assert (await signals_of("<h1>Please verify you are human</h1>"))["botWall"]
    assert (await signals_of("<p>Something went wrong! Please try again later.</p><button>Retry</button>"))["pageError"]
    assert not (await signals_of((SITES / "product.html").read_text()))["pageError"]


# A full walk of the fixture store


@pytest.mark.browser
async def test_a_logged_out_walk_of_a_store_we_did_not_build(tmp_path):
    with serve_dist(SITES) as base:
        app = create_app(make_settings(enable_live=True, nav_linger_s=1, frames_dir=tmp_path), resolver=fake_resolver)
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test", timeout=120) as client:
            res = await client.post("/api/audits", json={"targetUrl": f"{base}/product.html", "mode": "live"})
            assert (res.status_code, res.json()["mode"]) == (202, "live"), res.text
            events = [e for _, e in parse_sse((await client.get(f"/api/audits/{res.json()['auditId']}/events")).text)]
        await app.state.runner.shutdown()
    for event in events:
        EVENT_VALIDATOR.validate(event)
    report = events[-1]["report"]
    assert [(s["step"], s["status"]) for s in report["steps"]] == [
        ("product", "audited"),
        ("variant", "audited"),
        ("cart", "audited"),
        ("checkout", "blocked"),
    ]
    assert report["steps"][-1]["blockedReason"] == "Sign-in required"
    logs = [e["message"] for e in events if e["type"] == "agent.log"]
    assert 'Closed a popup ("Reject all").' in logs  # never "Accept all"
    assert any("Adding 1 × Linen Shirt" in m for m in logs) and any("Choosing another option: L" in m for m in logs)
    assert report["findings"] == []  # the right item is in the cart: nothing sneaked
    assert not any("login.html" in json.dumps(e) for e in events)  # never followed "Register / Login"


@pytest.mark.internet
@pytest.mark.skipif(os.environ.get("SHOP_HONEST_INTERNET_TESTS") != "1", reason="set SHOP_HONEST_INTERNET_TESTS=1")
async def test_automationexercise_logged_out(tmp_path):
    app = create_app(make_settings(enable_live=True, nav_linger_s=2, frames_dir=tmp_path))
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test", timeout=180) as client:
        res = await client.post(
            "/api/audits", json={"targetUrl": "https://automationexercise.com/product_details/1", "mode": "live"}
        )
        events = [e for _, e in parse_sse((await client.get(f"/api/audits/{res.json()['auditId']}/events")).text)]
    await app.state.runner.shutdown()
    for event in events:
        EVENT_VALIDATOR.validate(event)
    steps = events[-1]["report"]["steps"]
    assert [s["step"] for s in steps] == ["product", "variant", "cart", "checkout"]
    assert (steps[-1]["status"], steps[-1]["blockedReason"]) == ("blocked", "Sign-in required")
