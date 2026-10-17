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

Real stores rarely mark things up the way ours do, so the navigator goes by what
things do rather than how they're tagged: a popup, bottom sheet or cart drawer
is any layer fixed over the page; one that covers the next control is closed
(Escape, its own close control, or its backdrop) before pressing, and one that
won't close ends the walk with that reason. Sizes and colours are recognised as
a row of short choices under a heading such as "Select Size", and a cart that
opens as a panel over the page counts as the cart.
"""

import contextlib
import re
from typing import TYPE_CHECKING, Any
from urllib.parse import urlsplit

from playwright.async_api import Error as PlaywrightError
from playwright.async_api import Page
from playwright.async_api import TimeoutError as PlaywrightTimeout

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
# "Proceed to buy" is checkout on Amazon and many Shopify stores, and a cart's lone "Proceed" (Bewakoof) is too: they lead
# to sign-in or an address, never to payment.
CHECKOUT = re.compile(
    r"\b(proceed to checkout|proceed to buy|checkout|check out|place order|continue to checkout|go to checkout|"
    r"continue to (address|delivery|shipping))\b|^(continue|proceed)$",
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
SIGN_IN_STOP = "Sign-in required"
# A one-click checkout (GoKwik, Shiprocket…) opens its sign-in in a frame over the page, out of the page's own reading.
FRAME_SIGN_IN = re.compile(
    r"\b(log\s?-?in|sign\s?-?in) to continue\b|\benter (your )?mobile( number)?\b|\b(get|send|request) otp\b", re.I
)
STUCK_STOP = "Checkout didn't open"
PINCODE_STOP = "Checkout needs a delivery pincode first"

# A layer over the page, however a site marks it up (a popup, a bottom sheet, a cart drawer): the outermost fixed box of
# a good size that is on screen and on top. A fixed header is too short to count; a fixed shell around the whole page
# (one holding its main content or title) is the page itself; a fixed box nothing of which is on top (a hidden drawer's
# see-through frame, a background) isn't over anything. Spliced into the scripts below at /*OVERLAY*/.
OVERLAY_JS = """
  const onTop = (n) => [n, ...n.children].map((c) => c.getBoundingClientRect()).filter((r) => r.width >= 150 && r.height >= 100)
    .some((r) => {
      const x = Math.min(Math.max(r.left + r.width / 2, 0), innerWidth - 1)
      const y = Math.min(Math.max(r.top + r.height / 2, 0), innerHeight - 1)
      const hit = document.elementFromPoint(x, y)
      return !!hit && n.contains(hit)
    })
  const isLayer = (n) => {
    const s = getComputedStyle(n)
    if (s.position !== 'fixed' || s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity) === 0) return false
    const r = n.getBoundingClientRect()
    return r.width >= 300 && r.height >= 200 && r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth
      && !n.querySelector('main, [role=main], header, h1') && onTop(n)
  }
  const overlayOf = (el) => {
    let found = null
    for (let n = el; n && n !== document.body; n = n.parentElement) if (isLayer(n)) found = n
    return found
  }
  const layers = () => [...document.body.querySelectorAll('*')].filter(isLayer)
  // What an element says about itself beyond its words: a close icon's class, id, aria-label or title.
  const said = (n) => ['class', 'id', 'aria-label', 'title'].map((a) => n.getAttribute(a) || '').join(' ')
