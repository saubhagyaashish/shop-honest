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
from app.browser.capture import SIGNALS_JS
from app.config import REPO_DIR
from app.journeys.generic import CHECKOUT, allowed
from app.knowledge import load_knowledge
from app.main import create_app
from app.models import ModelSet
from app.models.scripted import ScriptedLlm
from scripts.live import serve_dist
from tests.conftest import EVENT_VALIDATOR, fake_resolver, make_settings, parse_sse

SITES = Path(__file__).parent / "sites"
SIGNALS = SIGNALS_JS


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


# Checks validated only on stores we built


async def test_on_a_site_we_did_not_build_frozen_stock_goes_to_human_review(tmp_path):
    from app.agents.checks import frozen_stock
    from app.runner.walk import Walk
    from app.stores.frames import LocalFrameStore
    from tests.conftest import load_walk

    knowledge = load_knowledge(REPO_DIR / "shared")
    (finding,) = frozen_stock(load_walk("store-a")[0], knowledge)
    events: list[dict] = []

    async def emit(event: dict) -> None:
        events.append(event)

    walk = Walk(
        audit_id="aud_t",
        target_url="https://shop.example/p/1",
        page=None,
        guard=None,  # type: ignore[arg-type]
        frames=LocalFrameStore(tmp_path),
        knowledge=knowledge,
        settings=make_settings(),
        emit=emit,
    )
    walk.third_party = True
    await walk.add_finding(finding)
    assert walk.findings[0]["status"] == "needs_review"
    assert any("validated only on stores we built" in e.get("message", "") for e in events)


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


async def signals_at(path: str) -> dict:
    """Signals of a fixture page served at its own address (for rules that read the URL)."""
    from playwright.async_api import async_playwright

    with serve_dist(SITES) as base:
        async with async_playwright() as pw:
            browser = await pw.chromium.launch()
            page = await browser.new_page(viewport={"width": 1280, "height": 800})
            await page.goto(f"{base}/{path}")
            signals = await page.evaluate(SIGNALS)
            await browser.close()
    return signals


@pytest.mark.browser
async def test_only_the_main_product_is_read_on_a_busy_marketplace_page():
    # A screen-reader-only h1 comes first, and a row of other products below has its own prices and "Only 1 left".
    s = await signals_of((SITES / "market" / "product.html").read_text())
    assert s["heading"] == "Acme Buds T310 Wireless Earbuds"
    assert (s["priceBlock"]["price"], s["priceBlock"]["mrp"]) == (1899, 3999)
    assert s["mainPrice"]["price"] == 1899
    assert s["stock"] == []
    assert s["unavailable"] is None


@pytest.mark.browser
async def test_an_unavailable_product_is_recognised():
    s = await signals_of((SITES / "market" / "unavailable.html").read_text())
    assert s["unavailable"]["text"].startswith("Currently unavailable")


@pytest.mark.browser
async def test_sign_in_pages_that_ask_for_an_email_first():
    assert (await signals_at("market/ap/signin.html"))["signInWall"]["reason"] == "Sign-in required"
    # Nothing in the wording gives it away: the address and the email box do.
    assert (await signals_at("market/ap/signin-plain.html"))["signInWall"]["reason"] == "Sign-in required"
    assert (await signals_at("market/product.html"))["signInWall"] is None


@pytest.mark.browser
async def test_bot_walls_and_error_pages_are_recognised():
    assert (await signals_of("<h1>Please verify you are human</h1>"))["botWall"]
    walmart = "<h1>Robot or human?</h1><p>Activate and hold the button to confirm that you’re human. Thank You!</p>"
    assert (await signals_of(walmart))["botWall"]
    assert (await signals_at("market/blocked.html"))["botWall"]["reason"] == "Blocked page"
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


async def walk_of(path: str, tmp_path: Path) -> list[dict]:
    with serve_dist(SITES) as base:
        app = create_app(make_settings(enable_live=True, nav_linger_s=1, frames_dir=tmp_path), resolver=fake_resolver)
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test", timeout=120) as client:
            res = await client.post("/api/audits", json={"targetUrl": f"{base}/{path}", "mode": "live"})
            assert res.status_code == 202, res.text
            events = [e for _, e in parse_sse((await client.get(f"/api/audits/{res.json()['auditId']}/events")).text)]
        await app.state.runner.shutdown()
    for event in events:
        EVENT_VALIDATOR.validate(event)
    return events


