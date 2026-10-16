"""The general navigator: any allowlisted store we didn't build, logged out.

The same journey as the demo stores, with the same capture labels, so every
check and the model review apply unchanged: product (two looks) → variant →
cart → checkout → payment. Controls are found by their wording; when that
fails, the fast model picks from the page's numbered controls. Hard rules, in
code, for every click: never pay, buy now, confirm an order, sign in, register,
subscribe or accept terms; never type anything; never press another product's
button or a switched-off one. A step counts only once the page shows it (a cart,
a new checkout page). A sign-in wall, bot protection, an empty page or a refused
connection ends the walk with an honest partial report.
"""

import contextlib
import re
from typing import TYPE_CHECKING, Any
from urllib.parse import urlsplit

from playwright.async_api import Error as PlaywrightError
from playwright.async_api import Page

from app.browser.capture import Capture

if TYPE_CHECKING:
    from app.runner.walk import Walk

# Clicks the agent never makes, whatever a heuristic or a model suggests.
FORBIDDEN = re.compile(
    r"\b(pay|payment|buy now|place (your )?order|confirm|complete (order|purchase)|submit|subscribe|sign\s?-?in|sign\s?-?up|"
    r"log\s?-?in|register|create (an )?account|accept|agree|allow)\b",
    re.I,
)
ADD_TO_CART = re.compile(r"\badd (it )?to (cart|bag|basket|trolley)\b|^add$", re.I)
VIEW_CART = re.compile(r"\b(view|go to|open|see) (my )?(cart|bag|basket)\b|^(cart|bag|basket|my cart|my bag)$", re.I)
CART_HREF = re.compile(r"(view_?cart|/cart|/basket|/bag)\b", re.I)
CART_URL = re.compile(r"(view_?cart|/cart|/basket|/bag)", re.I)
CHECKOUT = re.compile(
    r"\b(proceed to checkout|checkout|check out|place order|continue to checkout|go to checkout|"
    r"continue to (address|delivery|shipping))\b|^continue$",
    re.I,
)
TO_PAYMENT = re.compile(r"\b(continue to payment|proceed to payment|payment options|go to payment)\b", re.I)
CLOSE = re.compile(
    r"^(×|✕|✖|x|close|not now|no,? thanks|maybe later|skip|dismiss|reject( all)?|decline( all)?|"
    r"only (necessary|essential)( cookies)?|continue without accepting)$",
    re.I,
)
# Radio groups that pick a picture, not a product option.
GALLERY = re.compile(r"image|thumbnail|photo|gallery|media|video|slide", re.I)
# A product, or one of its options, that can't be bought right now.
UNAVAILABLE = re.compile(r"\b(unavailable|out of stock|sold out|no longer available)\b", re.I)
# Never checkout, whatever the model thinks: another add-to-cart, or the site's help, account and offer links.
NOT_CHECKOUT = re.compile(
    ADD_TO_CART.pattern + r"|\b(help|support|contact( us)?|faqs?|track( (my )?order)?|wish ?list|offers?|my account|home)\b",
    re.I,
)
# A page that looks like checkout: its address, or what's on it (a sign-in wall, an order summary).
CHECKOUT_PAGE = re.compile(r"checkout|address|shipping|delivery|log-?in|sign-?in|auth|account|order|payment|/buy", re.I)
# A checkout that waits for a delivery pincode ("Not available in your pincode").
PINCODE = re.compile(r"\bpin\s?-?code\b", re.I)
BOT_STOP = "The site's bot protection stopped the agent; it doesn't try to get around it."
UNAVAILABLE_STOP = "Product unavailable"
ERROR_STOP = "The site showed an error instead of the page (it may be blocking automated browsers)"
EMPTY_STOP = "The site showed an empty page (it may be blocking automated browsers)"
REFUSED_STOP = "The site refused the connection (it may be blocking automated browsers)"
NOT_FOUND_STOP = "The site's address couldn't be found"
NO_CART_STOP = "Couldn't open the cart"
EMPTY_CART_STOP = "The cart was empty after adding the product"
EMPTY_CART = re.compile(r"\b(your )?(shopping )?(cart|bag|basket) is (currently )?empty\b", re.I)
# What a page shows once an add has gone through: a popup ("Added! View Cart"), the cart itself, or a link to it.
ADDED_JS = """() => {
  const shown = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el)
    return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && Number(s.opacity) > 0 }
  if (/(view_?cart|\\/cart|\\/basket|\\/bag)/i.test(location.href)) return true
  if ([...document.querySelectorAll('[role=dialog], [aria-modal=true], dialog[open], .modal')].some(shown)) return true
  return [...document.querySelectorAll('a, button')].some((el) =>
    shown(el) && /^(view|go to|open) (my )?(cart|bag|basket)$|^checkout$/i.test((el.innerText || '').trim()))
}"""
STUCK_STOP = "Checkout didn't open"
PINCODE_STOP = "Checkout needs a delivery pincode first"

