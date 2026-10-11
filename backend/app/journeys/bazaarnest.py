"""The BazaarNest demo stores: product → variant → cart → checkout → payment.

Ported from web/scripts/capture-screens.ts. It never pays, never signs in or
creates an account, and stops at the first sign-in wall.
"""

import re
from typing import TYPE_CHECKING
from urllib.parse import urlsplit

from playwright.async_api import Page
from playwright.async_api import TimeoutError as PlaywrightTimeout

if TYPE_CHECKING:
    from app.runner.walk import Walk

PRODUCT_PATH = re.compile(r"^/demo/[a-z0-9-]+/p/[a-z0-9-]+/?$")
# How long an unprompted popup gets to appear after load.
POPUP_GRACE_MS = 2500


class BazaarNestJourney:
    name = "bazaarnest"

    def matches(self, url: str) -> bool:
        return bool(PRODUCT_PATH.match(urlsplit(url).path))

    async def walk(self, walk: "Walk") -> None:
        page = walk.page

        # Product page: first look, then a second look after a reload.
        await walk.start_step("product", walk.target_url)
        await page.goto(walk.target_url, wait_until="load")
        if await _popup(page):
            await walk.log("navigator", "Opened the product page. A popup appeared without any action from me.")
            walk.analyse(await walk.capture("product-popup", primary=False))
            await _decline_popup(walk)
        else:
            await walk.log("navigator", "Opened the product page.")
        await walk.log(
            "navigator", f"Staying on the page for {walk.settings.nav_linger_s:g} s, like a shopper reading the details."
        )
        await page.wait_for_timeout(walk.settings.nav_linger_s * 1000)
        first = await walk.capture("product-first")
        walk.analyse(first)
        product_name = first.signals.get("heading") or "the product"
        await walk.price_on_product_page(first)

        await walk.log("navigator", "Reloading the page for a second look.")
        await page.reload(wait_until="load")
        if await _popup(page):
            await _decline_popup(walk, again=True)
        await walk.capture("product-reload", primary=False)

        # Another variant.
        option = page.locator('[role=radiogroup] [role=radio][aria-checked="false"]').first
        if await option.count():
            label = (await option.get_attribute("aria-label")) or (await option.inner_text()).strip() or "another option"
            await option.click()
            await page.locator('[role=radiogroup] [role=radio][aria-checked="true"]').first.wait_for()
            await walk.start_step("variant")
            await walk.log("navigator", f"Choosing colour: {label}.")
            await walk.capture("variant")

        # Cart: add exactly one item.
        await page.locator("#add-to-cart").click()
        await page.wait_for_url(re.compile(r"/cart/?$"))
        walk.evidence.added_items.append(product_name)
        await walk.start_step("cart")
        await walk.log("navigator", f"Added 1 × {product_name} to the cart. Opening the cart.")
        cart = await walk.capture("cart")
        walk.analyse(cart)
        await walk.price_from_summary(cart, "Cart")

        # Checkout, or a sign-in wall.
        await page.locator("#to-checkout").click()
        await page.wait_for_url(re.compile(r"/checkout/?$"))
        await page.locator("#delivery-choice, input[type=password]").first.wait_for()
        await walk.start_step("checkout")
        checkout = await walk.capture("checkout", primary=False, check=False)
        if wall := checkout.signals.get("signInWall"):
            await walk.log(
                "navigator",
                "Checkout asks me to sign in. I have no account for this site, so I stopped here rather than create one.",
            )
            await walk.blocked(wall["reason"], checkout)
            return
        walk.mark_audited(checkout)
        await walk.log(
            "navigator", "Reached checkout. Leaving every pre-set option as it was, to see what a hurried shopper would pay."
        )
        await walk.check()
        walk.analyse(checkout)
        await walk.price_from_summary(checkout, "Checkout")

        # Payment: the cheapest delivery, then stop before paying.
        standard = page.locator("#standard-delivery-link")
        if await standard.count():
            await walk.log(
                "navigator", "Express delivery is the big button; standard is a small link below it. Choosing standard."
            )
            await standard.click()
        else:
            await page.locator("#continue-to-payment").click()
        await page.wait_for_url(re.compile(r"/payment/?$"))
        await page.locator("#order-summary").wait_for()
        await walk.start_step("payment")
        payment = await walk.capture("payment")
        walk.analyse(payment)
        await walk.price_from_summary(payment, "Payment")
        await walk.log("navigator", "Reached the payment page. Stopping here: the agent never pays.")


async def _popup(page: Page) -> bool:
    try:
        await page.locator("[role=dialog], [aria-modal=true]").first.wait_for(timeout=POPUP_GRACE_MS)
        return True
    except PlaywrightTimeout:
        return False


async def _decline_popup(walk: "Walk", again: bool = False) -> None:
    dialog = walk.page.locator("[role=dialog], [aria-modal=true]").first
    buttons = dialog.locator("button, a, [role=button]")
    # The decline is the control that doesn't accept the offer; on BazaarNest it's the last one.
    decline = buttons.filter(has_text=re.compile(r"no thanks|not now|maybe later|close|skip|decline|×", re.I)).first
    if not await decline.count():
        decline = buttons.last
    text = (await decline.inner_text()).strip()
    await decline.click()
    await dialog.wait_for(state="detached")
    if not again:
        await walk.log("navigator", f'Declined the popup ("{text}").')