@pytest.mark.browser
async def test_a_logged_out_walk_of_a_busy_marketplace(tmp_path):
    events = await walk_of("market/product.html", tmp_path)
    report = events[-1]["report"]
    assert [(s["step"], s["status"]) for s in report["steps"]] == [
        ("product", "audited"),
        ("variant", "audited"),
        ("cart", "audited"),
        ("checkout", "blocked"),
    ]
    assert report["steps"][-1]["blockedReason"] == "Sign-in required"
    logs = [e["message"] for e in events if e["type"] == "agent.log"]
    # Add to cart sits after 200 menu links; the variant picked is one that can be bought.
    assert any("Adding 1 × Acme Buds T310 Wireless Earbuds" in m for m in logs)
    assert any("Choosing another option: Pearl White" in m for m in logs)
    # No other product's price or stock, and a "Limited time" badge in the cart is not a sneaked item.
    assert report["findings"] == []
    prices = [(e["label"], e["total"]["amount"]) for e in events if e["type"] == "price.observed"]
    assert prices[0] == ("Product page", 1899)


@pytest.mark.browser
async def test_an_unavailable_product_stops_the_walk_honestly(tmp_path):
    events = await walk_of("market/unavailable.html", tmp_path)
    report = events[-1]["report"]
    last = report["steps"][-1]
    assert (last["step"], last["status"], last["blockedReason"]) == ("cart", "blocked", "Product unavailable")
    logs = [e["message"] for e in events if e["type"] == "agent.log"]
    assert any(m.startswith('The product page says "Currently unavailable') for m in logs)


@pytest.mark.browser
async def test_a_page_without_an_h1_still_knows_its_product_and_that_it_is_out_of_stock():
    s = await signals_of((SITES / "market" / "no-title.html").read_text())
    assert s["heading"] == "Zoom K35 TWS Earbuds (Space Black)"
    assert s["unavailable"]["text"] == "Out of stock"


def steps_of(events: list[dict]) -> list[tuple[str, str, str | None]]:
    return [(s["step"], s["status"], s.get("blockedReason")) for s in events[-1]["report"]["steps"]]


def logs_of(events: list[dict]) -> list[str]:
    return [e["message"] for e in events if e["type"] == "agent.log"]


@pytest.mark.browser
async def test_an_empty_page_is_not_checked_let_alone_called_clean(tmp_path):
    events = await walk_of("empty.html", tmp_path)
    assert steps_of(events) == [("product", "blocked", "The site showed an empty page (it may be blocking automated browsers)")]
    assert events[-1]["report"]["findings"] == []


@pytest.mark.browser
async def test_an_out_of_stock_product_never_adds_a_similar_one(tmp_path):
    events = await walk_of("market/no-title.html", tmp_path)
    assert steps_of(events)[-1] == ("cart", "blocked", "Product unavailable")
    assert not any(m.startswith("Adding 1 ×") for m in logs_of(events))


@pytest.mark.browser
async def test_a_cart_waiting_for_a_pincode_and_a_fee_the_product_page_never_mentioned(tmp_path):
    events = await walk_of("pincode/product.html", tmp_path)
    assert steps_of(events) == [
        ("product", "audited", None),
        ("variant", "audited", None),
        ("cart", "audited", None),
        ("checkout", "blocked", "Checkout needs a delivery pincode first"),
    ]
    assert not any("Reached checkout" in m for m in logs_of(events))
    [fee] = events[-1]["report"]["findings"]
    assert (fee["id"], fee["step"], fee["status"]) == ("f-late-fees", "cart", "needs_review")
    assert fee["title"] == "₹10 in fees first shown in the cart, not on the product page"


@pytest.mark.browser
async def test_checkout_uses_the_carts_own_continue_not_a_recommendations_add_to_cart(tmp_path):
    events = await walk_of("continue/product.html", tmp_path)
    assert steps_of(events)[2:] == [
        ("cart", "audited", None),
        ("checkout", "audited", None),
        ("payment", "blocked", "Needs the shopper's details to continue"),
    ]
    assert 'Proceeding to checkout ("Continue").' in logs_of(events)
    # 1mg's bill: "Item total" is a line, "To be paid" the total, and the handling charge wasn't on the product page.
    cart = next(e for e in events if e["type"] == "price.observed" and e["label"] == "Cart")
    assert cart["total"]["amount"] == 53
    [fee] = events[-1]["report"]["findings"]
    assert (fee["id"], fee["step"], fee["status"]) == ("f-late-fees", "cart", "needs_review")
    assert "Handling charges (₹12)" in fee["explanation"]