CONTROLS_JS = """(max) => {
  const visible = (el) => {
    const s = getComputedStyle(el), r = el.getBoundingClientRect()
    return s.visibility !== 'hidden' && s.display !== 'none' && Number(s.opacity) > 0 && r.width > 0 && r.height > 0
  }
  // In the site's header, menus or footer, and how far down the page: the model is shown the page body first.
  const chrome = (el) => !!el.closest('header, nav, footer, [role=banner], [role=navigation], [role=contentinfo]')
  const y = (el) => Math.round(el.getBoundingClientRect().top + window.scrollY)
  // Another product's card (a "Similar products" carousel), by the same test as signals.js once it has read the page.
  const other = (el) => !!window.__shophonestOtherProduct?.(el)
  // Greyed out: "Place Order" until a delivery pincode is given.
  const disabled = (el) =>
    el.disabled === true || el.getAttribute('aria-disabled') === 'true' || getComputedStyle(el).cursor === 'not-allowed'
    || /\bdisabled\b/i.test(el.getAttribute('class') || '')
  document.querySelectorAll('[data-shophonest-ref]').forEach((el) => el.removeAttribute('data-shophonest-ref'))
  const out = []
  const CLICKABLE = 'a, button, [role=button], input[type=submit], input[type=button], [onclick]'
  for (const el of document.querySelectorAll(CLICKABLE)) {
    if (!visible(el)) continue
    const raw = el.innerText || el.value || el.getAttribute('aria-label') || el.getAttribute('title')
      || el.querySelector('img[alt]')?.alt || ''
    const text = raw.replace(/\\s+/g, ' ').trim().slice(0, 80)
    const href = el.getAttribute('href') || ''
    if (!text && !href) continue
    const ref = 'c' + (out.length + 1)
    el.setAttribute('data-shophonest-ref', ref)
    out.push({
      ref, text, href: href.slice(0, 120),
      kind: el.tagName === 'A' ? 'link' : 'button',
      inDialog: !!el.closest('[role=dialog], [aria-modal=true], dialog, .modal, [class*=cookie], [id*=cookie], [class*=consent]'),
      chrome: chrome(el),
      y: y(el),
      other: other(el),
      disabled: disabled(el),
    })
    if (out.length >= max) break
  }
  // Some sites build buttons from plain divs (React Native for Web, etc.): also take the innermost element whose
  // own text is a shopping action. A click on it bubbles up to the site's handler.
  const ACTION = new RegExp(
    '^(add (it )?to (cart|bag|basket)|view (my )?(cart|bag|basket)|go to (cart|bag|basket)|'
      + 'proceed to checkout|checkout|check out|place order|continue|close|×|✕)$', 'i')
  for (const el of document.querySelectorAll('div, span, p, li, label')) {
    if (out.length >= max) break
    if (el.closest('[data-shophonest-ref]') || !visible(el)) continue
    const text = (el.innerText || '').replace(/\\s+/g, ' ').trim()
    if (!text || text.length > 40 || !ACTION.test(text)) continue
    if ([...el.children].some((c) => (c.innerText || '').replace(/\\s+/g, ' ').trim() === text)) continue
    const ref = 'c' + (out.length + 1)
    el.setAttribute('data-shophonest-ref', ref)
    out.push({
      ref, text, href: '', kind: 'button', inDialog: !!el.closest('[role=dialog], [aria-modal=true], dialog, .modal'),
      chrome: chrome(el), y: y(el), other: other(el), disabled: disabled(el),
    })
  }
  return out
}"""