"""

# What a page shows once an add has gone through: a popup ("Added! View Cart"), the cart itself (a page, or a panel
# over this one), or a link to it.
ADDED_JS = """() => {
  /*OVERLAY*/
  const shown = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el)
    return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && Number(s.opacity) > 0 }
  if (/(view_?cart|\\/cart|\\/basket|\\/bag)/i.test(location.href)) return true
  if ([...document.querySelectorAll('[role=dialog], [aria-modal=true], dialog[open], .modal')].some(shown)) return true
  if (layers().some((l) => /\\b(cart|bag|basket)\\b/i.test((l.innerText || '').slice(0, 80)))) return true
  return [...document.querySelectorAll('a, button')].some((el) =>
    shown(el) && /^(view|go to|open) (my )?(cart|bag|basket)$|^checkout$/i.test((el.innerText || '').trim()))
}""".replace("/*OVERLAY*/", OVERLAY_JS)

CONTROLS_JS = """(max) => {
  /*OVERLAY*/
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
    || /\\bdisabled\\b/i.test(el.getAttribute('class') || '')
  // In a popup, banner or panel over the page: marked up as one, or simply a layer fixed over it.
  const open = layers()
  const inLayer = (el) => open.some((l) => l.contains(el))
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
      inDialog: !!el.closest('[role=dialog], [aria-modal=true], dialog, .modal, [class*=cookie], [id*=cookie], [class*=consent]')
        || inLayer(el),
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
      + 'proceed to checkout|proceed to buy|checkout|check out|place order|continue|proceed|close|×|✕)$', 'i')
  for (const el of document.querySelectorAll('div, span, p, li, label')) {
    if (out.length >= max) break
    if (el.closest('[data-shophonest-ref]') || !visible(el)) continue
    const text = (el.innerText || '').replace(/\\s+/g, ' ').trim()
    if (!text || text.length > 40 || !ACTION.test(text)) continue
    if ([...el.children].some((c) => (c.innerText || '').replace(/\\s+/g, ' ').trim() === text)) continue
    const ref = 'c' + (out.length + 1)
    el.setAttribute('data-shophonest-ref', ref)
    out.push({
      ref, text, href: '', kind: 'button',
      inDialog: !!el.closest('[role=dialog], [aria-modal=true], dialog, .modal') || inLayer(el),
      chrome: chrome(el), y: y(el), other: other(el), disabled: disabled(el),
    })
  }
  // A popup's close control is often an icon alone: no words, only a class or label that says so (Kingclothing's
  // "et-close-popup"). Listed as "×", so it's closed like any other.
  for (const layer of open) {
    for (const el of layer.querySelectorAll('*')) {
      if (out.length >= max) break
      if (el.closest('[data-shophonest-ref]') || !visible(el) || (el.innerText || '').trim()) continue
      const r = el.getBoundingClientRect()
      if (r.width > 64 || r.height > 64 || !/close|dismiss/i.test(said(el))) continue
      const ref = 'c' + (out.length + 1)
      el.setAttribute('data-shophonest-ref', ref)
      out.push({
        ref, text: '×', href: '', kind: 'button', inDialog: true, chrome: chrome(el), y: y(el), other: false, disabled: false,
      })
    }
  }
  return out
}""".replace("/*OVERLAY*/", OVERLAY_JS)

# What's on top of a control at its centre, when that's a layer over the page or a popup: the layer's first line, its
# close control (marked for _uncover) and whether the point is bare backdrop (no words of its own, not a control), which
# most layers close on. None when the way is clear. With `any`, whatever is on top counts.
COVER_JS = """([ref, any]) => {
  /*OVERLAY*/
  document.querySelectorAll('[data-shophonest-closer]').forEach((el) => el.removeAttribute('data-shophonest-closer'))
  const el = document.querySelector(`[data-shophonest-ref="${ref}"]`)
  if (!el) return null
  const r = el.getBoundingClientRect()
  const x = r.left + r.width / 2, y = r.top + r.height / 2
  if (x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) return null
  const hit = document.elementFromPoint(x, y)
  if (!hit || el.contains(hit)) return null
  const layer = overlayOf(hit) || hit.closest('[role=dialog], [aria-modal=true], dialog, .modal') || (any ? hit : null)
  if (!layer || layer.contains(el)) return null
  const words = (n) => (n.innerText || '').replace(/\\s+/g, ' ').trim()
  const CLOSER = /^(×|✕|✖|x|close|not now|no,? thanks|maybe later|skip|dismiss)$/i
  const closer = [...layer.querySelectorAll('*')].find((c) => {
    const cr = c.getBoundingClientRect()
    if (!(cr.width > 0 && cr.height > 0)) return false
    const t = words(c)
    if (t) return CLOSER.test(t) && ![...c.children].some((k) => words(k) === t)
    return cr.width <= 64 && cr.height <= 64 && /close|dismiss/i.test(said(c))
  })
  if (closer) closer.setAttribute('data-shophonest-closer', '1')
  const own = [...hit.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())
  const control = hit.closest('a, button, [role=button], input, select, textarea, label, [onclick]')
  const backdrop = hit === layer || /backdrop|overlay|mask|scrim|shade|close/i.test(hit.getAttribute('class') || '')
  const bare = !own && !control && backdrop
  const line = (layer.innerText || '').split('\\n').map((s) => s.trim()).find(Boolean) || ''
  return { text: line.slice(0, 60), closer: closer ? words(closer) || '×' : null, bare, x, y }
}""".replace("/*OVERLAY*/", OVERLAY_JS)

# Size and colour choices however a site builds them (Bewakoof's labels, The Souled Store's list items, Veirdo's radio
# labels): a row of two or more short, small choices under a heading such as "Select Size". Each is marked for pressing
# ("o1", "o2"…), with whether it's chosen already and whether it can be bought. Sizes must read like sizes, so a row of
# words that happens to sit under a size heading isn't mistaken for one. The first such row, or null.
OPTIONS_JS = """() => {
  const words = (n) => (n.innerText || '').replace(/\\s+/g, ' ').trim()
  const visible = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el)
    return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && Number(s.opacity) > 0 }
  const chrome = (el) => !!el.closest('header, nav, footer, [role=banner], [role=navigation], [role=contentinfo]')
  const other = (el) => !!window.__shophonestOtherProduct?.(el)
  const GROUP = /\\b(size|colou?r|variant|style|storage|capacity|pack|weight|flavou?r)\\b/i
  const SIZE = new RegExp('^(xxs|xs|s|m|l|xl|xxl|xxxl|[2-6]xl|free ?size|one ?size|'
    + '\\\\d{1,3}(\\\\.\\\\d)?\\\\s?(uk|us|eu|in|cm|mm|ml|l|g|kg|gb|tb)?)$', 'i')
  const NOT_OPTION = /guide|chart|help|share|review|notify|wish ?list|compare/i
  const STATE = /^(active|selected|checked|current)|[-_](active|selected|checked|current)(?![a-z])/i
  const GONE = /disabled|unavailable|out-?of-?stock|sold-?out|^oos$/i
  const tokens = (n) => (n.getAttribute('class') || '').split(/\\s+/).filter(Boolean)
  // Each choice: the outermost element around a short text that holds nothing else (a label around a radio and a span).
  // (textContent first: it's cheap, while innerText lays the page out.)
  const short = (n) => (n.textContent || '').length <= 60
  const items = new Map()
  for (const leaf of document.body.querySelectorAll('*')) {
    if (!short(leaf)) continue
    const t = words(leaf)
    if (!t || t.length > 12 || [...leaf.children].some((c) => words(c)) || !visible(leaf)) continue
    if (leaf.closest('select, a[href]:not([href^="#"]):not([href^="javascript"])')) continue
    let item = leaf
    for (let d = 0; d < 4; d++) {
      const up = item.parentElement
      if (!up || up === document.body || !short(up) || words(up) !== t) break
      item = up
    }
    items.set(item, t)
  }
  const rows = new Map()
  for (const [item, t] of items) {
    const row = item.parentElement
    if (!row || NOT_OPTION.test(t) || chrome(item) || other(item)) continue
    const r = item.getBoundingClientRect()
    if (r.width > 240 || r.height > 80) continue
    if (!rows.has(row)) rows.set(row, [])
    rows.get(row).push([item, t])
  }
  // The words just above a row: its legend, its label, or the line before it ("Select Size", "Please select a size.").
  const heading = (row) => {
    const legend = row.closest('fieldset')?.querySelector('legend')
    if (legend && GROUP.test(words(legend))) return words(legend)
    if (GROUP.test(row.getAttribute('aria-label') || '')) return row.getAttribute('aria-label')
    for (let n = row, d = 0; n && n !== document.body && d < 3; n = n.parentElement, d++) {
      for (let s = n.previousElementSibling, k = 0; s && k < 2; s = s.previousElementSibling, k++) {
        const line = (s.innerText || '').split('\\n').map((x) => x.trim()).find(Boolean) || ''
        if (line.length <= 40 && GROUP.test(line)) return line
      }
    }
    return null
  }
  const ARIA = ['aria-checked', 'aria-pressed', 'aria-selected']
  const chosen = (item) => [item, ...item.querySelectorAll('*')].some((n) =>
    (n.matches('input') && n.checked) || ARIA.some((a) => n.getAttribute(a) === 'true') || tokens(n).some((k) => STATE.test(k)))
  const gone = (item) => Number(getComputedStyle(item).opacity) < 0.5 || [item, ...item.querySelectorAll('*')].some((n) =>
    getComputedStyle(n).textDecorationLine.includes('line-through') || n.disabled === true
    || n.getAttribute('aria-disabled') === 'true' || tokens(n).some((k) => GONE.test(k)))
  for (const [row, list] of rows) {
    if (list.length < 2) continue
    const name = heading(row)
    if (!name) continue
    if (/size/i.test(name) && list.filter(([, t]) => SIZE.test(t)).length < 2) continue
    document.querySelectorAll('[data-shophonest-ref]').forEach((el) => el.removeAttribute('data-shophonest-ref'))
    const options = list.map(([item, t], i) => {
      const ref = 'o' + (i + 1)
      item.setAttribute('data-shophonest-ref', ref)
      return { ref, text: t, chosen: chosen(item), gone: gone(item) }
    })
    return { name, options }
  }
  return null
}"""

# An option's state, to tell whether pressing it chose it: its own, its parents' and its contents' classes and states.
# A re-rendered page that dropped the element reads as changed.
OPTION_STATE_JS = """(ref) => {
  const el = document.querySelector(`[data-shophonest-ref="${ref}"]`)
  if (!el) return null
  const nodes = [el.parentElement?.parentElement, el.parentElement, el, ...el.querySelectorAll('*')].filter(Boolean)
  return nodes.map((n) => [n.getAttribute('class'), n.getAttribute('aria-checked'), n.getAttribute('aria-pressed'),
    n.getAttribute('aria-selected'), n.matches('input') ? n.checked : ''].join('|')).join('/')
}"""

# A cart that opens as a panel over the page after an add (Veirdo's "MY CART (1)" drawer): a layer that names a cart,
# bag or basket near its top, shows a price and holds the product just added. Its first line, or null.
CART_PANEL_JS = """(name) => {
  /*OVERLAY*/
  const want = ((name || '').toLowerCase().match(/[a-z0-9]+/g) || []).filter((w) => w.length >= 3).slice(0, 4)
  for (const layer of layers()) {
    const t = (layer.innerText || '').replace(/\\s+/g, ' ').trim()
    if (!/\\b(cart|bag|basket)\\b/i.test(t.slice(0, 60)) || !/(₹|\\bRs\\.?|\\bINR)\\s?[\\d,]+/i.test(t)) continue
    const lower = t.toLowerCase()
    if (want.length && want.filter((w) => lower.includes(w)).length < Math.min(2, want.length)) continue
    // Its first line in words ("MY CART (1)"), not a count badge's "1".
    return ((layer.innerText || '').split('\\n').map((s) => s.trim()).find((s) => /[a-z]{3}/i.test(s)) || 'Cart').slice(0, 40)
  }
  return null
}""".replace("/*OVERLAY*/", OVERLAY_JS)


def allowed(text: str, allow: re.Pattern[str] | None = None) -> bool:
    """The click guard: forbidden wording is refused unless this step explicitly allows it (e.g. checkout on the cart)."""
    return bool(allow and allow.search(text)) or not FORBIDDEN.search(text)


class Stuck(Exception):
    """Something on the page stops the walk (a popup that won't close): the reason for the report, and its narration."""

    def __init__(self, reason: str, narration: str) -> None:
        super().__init__(reason)
        self.reason = reason
        self.narration = narration


class GenericJourney:
    name = "general"

    def matches(self, url: str) -> bool:
        return urlsplit(url).scheme in ("http", "https")

    async def walk(self, walk: "Walk") -> None:
        try:
            await self._walk(walk)
        except Stuck as stuck:
            await walk.log("navigator", stuck.narration)
            await walk.stuck(stuck.reason)

    async def _walk(self, walk: "Walk") -> None:
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
        if label := await _other_variant(walk):
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
        # The cart may open as a panel over the page (a drawer): that's the cart, with nothing more to press.
        panel = await _cart_panel(page, first.signals.get("heading") or "")
        if panel:
            await walk.log("navigator", f'The cart opened in a panel on the page ("{panel}").')
        elif not CART_URL.search(page.url):
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
        # Only a page that shows a cart counts as one: a cart address, a cart panel, its lines or its bill.
        if not (CART_URL.search(cart.url) or panel or cart.signals.get("cartLines") or cart.signals.get("summary")):
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
        # It counts as checkout only if pressing the button changed something: a new page, a sign-in wall (on the page, or
        # in a one-click checkout's frame over it), a dialog.
        path = urlsplit(checkout.url).path
        new_page = path != urlsplit(cart.url).path
        wall = checkout.signals.get("signInWall") or ({"reason": SIGN_IN_STOP} if await _framed_sign_in(page) else None)
        shown = wall or len(checkout.signals.get("dialogs") or []) > len(cart.signals.get("dialogs") or [])
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
        if wall:
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
        await _press(walk, control["ref"], control["text"] or control["href"])

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


async def _press(walk: "Walk", ref: str, label: str) -> None:
    """Press the element marked `ref` (by CONTROLS_JS or OPTIONS_JS), first clearing a layer that covers it. Stuck when
    something stays on top of it."""
    page = walk.page
    target = page.locator(f'[data-shophonest-ref="{ref}"]').first
    with contextlib.suppress(Exception):
        await target.scroll_into_view_if_needed(timeout=3000)
    await _uncover(walk, ref, label)
    try:
        await target.click(timeout=walk.settings.nav_step_timeout_s * 1000)
    except PlaywrightTimeout:
        cover = await _cover(page, ref, anything=True)
        if cover is None:
            raise
        what = f'Something on the page ("{cover["text"]}")' if cover["text"] else "Something on the page"
        said = f'{what} stays on top of "{label}", so I can\'t press it. The walk stops here.'
        raise Stuck(f'Something on the page covered "{label}"', said) from None
    await _settle(page)


async def _cover(page: Page, ref: str, anything: bool = False) -> dict[str, Any] | None:
    """What covers the element marked `ref` (COVER_JS), or None when nothing does."""
    with contextlib.suppress(PlaywrightError):
        return await page.evaluate(COVER_JS, [ref, anything])
    return None


async def _uncover(walk: "Walk", ref: str, label: str) -> None:
    """Close a popup, sheet or drawer covering the element about to be pressed: Escape, then its own close control, then
    its bare backdrop, looking again after each. Stuck if it still covers the element."""
    page = walk.page
    cover = await _cover(page, ref)
    if cover is None:
        return
    popup = f'A popup ("{cover["text"]}")' if cover["text"] else "A popup"
    for way in ("escape", "closer", "backdrop"):
        if way == "escape":
            await page.keyboard.press("Escape")
            how = "with Escape"
        elif way == "closer" and cover["closer"] and allowed(cover["closer"]):
            with contextlib.suppress(PlaywrightError):
                await page.locator("[data-shophonest-closer]").first.click(timeout=3000)
            how = f'("{cover["closer"]}")'
        elif way == "backdrop" and cover["bare"]:
            await page.mouse.click(cover["x"], cover["y"])
            how = "by clicking beside it"
        else:
            continue
        await page.wait_for_timeout(600)
        fresh = await _cover(page, ref)
        if fresh is None:
            await walk.log("navigator", f'{popup} covered "{label}"; closed it {how}.')
            return
        cover = fresh
    raise Stuck(f'A popup covered "{label}"', f'{popup} covers "{label}" and I couldn\'t close it, so the walk stops here.')


async def _other_variant(walk: "Walk") -> str | None:
    """Pick another colour/size that can be bought, if the page offers a generic choice; return its label."""
    page = walk.page
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
    # Choices built from plain labels and list items, under a heading such as "Select Size". Only a press that changed
    # the option (or loaded its own page) counts as choosing it.
    row = None
    with contextlib.suppress(PlaywrightError):
        row = await page.evaluate(OPTIONS_JS)
    if row:
        options = [o for o in row["options"] if not o["chosen"] and not o["gone"] and allowed(o["text"])]
        for option in options[:3]:
            before, path = await _option_state(page, option["ref"]), urlsplit(page.url).path
            await _press(walk, option["ref"], option["text"])
            if await _option_state(page, option["ref"]) != before or urlsplit(page.url).path != path:
                return option["text"]
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


async def _option_state(page: Page, ref: str) -> str | None:
    with contextlib.suppress(PlaywrightError):
        return await page.evaluate(OPTION_STATE_JS, ref)
    return None


async def _added(page: Page) -> None:
    """Wait, a few seconds at most, for the page to show the add went through. A slow site registers the item only after
    its request returns; opening the cart before then finds it empty."""
    with contextlib.suppress(Exception):
        await page.wait_for_function(ADDED_JS, timeout=8000, polling=250)
        await page.wait_for_timeout(500)


async def _cart_panel(page: Page, product: str) -> str | None:
    """The first line of a cart panel open over the page that holds `product` (CART_PANEL_JS), or None."""
    with contextlib.suppress(PlaywrightError):
        return await page.evaluate(CART_PANEL_JS, product)
    return None


async def _framed_sign_in(page: Page) -> bool:
    """A frame of a good size on the page that asks the shopper to sign in (a one-click checkout's login sheet)."""
    for frame in page.frames[1:]:
        with contextlib.suppress(PlaywrightError):
            box = await (await frame.frame_element()).bounding_box()
            if box and box["width"] >= 300 and box["height"] >= 200:
                if FRAME_SIGN_IN.search(await frame.locator("body").inner_text(timeout=3000)):
                    return True
    return False


async def _page_text(page: Page) -> str:
    with contextlib.suppress(Exception):
        return await page.locator("body").inner_text(timeout=3000)
    return ""


def _refused(err: PlaywrightError, walk: "Walk") -> tuple[str, str] | None:
    """The stop reason and narration for a product page that wouldn't open at all; None for any other error."""
    code = re.search(r"net::(ERR_[A-Z0-9_]+)", str(err))
    if code is None or walk.guard.left:
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