@pytest.mark.browser
async def test_a_checkout_button_that_leads_elsewhere_is_not_checkout(tmp_path):
    events = await walk_of("detour/product.html", tmp_path)
    assert steps_of(events)[-1] == ("checkout", "blocked", "Checkout didn't open")
    assert not any("Reached checkout" in m for m in logs_of(events))


@pytest.mark.browser
async def test_a_slow_add_to_cart_is_waited_for_before_the_cart_is_opened(tmp_path):
    events = await walk_of("slow/product.html", tmp_path)
    assert steps_of(events)[2:] == [("cart", "audited", None), ("checkout", "blocked", "Sign-in required")]
    assert 'Opening the cart ("View Cart").' in logs_of(events)


@pytest.mark.browser
async def test_a_cart_that_never_opens_is_not_reported_as_one(tmp_path):
    events = await walk_of("stuck/product.html", tmp_path)
    assert steps_of(events)[-1] == ("cart", "blocked", "Couldn't open the cart")
    assert "Nothing showed a cart after I added the product, so the walk stops here." in logs_of(events)


@pytest.mark.browser
async def test_a_site_that_refuses_the_connection_is_reported_as_such(tmp_path):
    app = create_app(make_settings(enable_live=True, nav_linger_s=1, frames_dir=tmp_path), resolver=fake_resolver)
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test", timeout=120) as client:
        res = await client.post("/api/audits", json={"targetUrl": "http://127.0.0.1:9/p/item", "mode": "live"})
        assert res.status_code == 202, res.text
        events = [e for _, e in parse_sse((await client.get(f"/api/audits/{res.json()['auditId']}/events")).text)]
    await app.state.runner.shutdown()
    assert events[-1]["type"] == "audit.completed"  # not "Something went wrong"
    assert steps_of(events) == [("product", "blocked", "The site refused the connection (it may be blocking automated browsers)")]


# Real stores' popups, size pickers and cart drawers, built from plain divs rather than dialogs and radio groups


@pytest.mark.browser
async def test_popups_without_a_dialog_role_are_closed_even_when_one_covers_add_to_cart(tmp_path):
    events = await walk_of("popup/product.html", tmp_path)
    assert steps_of(events) == [
        ("product", "audited", None),
        ("variant", "audited", None),
        ("cart", "audited", None),
        ("checkout", "blocked", "Sign-in required"),
    ]
    logs = logs_of(events)
    assert 'Closed a popup ("×").' in logs  # its close control is an icon with no words
    assert 'A popup ("Wait! Take 10% off your first order") covered "Add to cart"; closed it with Escape.' in logs
    assert not any("login.html" in json.dumps(e) for e in events)  # never pressed "Sign up"


@pytest.mark.browser
async def test_a_popup_that_will_not_close_stops_the_walk_on_the_way_to_the_cart(tmp_path):
    events = await walk_of("popup/locked.html", tmp_path)
    assert steps_of(events) == [
        ("product", "audited", None),
        ("variant", "audited", None),  # chosen before the popup appeared: still audited
        ("cart", "blocked", 'A popup covered "Add to cart"'),
    ]
    stopped = 'A popup ("Download our app for 10% off") covers "Add to cart" and I couldn\'t close it, so the walk stops here.'
    assert stopped in logs_of(events)


@pytest.mark.browser
async def test_sizes_built_from_labels_are_chosen_before_adding(tmp_path):
    events = await walk_of("sizes/product.html", tmp_path)
    assert steps_of(events) == [
        ("product", "audited", None),
        ("variant", "audited", None),
        ("cart", "audited", None),
        ("checkout", "blocked", "Sign-in required"),
    ]
    logs = logs_of(events)
    assert "Choosing another option: S." in logs  # the first size that can be bought (XL is sold out)
    assert 'Adding 1 × Men\'s Venom Oversized T-shirt to the cart ("ADD TO BAG").' in logs  # its name, not its "₹799"
    assert 'Opening the cart ("GO TO BAG").' in logs
    assert 'Proceeding to checkout ("PROCEED").' in logs  # the cart's lone "Proceed" is its checkout


@pytest.mark.browser
async def test_a_cart_drawer_is_the_cart_and_a_framed_checkout_login_is_a_sign_in_wall(tmp_path):
    events = await walk_of("drawer/product.html", tmp_path)
    assert steps_of(events) == [
        ("product", "audited", None),
        ("variant", "audited", None),
        ("cart", "audited", None),
        ("checkout", "blocked", "Sign-in required"),
    ]
    logs = logs_of(events)
    assert 'The cart opened in a panel on the page ("MY CART (1)").' in logs
    assert 'Proceeding to checkout ("PROCEED TO BUY").' in logs
    assert not any(m.startswith("Opening the cart") for m in logs)  # not the header's bubble, which the drawer covers