def allowed(text: str, allow: re.Pattern[str] | None = None) -> bool:
    """The click guard: forbidden wording is refused unless this step explicitly allows it (e.g. checkout on the cart)."""
    return bool(allow and allow.search(text)) or not FORBIDDEN.search(text)


class GenericJourney:
    name = "general"

    def matches(self, url: str) -> bool:
        return urlsplit(url).scheme in ("http", "https")

    async def walk(self, walk: "Walk") -> None:
        walk.third_party = True
        page = walk.page
        host = urlsplit(walk.target_url).hostname or "the site"

        # Product page: first look, then a second look after a reload.
        await walk.start_step("product", walk.target_url)
        try:
            await _open(page, walk.target_url)
        except PlaywrightError as err:
            if (refused := _refused(err, walk)) is None:
                raise
            await walk.log("navigator", refused[1])
            await walk.blocked(refused[0])
            return
        await walk.log("navigator", f"Opened the product page on {host}.")
        await self._dismiss_popups(walk)
        await walk.log(
            "navigator", f"Staying on the page for {walk.settings.nav_linger_s:g} s, like a shopper reading the details."
        )
        await page.wait_for_timeout(walk.settings.nav_linger_s * 1000)
        first = await walk.capture("product-first")
        if await _stop_page(walk, first):
            return
        walk.analyse(first)
        product = first.signals.get("heading") or "the product"
        await walk.price_on_product_page(first)

        await walk.log("navigator", "Reloading the page for a second look.")
        await page.reload(wait_until="domcontentloaded")
        await _settle(page)
        await self._dismiss_popups(walk, quiet=True)
        await walk.capture("product-reload", primary=False)

        # Another variant, if the page offers a generic one.
        if label := await _other_variant(page):
            await walk.start_step("variant")
            await walk.log("navigator", f"Choosing another option: {label}.")
            await walk.capture("variant")
        else:
            await walk.start_step("variant")
            await walk.log("navigator", "No other variants to compare on this page.")
            walk.note_step("variant", first)

        # Cart: add exactly one item, then open the cart. A product the page says is unavailable has nothing to add,
        # so the model isn't asked to guess a control.
        gone = (walk.evidence.captures.get("variant") or first).signals.get("unavailable")
        add = await self._find(walk, ADD_TO_CART, "adds this product to the cart", use_model=not gone)
        if add is None or add["disabled"]:
            await walk.start_step("cart")
            if gone:
                said = gone["text"][:60]
                await walk.log("navigator", f'The product page says "{said}", so there is nothing to add to the cart.')
                await walk.blocked(UNAVAILABLE_STOP)
                return
            if add is not None:
                await walk.log("navigator", f'"{add["text"]}" is switched off on this page, so there is nothing to add.')
                await walk.blocked("Add to cart is switched off")
                return
            await walk.log("navigator", "I couldn't find a way to add this product to the cart, so the walk stops here.")
            await walk.blocked("No add-to-cart control found")
            return
        await walk.log("navigator", f'Adding 1 × {product} to the cart ("{add["text"]}").')
        await self._click(walk, add)
        walk.evidence.added_items.append(product)
        await page.wait_for_timeout(2500)
        await _added(page)
        if not CART_URL.search(page.url):
            to_cart = await self._find(walk, VIEW_CART, "opens the shopping cart", href=CART_HREF)
            if to_cart is not None:
                await walk.log("navigator", f'Opening the cart ("{to_cart["text"] or to_cart["href"]}").')
                await self._click(walk, to_cart)
        await walk.start_step("cart")
        cart = await walk.capture("cart", primary=False, check=False)
        if await _stop_page(walk, cart):
            return
        if EMPTY_CART.search(await _page_text(page)) and not cart.signals.get("cartLines"):
            walk.evidence.captures.pop("cart", None)
            await walk.log("navigator", "The cart is empty: the product I added isn't in it, so the walk stops here.")
            await walk.blocked(EMPTY_CART_STOP, cart)
            return
        # Only a page that shows a cart counts as one: a cart address, its lines or its bill.
        if not (CART_URL.search(cart.url) or cart.signals.get("cartLines") or cart.signals.get("summary")):
            walk.evidence.captures.pop("cart", None)
            await walk.log("navigator", "Nothing showed a cart after I added the product, so the walk stops here.")
            await walk.blocked(NO_CART_STOP, cart)
            return
        walk.mark_audited(cart)
        await walk.check()
        walk.analyse(cart)
        await walk.price_from_summary(cart, "Cart")

        # Checkout, which logged-out shoppers usually can't get past: the cart's own button, never a recommendation's.
        go = await self._find(walk, CHECKOUT, "starts checkout from the cart", allow=CHECKOUT, avoid=NOT_CHECKOUT)
        if go is None:
            await walk.start_step("checkout")
            await walk.log("navigator", "I couldn't find the way to checkout from the cart.")
            await walk.blocked("No checkout control found")
            return
        if go["disabled"]:
            await walk.start_step("checkout")
            label = go["text"]
            if PINCODE.search(await _page_text(page)):
                await walk.log("navigator", f'"{label}" is switched off until a delivery pincode is given, which I never enter.')
                await walk.blocked(PINCODE_STOP, cart)
            else:
                await walk.log("navigator", f'"{label}" is switched off on this page, so I can\'t go on to checkout.')
                await walk.blocked(f'Checkout is switched off on this page ("{label}" is disabled)', cart)
            return
        await walk.log("navigator", f'Proceeding to checkout ("{go["text"]}").')
        await self._click(walk, go, allow=CHECKOUT)
        await page.wait_for_timeout(2500)
        await walk.start_step("checkout")
        checkout = await walk.capture("checkout", primary=False, check=False)
        if await _stop_page(walk, checkout):
            return
        # It counts as checkout only if pressing the button changed something: a new page, a sign-in wall, a dialog.
        path = urlsplit(checkout.url).path
        new_page = path != urlsplit(cart.url).path
        shown = checkout.signals.get("signInWall") or len(checkout.signals.get("dialogs") or []) > len(
            cart.signals.get("dialogs") or []
        )
        if not (new_page or shown):
            walk.evidence.captures.pop("checkout", None)
            await walk.log("navigator", f'Nothing changed after pressing "{go["text"]}", so the walk stops at the cart.')
            await walk.blocked(STUCK_STOP, checkout)
            return
        # A new page counts only if it looks like checkout (not the site's help page, say).
        if not (shown or checkout.signals.get("summary") or CHECKOUT_PAGE.search(path)):
            walk.evidence.captures.pop("checkout", None)
            said = f'Pressing "{go["text"]}" led to {path}, which isn\'t checkout, so the walk stops at the cart.'
            await walk.log("navigator", said)
            await walk.blocked(STUCK_STOP, checkout)
            return
        if wall := checkout.signals.get("signInWall"):
            await walk.log(
                "navigator",
                "Checkout asks me to sign in. I have no account for this site, so I stopped here rather than create one.",
            )
            await walk.blocked(wall["reason"], checkout)
            return
        walk.mark_audited(checkout)
        await walk.log("navigator", "Reached checkout without signing in. Leaving every pre-set option as it was.")
        await walk.check()
        walk.analyse(checkout)
        await walk.price_from_summary(checkout, "Checkout")

        # Payment, only if it's reachable without entering the shopper's details.
        to_pay = await self._find(walk, TO_PAYMENT, "", use_model=False)
        await walk.start_step("payment")
        if to_pay is None:
            await walk.log("navigator", "Going further needs the shopper's details (address, contact), which I never enter.")
            await walk.blocked("Needs the shopper's details to continue")
            return
        await self._click(walk, to_pay)
        await page.wait_for_timeout(2500)
        payment = await walk.capture("payment")
        walk.analyse(payment)
        await walk.price_from_summary(payment, "Payment")
        await walk.log("navigator", "Reached the payment page. Stopping here: the agent never pays.")

    async def _controls(self, page: Page) -> list[dict[str, Any]]:
        # Long pages (big marketplaces) have hundreds of menu links before the buy box.
        return await page.evaluate(CONTROLS_JS, 600)

    async def _find(
        self,
        walk: "Walk",
        pattern: re.Pattern[str],
        purpose: str,
        *,
        allow: re.Pattern[str] | None = None,
        href: re.Pattern[str] | None = None,
        use_model: bool = True,
        avoid: re.Pattern[str] | None = None,
    ) -> dict[str, Any] | None:
        """A control for this step: by its wording first, then by the fast model. Never one the click guard refuses or
        another product's; `avoid` is wording the model may not pick ("Add to cart" when looking for checkout). A
        switched-off control is returned only when nothing else fits, for the journey to stop on."""
        controls = await self._controls(walk.page)
        safe = [c for c in controls if allowed(c["text"], allow) and not c["other"]]
        matches = [c for c in safe if pattern.search(c["text"]) or (href and href.search(c["href"]) and not c["text"].strip())]
        if href:
            matches += [c for c in safe if href.search(c["href"]) and c not in matches]
        if matches:
            # Working before switched off; a control in a just-opened dialog ("View cart" after adding) beats the same
            # words elsewhere; then buttons.
            return min(matches, key=lambda c: (c["disabled"], not c["inDialog"], c["kind"] != "button", len(c["text"])))
        judge = walk.judge
        choices = [c for c in safe if not c["disabled"] and not (avoid and avoid.search(c["text"]))]
        if not use_model or judge is None or not choices:
            return None
        # The page body before the header and menus, top to bottom: the controls a shopper would look at first.
        ranked = sorted(choices, key=lambda c: (c.get("chrome", False), c.get("y", 0)))
        ref = await judge.pick(purpose, ranked[:90])
        chosen = next((c for c in choices if c["ref"] == ref), None)
        if chosen is not None:
            await walk.log(
                "navigator", f'Asked {judge.model_name} which control {purpose}: "{chosen["text"] or chosen["href"]}".'
            )
        return chosen

    async def _click(self, walk: "Walk", control: dict[str, Any], allow: re.Pattern[str] | None = None) -> None:
        if not allowed(control["text"], allow):
            raise PermissionError(f"refused to click {control['text']!r}")
        target = walk.page.locator(f'[data-shophonest-ref="{control["ref"]}"]').first
        with contextlib.suppress(Exception):
            await target.scroll_into_view_if_needed(timeout=3000)
        await target.click(timeout=walk.settings.nav_step_timeout_s * 1000)
        await _settle(walk.page)

    async def _dismiss_popups(self, walk: "Walk", quiet: bool = False) -> None:
        """Close popups and cookie banners with their close/decline controls; never "accept"."""
        for _ in range(2):
            closers = [
                c for c in await self._controls(walk.page) if c["inDialog"] and CLOSE.search(c["text"]) and allowed(c["text"])
            ]
            if not closers:
                return
            closer = closers[0]
            if not quiet:
                await walk.log("navigator", f'Closed a popup ("{closer["text"]}").')
            with contextlib.suppress(Exception):
                await self._click(walk, closer)
            await walk.page.wait_for_timeout(500)


async def _open(page: Page, url: str) -> None:
    await page.goto(url, wait_until="domcontentloaded")
    await _settle(page)


async def _settle(page: Page) -> None:
    """Let a real site finish loading, without waiting forever on trackers and long polling."""
    with contextlib.suppress(Exception):
        await page.wait_for_load_state("load", timeout=10_000)
    await page.wait_for_timeout(1500)


async def _other_variant(page: Page) -> str | None:
    """Pick another colour/size that can be bought, if the page offers a generic choice; return its label."""
    groups = page.locator("[role=radiogroup]")
    for g in range(min(await groups.count(), 6)):
        group = groups.nth(g)
        name = " ".join(filter(None, [await group.get_attribute(a) for a in ("aria-label", "id")]))
        if GALLERY.search(name):
            continue
        radios = group.locator('[role=radio][aria-checked="false"]')
        for i in range(min(await radios.count(), 8)):
            radio = radios.nth(i)
            alt = radio.locator("img[alt]").first
            try:
                shown = (await radio.inner_text(timeout=3000)).strip()
                label = (
                    (await radio.get_attribute("aria-label", timeout=3000))
                    or (await alt.get_attribute("alt", timeout=3000) if await alt.count() else None)
                    or shown
                )
            except Exception:
                continue  # gone after an earlier click re-rendered the page
            if UNAVAILABLE.search(label) or UNAVAILABLE.search(shown):
                continue
            # The element itself: the locator would match another option once this one is checked.
            option = await radio.element_handle()
            before = urlsplit(page.url).path
            with contextlib.suppress(Exception):
                await option.click(timeout=5000)
                await _settle(page)
            # Only a click that selected the option, or loaded its own page, counts as choosing it (a tracking parameter
            # added to the same page doesn't).
            with contextlib.suppress(Exception):
                if urlsplit(page.url).path != before or await option.get_attribute("aria-checked") == "true":
                    return " ".join(label.split())[:60] or "another option"
    for select in await page.locator("select").all():
        name = " ".join(filter(None, [await select.get_attribute(a) for a in ("name", "id", "aria-label")]))
        if not re.search(r"size|colou?r|variant|style|storage|capacity|pack", name, re.I):
            continue
        options = await select.locator("option").all_inner_texts()
        index = next((i for i, o in enumerate(options) if i > 0 and o.strip() and not UNAVAILABLE.search(o)), None)
        if index is not None:
            with contextlib.suppress(Exception):
                await select.select_option(index=index, timeout=5000)
                await _settle(page)
                return options[index].strip()
    return None