@pytest.mark.browser
async def test_a_sticky_buy_bar_among_product_cards_is_the_pages_own(tmp_path):
    events = await walk_of("builder/product.html", tmp_path)
    assert steps_of(events)[2:] == [("cart", "audited", None), ("checkout", "blocked", "Sign-in required")]
    assert 'Adding 1 × Build Your Wall | Custom Poster Wall Collage to the cart ("Add to cart").' in logs_of(events)


@pytest.mark.browser
async def test_a_cart_line_is_the_items_own_box_with_its_own_price():
    # A fashion store's bag: a banner's close button isn't a line; the T-shirt costs ₹999, not its ₹100 member saving; the
    # membership's REMOVE sits five boxes deep inside its line; the recommendations aren't lines.
    s = await signals_of((SITES / "member" / "cart.html").read_text())
    lines = [(line["name"], line["amount"]) for line in s["cartLines"]]
    assert lines == [("Galaxy Print Oversized T-shirt", 999), ("Fixture Club Membership", 199)]
    [popup] = s["dialogs"]  # a plain fixed div with no dialog role
    assert "NO, I'D RATHER PAY MORE" in [b["text"] for b in popup["buttons"]]
    assert "NO, I'D RATHER PAY MORE" not in [c["text"] for c in s["controls"]]  # listed once, as the popup's
    # 1mg's line is its own row, not the column it shares with "Top deals" (the last price there is ₹652).
    s = await signals_of((SITES / "continue" / "cart.html").read_text())
    assert [(line["name"], line["amount"]) for line in s["cartLines"]] == [("Celin 500 Vitamin C Tablet", 41)]


@pytest.mark.browser
async def test_a_membership_put_in_the_cart_is_found_and_sent_to_review(tmp_path):
    events = await walk_of("member/product.html", tmp_path)
    assert steps_of(events)[2:] == [("cart", "audited", None), ("checkout", "blocked", "Sign-in required")]
    report = events[-1]["report"]
    [sneaked] = report["findings"]
    # A site we didn't build: a person confirms what the cart's layout suggests.
    assert (sneaked["id"], sneaked["status"]) == ("f-sneaked-item", "needs_review")
    assert sneaked["title"] == "Fixture Club Membership added to the cart without consent"
    assert "Extra line: Fixture Club Membership, ₹199" in sneaked["evidence"]["observations"]
    [line] = [x for x in report["exposure"]["priceDrift"]["lines"] if x["kind"] == "sneaked_item"]
    assert (line["label"], line["amount"]["amount"], line["findingId"]) == ("Fixture Club Membership", 199, "f-sneaked-item")


async def test_a_walk_that_cannot_move_on_blocks_the_step_it_was_heading_for(tmp_path):
    from types import SimpleNamespace

    from app.runner.walk import Walk
    from app.stores.frames import LocalFrameStore

    events: list[dict] = []

    async def emit(event: dict) -> None:
        events.append(event)

    url = "https://shop.example/p/1"
    walk = Walk(
        audit_id="aud_t",
        target_url=url,
        page=SimpleNamespace(url=url),  # type: ignore[arg-type]
        guard=None,  # type: ignore[arg-type]
        frames=LocalFrameStore(tmp_path),
        knowledge=load_knowledge(REPO_DIR / "shared"),
        settings=make_settings(),
        emit=emit,
    )
    audited = [{"step": s, "url": url, "status": "audited"} for s in ("product", "variant")]

    # The variant was audited; pressing "Add to cart" failed: the cart is the step that couldn't be reached.
    walk.steps, walk.step = list(audited), "variant"
    await walk.stuck('A popup covered "Add to cart"')
    assert [(s["step"], s["status"]) for s in walk.steps] == [("product", "audited"), ("variant", "audited"), ("cart", "blocked")]
    assert [(e["type"], e["step"]) for e in events] == [("step.started", "cart"), ("step.blocked", "cart")]

    # A step not yet audited is the one blocked.
    events.clear()
    walk.steps, walk.step = audited[:1], "variant"
    await walk.stuck("The page stopped responding")
    assert [(s["step"], s["status"]) for s in walk.steps] == [("product", "audited"), ("variant", "blocked")]
    assert [e["type"] for e in events] == ["step.blocked"]


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