async def _added(page: Page) -> None:
    """Wait, a few seconds at most, for the page to show the add went through. A slow site registers the item only after
    its request returns; opening the cart before then finds it empty."""
    with contextlib.suppress(Exception):
        await page.wait_for_function(ADDED_JS, timeout=8000)
        await page.wait_for_timeout(500)


async def _page_text(page: Page) -> str:
    with contextlib.suppress(Exception):
        return await page.locator("body").inner_text(timeout=3000)
    return ""


def _refused(err: PlaywrightError, walk: "Walk") -> tuple[str, str] | None:
    """The stop reason and narration for a product page that wouldn't open at all; None for any other error."""
    code = re.search(r"net::(ERR_[A-Z0-9_]+)", str(err))
    if code is None or walk.guard.blocked:
        return None
    if code.group(1) == "ERR_NAME_NOT_RESOLVED":
        return NOT_FOUND_STOP, "The site's address couldn't be found, so there was nothing to audit."
    return REFUSED_STOP, f"The site refused the connection ({code.group(1)}). I don't get around that, so I stopped here."


async def _stop_page(walk: "Walk", capture: Capture) -> bool:
    """Stop honestly at bot protection, an error page or an empty page, rather than report on a page the shopper
    wouldn't see."""
    if capture.signals.get("emptyPage"):
        await walk.log(
            "navigator", "The page came back empty: no text, no pictures. Sites do this to automated browsers, so I stopped here."
        )
        await walk.blocked(EMPTY_STOP, capture)
        return True
    if capture.signals.get("pageError"):
        await walk.log(
            "navigator",
            f'The site showed an error ("{capture.signals["pageError"]["reason"][:60]}") instead of the page. Stopping here.',
        )
        await walk.blocked(ERROR_STOP, capture)
        return True
    if not capture.signals.get("botWall"):
        return False
    await walk.log("navigator", "The site is asking me to prove I'm human. I don't get around bot protection, so I stopped here.")
    await walk.blocked(BOT_STOP, capture)
    return True
