// Generic page-signal extractor, run in the page by Playwright after each capture.
// It reads facts a shopper can see (timers, stock claims, prices, dialogs,
// checkboxes, cart lines, the order summary, sign-in walls) using text
// patterns and roles only: no site-specific ids. Every fact carries a
// bounding box as fractions of the full-page screenshot.
() => {
  const W = document.documentElement.scrollWidth
  const H = document.documentElement.scrollHeight
  // Indian prices: ₹1,499 · Rs. 500 · INR 499.
  const MONEY = /(?:₹|\bRs\.?|\bINR)\s?([\d,]+(?:\.\d+)?)/i
  const MONEY_ALL = /(?:₹|\bRs\.?|\bINR)\s?([\d,]+(?:\.\d+)?)/gi

  const text = (el) => (el?.innerText || '').replace(/\s+/g, ' ').trim()
  const toNumber = (s) => Number(String(s).replace(/,/g, ''))
  const money = (t) => {
    const m = MONEY.exec(t || '')
    return m ? toNumber(m[1]) : null
  }
  const visible = (el) => {
    if (!el) return false
    const style = getComputedStyle(el)
    const r = el.getBoundingClientRect()
    return style.visibility !== 'hidden' && style.display !== 'none' && Number(style.opacity) > 0 && r.width > 0 && r.height > 0
  }
  const rectBox = (r, pad = 4) => {
    const x = Math.max(0, r.left + window.scrollX - pad)
    const y = Math.max(0, r.top + window.scrollY - pad)
    return { x: x / W, y: y / H, w: Math.min(r.width + pad * 2, W - x) / W, h: Math.min(r.height + pad * 2, H - y) / H }
  }
  const box = (el) => rectBox(el.getBoundingClientRect())
  // Hugs the text when a block element is much wider than what it says.
  const textBox = (el) => {
    const range = document.createRange()
    range.selectNodeContents(el)
    const r = range.getBoundingClientRect()
    return r.width > 0 && r.width < el.getBoundingClientRect().width * 0.8 ? rectBox(r) : box(el)
  }
  // A line drawn across the text by a ::before/::after box (some sites strike the MRP this way, not with line-through).
  const lineOver = (el) =>
    ['::before', '::after'].some((pseudo) => {
      const ps = getComputedStyle(el, pseudo)
      if (ps.content === 'none' || ps.content === 'normal') return false
      const bordered = ['Top', 'Bottom'].some((side) => ps[`border${side}Style`] !== 'none' && parseFloat(ps[`border${side}Width`]) >= 1)
      return bordered && (parseFloat(ps.height) || 0) <= 2
    })
  const struck = (el) => {
    for (let n = el, depth = 0; n && n !== document.body; n = n.parentElement, depth++) {
      if (['S', 'DEL', 'STRIKE'].includes(n.tagName)) return true
      if (getComputedStyle(n).textDecorationLine.includes('line-through')) return true
      if (depth < 3 && lineOver(n)) return true
    }
    return false
  }
  // Smallest visible elements whose text matches: no child also matches.
  const smallest = (re, maxLen = 140) => {
    const out = []
    for (const el of document.body.querySelectorAll('*')) {
      if (['SCRIPT', 'STYLE', 'NOSCRIPT', 'SVG'].includes(el.tagName) || !visible(el)) continue
      const t = text(el)
      if (!t || t.length > maxLen || !re.test(t)) continue
      if ([...el.children].some((c) => re.test(text(c)))) continue
      out.push(el)
    }
    return out
  }

  // Rough colour names, so a model can read "grey text link" without parsing rgb().
  // Any CSS colour (rgb, hex, oklch…) to RGBA, by painting one pixel.
  const pixel = document.createElement('canvas').getContext('2d', { willReadFrequently: true })
  const toRgba = (css) => {
    pixel.clearRect(0, 0, 1, 1)
    pixel.fillStyle = 'rgba(0, 0, 0, 0)'
    pixel.fillStyle = css || 'rgba(0, 0, 0, 0)'
    pixel.fillRect(0, 0, 1, 1)
    return pixel.getImageData(0, 0, 1, 1).data
  }
  const colourName = (css) => {
    const [r255, g255, b255, a255] = toRgba(css)
    if (a255 < 26) return 'transparent'
    const [r, g, b] = [r255, g255, b255].map((v) => v / 255)
    const max = Math.max(r, g, b)
    const min = Math.min(r, g, b)
    const l = (max + min) / 2
    const sat = max === min ? 0 : (max - min) / (1 - Math.abs(2 * l - 1))
    if (sat < 0.2) return l > 0.92 ? 'white' : l < 0.18 ? 'black' : l > 0.6 ? 'light grey' : 'grey'
    let h = 0
    if (max === r) h = ((g - b) / (max - min)) % 6
    else if (max === g) h = (b - r) / (max - min) + 2
    else h = (r - g) / (max - min) + 4
    h = (h * 60 + 360) % 360
    const hue = h < 15 ? 'red' : h < 45 ? 'orange' : h < 70 ? 'yellow' : h < 160 ? 'green' : h < 195 ? 'teal' : h < 255 ? 'blue' : h < 290 ? 'purple' : h < 335 ? 'pink' : 'red'
    return (l > 0.8 ? 'pale ' : l < 0.3 ? 'dark ' : '') + hue
  }
  // How loud a control is: filled button, outlined button or plain text link, with size and colours.
  const prominence = (el) => {
    const cs = getComputedStyle(el)
    const r = el.getBoundingClientRect()
    const background = colourName(cs.backgroundColor)
    const bordered = parseFloat(cs.borderTopWidth) > 0 && cs.borderTopStyle !== 'none' && colourName(cs.borderTopColor) !== 'transparent'
    return {
      look: background !== 'transparent' ? 'filled button' : bordered ? 'outlined button' : 'text link',
      fontPx: Math.round(parseFloat(cs.fontSize)),
      bold: Number(cs.fontWeight) >= 600,
      width: Math.round(r.width),
      height: Math.round(r.height),
      textColour: colourName(cs.color),
      background,
    }
  }
  const chrome = (el) => el.closest('header, nav, footer, [role=banner], [role=navigation], [role=contentinfo]')
  // The nearest heading above an element, for context ("Delivery speed", "Membership").
  const sectionOf = (el) => {
    for (let n = el.parentElement, depth = 0; n && n !== document.body && depth < 8; n = n.parentElement, depth++) {
      const h = n.querySelector('h1, h2, h3, h4, [role=heading], legend')
      if (h && h !== el && !h.contains(el) && text(h)) return text(h).slice(0, 60)
    }
    return ''
  }

  // Really on screen: not screen-reader-only text (tiny or clipped away), and not made see-through by a parent.
  const shown = (el) => {
    if (!visible(el)) return false
    const r = el.getBoundingClientRect()
    if (r.width < 4 || r.height < 4) return false
    const cs = getComputedStyle(el)
    if (/inset\(50%\)/.test(cs.clipPath) || /^rect\(0(px)?,?\s*0(px)?/.test(cs.clip)) return false
    return typeof el.checkVisibility !== 'function' || el.checkVisibility({ opacityProperty: true, visibilityProperty: true })
  }

  // The product's title: the largest visible h1 (some sites put a screen-reader-only h1 first). On a site without one
  // (Blinkit), the largest visible element outside the site's header and footer whose whole text starts the page's
  // title: "GOBOULT K35 TWS Earbuds (Space Black)" of "GOBOULT K35 TWS Earbuds (Space Black) Price - Buy Online…".
  const fontPx = (el) => parseFloat(getComputedStyle(el).fontSize)
  const pageTitle = document.title.replace(/\s+/g, ' ').trim().toLowerCase()
  const startsPageTitle = (el) => {
    if (el.children.length || chrome(el)) return false
    const t = text(el).toLowerCase()
    return t.length >= 8 && pageTitle.startsWith(t) && shown(el)
  }
  const largest = (els) => els.sort((a, b) => fontPx(b) - fontPx(a))[0]
  const title =
    largest([...document.querySelectorAll('h1')].filter(shown)) || largest([...document.body.querySelectorAll('*')].filter(startsPageTitle))

  // Inside a list of other products (a carousel, "customers also viewed", variant swatches): inside one of 3+ sibling
  // cards, below the product's own area. A card shows a price and either a picture or its own add button (Blinkit's
  // carousel cards load their pictures only when scrolled to). Price rows in a buy box have neither.
  const ADD = /^\+?\s?add( to (cart|bag|basket|trolley))?$/i
  const cards = new WeakMap()
  const isCard = (c) => {
    if (!cards.has(c)) {
      const priced = MONEY.test(c.innerText || '')
      const own = priced && (c.querySelector('img') || [...c.querySelectorAll('*')].some((e) => !e.children.length && ADD.test(text(e))))
      cards.set(c, !!own)
    }
    return cards.get(c)
  }
  const productLists = new WeakMap()
  const isProductList = (n) => {
    if (!productLists.has(n)) productLists.set(n, [...n.children].filter(isCard).length >= 3)
    return productLists.get(n)
  }
  const otherProducts = (el) => {
    // Deep: a big marketplace wraps each card in a dozen or more layers. Only an element inside one of the cards counts,
    // not one beside them (a cart's "Continue" next to recommendations).
    for (let card = el, n = el.parentElement, depth = 0; n && n !== document.body && depth < 30; card = n, n = n.parentElement, depth++) {
      if (title && n.contains(title)) return false
      if (isProductList(n) && isCard(card)) return true
    }
    return false
  }
  // About the product under audit: not the site's header, menus or footer, and not another product's card.
  const aboutProduct = (el) => !chrome(el) && !otherProducts(el)
  // The navigator skips other products' buttons with the same test (CONTROLS_JS in journeys/generic.py).
  window.__shophonestOtherProduct = otherProducts

  // Countdown timers ("Deal ends in 09:51"). Clock times ("11:59 PM") are deadlines, not countdowns.
  const timers = []
  const deadlines = []
  for (const el of smallest(/(ends?|left|hurry|deal|offer|expires|closes)\b[^]{0,40}?\b\d{1,2}:\d{2}/i).filter(aboutProduct)) {
    const t = text(el)
    if (/\b\d{1,2}:\d{2}\s?(am|pm)\b/i.test(t)) {
      deadlines.push({ text: t, bbox: box(el) })
      continue
    }
    const m = /\b(\d{1,2}):(\d{2})(?::(\d{2}))?\b/.exec(t)
    const seconds = m[3] ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : Number(m[1]) * 60 + Number(m[2])
    timers.push({ text: t, seconds, bbox: box(el) })
  }

  // Scarcity ("only 2 left in stock").
  const stock = smallest(/\bonly\s+\d+\s+(left|remaining)\b|\b\d+\s+left in stock\b/i).filter(aboutProduct).map((el) => {
    const t = text(el)
    return { text: t, count: Number(/(\d+)/.exec(t)[1]), bbox: textBox(el) }
  })

  // Sales-volume claims ("120+ bought in the last 24 hours").
  const salesClaims = smallest(/\b\d[\d,]*\+?\s+(bought|sold|people bought|orders)\b/i)
    .filter(aboutProduct)
    .map((el) => ({ text: text(el), bbox: textBox(el) }))

  // Distance from the product's title, to tell its price from prices elsewhere on the page.
  const nearTitle = (el) => {
    if (!title) return 0
    const t = title.getBoundingClientRect()
    const r = el.getBoundingClientRect()
    const dy = r.top >= t.top ? r.top - t.bottom : (t.top - r.bottom) * 3 // above the title counts triple
    const dx = r.right < t.left || r.left > t.right ? Math.min(Math.abs(r.left - t.right), Math.abs(t.left - r.right)) : 0
    return Math.max(0, dy) + dx
  }

  // Price block: a struck-through amount (MRP) next to the selling price; the one closest to the title wins.
  let priceBlock = null
  let bestDistance = Infinity
  // Some sites draw the MRP's ₹ separately and strike only the number ("3,999"); accept that when a ₹ price is beside it.
  const BARE = /^[\d,]{3,}(\.\d+)?$/
  const sellingIn = (block) => smallest(MONEY, 40).filter((el) => block.contains(el) && !struck(el))
  // Only an MRP beside the product's title: further down the page, prices belong to other products.
  const besideTitle = (el) => !title || nearTitle(el) < 900
  for (const mrpEl of [...smallest(MONEY, 40), ...smallest(BARE, 14)].filter((el) => struck(el) && aboutProduct(el) && besideTitle(el))) {
    // Up to the block that also holds the selling price (some sites put the MRP on its own row, several layers apart).
    let block = mrpEl.parentElement
    for (let i = 0; i < 8 && block && !sellingIn(block).length && text(block).length < 300; i++) block = block.parentElement
    if (!block) continue
    const amounts = sellingIn(block)
    if (!amounts.length) continue
    const distance = nearTitle(mrpEl)
    if (distance >= bestDistance) continue
    const priceEl = amounts.reduce((a, b) => (parseFloat(getComputedStyle(b).fontSize) > parseFloat(getComputedStyle(a).fontSize) ? b : a))
    // Grow to include the whole price block (label, discount, tax note).
    while (block.parentElement && text(block.parentElement).length < 200 && !block.parentElement.querySelector('button')) block = block.parentElement
    const mrp = money(text(mrpEl)) ?? toNumber(text(mrpEl))
    priceBlock = { price: money(text(priceEl)), mrp, text: text(block), bbox: box(block) }
    bestDistance = distance
  }

  // The selling price, even without an MRP: the largest price near the title.
  let mainPrice = priceBlock ? { price: priceBlock.price, text: priceBlock.text, bbox: priceBlock.bbox } : null
  if (!mainPrice) {
    const candidates = smallest(MONEY, 40)
      .filter((el) => !struck(el) && aboutProduct(el) && nearTitle(el) < 700)
      .map((el) => ({ el, size: parseFloat(getComputedStyle(el).fontSize), distance: nearTitle(el) }))
      .sort((a, b) => b.size - a.size || a.distance - b.distance)
    if (candidates.length) {
      const el = candidates[0].el
      mainPrice = { price: money(text(el)), text: text(el), bbox: textBox(el) }
    }
  }

  // Dialogs (offers, newsletters, consent) and their buttons.
  const dialogs = [...document.querySelectorAll('[role=dialog], [aria-modal=true], dialog[open]')].filter(visible).map((el) => ({
    text: text(el),
    buttons: [...el.querySelectorAll('button, a, [role=button]')].filter(visible).map((b) => ({ text: text(b), ...prominence(b), bbox: box(b) })),
    bbox: box(el),
  }))

  // Checkboxes with their label text.
  const checkboxes = [...document.querySelectorAll('input[type=checkbox]')]
    .map((input) => {
      const label = input.closest('label') || (input.id && document.querySelector(`label[for="${input.id}"]`))
      const target = label && visible(label) ? label : input
      if (!visible(target)) return null
      const t = text(label) || input.getAttribute('aria-label') || ''
      return {
        label: t,
        checked: input.checked,
        amount: money(t),
        recurring: /\/\s?(month|mo|year|yr)\b|per month|monthly|auto-?renew|subscription|membership/i.test(t),
        bbox: box(target),
      }
    })
    .filter(Boolean)

  // Cart lines: rows that have a Remove control.
  const cartLines = []
  const removes = (b) =>
    /^(remove|delete|×|✕|✖|x)$/i.test(text(b)) ||
    /remove|delete/i.test(`${b.getAttribute('aria-label') || ''} ${b.getAttribute('title') || ''} ${b.className || ''}`)
  for (const control of [...document.querySelectorAll('button, a, [role=button]')].filter((b) => visible(b) && removes(b))) {
    const row = control.closest('li, tr, [role=listitem], article') || control.parentElement?.parentElement
    if (!row) continue
    const lines = (row.innerText || '').split('\n').map((s) => s.trim()).filter(Boolean)
    const prices = smallest(MONEY, 40).filter((el) => row.contains(el) && !struck(el))
    cartLines.push({ name: lines[0] || '', text: text(row), amount: prices.length ? money(text(prices[prices.length - 1])) : null, bbox: box(row) })
  }

  // Order summary: label → amount rows under a "price details / bill summary" heading. A row is a label and an amount,
  // with nothing but spacers or an icon between them (1mg). The total is "Total amount" or "To be paid", not
  // "Item total" or "Total discount".
  let summary = null
  const heading = smallest(
    /^(price details|order summary|summary|bill details|bill summary|cart summary|price summary|payment summary|payment details)$/i,
    40,
  )[0]
  const TOTAL = /^(total( amount| payable| price)?|grand total|order total|amount payable|net payable|to (be )?pa(y|id)|you pay)\b/i
  if (heading) {
    let container = heading.parentElement
    while (container && container !== document.body && !/total|to (be )?pa(y|id)|payable/i.test(text(container))) {
      container = container.parentElement
    }
    if (container) {
      const rows = []
      let total = null
      for (const row of container.querySelectorAll('*')) {
        const parts = [...row.children].filter((c) => text(c))
        if (!visible(row) || parts.length !== 2) continue
        const [label, value] = parts.map(text)
        if (MONEY.test(label) || value.length > 24 || !(MONEY.test(value) || /^free$/i.test(value))) continue
        const amount = /^free$/i.test(value) ? 0 : money(value) * (/^[−-]/.test(value) ? -1 : 1)
        const entry = { label, amount, text: `${label} ${value}`, bbox: box(row) }
        if (TOTAL.test(label) && !/discount|saving/i.test(label)) total = entry
        else rows.push(entry)
      }
      summary = { rows, total, bbox: box(container) }
    }
  }

  // Buttons, links and radio options in the page body (site chrome and dialogs are skipped).
  const controls = []
  const seenControls = new Set()
  for (const el of document.querySelectorAll('button, a[href], [role=button], input[type=submit], input[type=radio]')) {
    const target = el.type === 'radio' ? el.closest('label') || el : el
    if (!visible(target) || chrome(target) || target.closest('[role=dialog], [aria-modal=true], dialog')) continue
    const t = (text(target) || el.getAttribute('aria-label') || el.value || '').slice(0, 100)
    if (!t || seenControls.has(t)) continue
    seenControls.add(t)
    controls.push({
      text: t,
      kind: el.type === 'radio' ? 'radio option' : el.tagName === 'A' ? 'link' : 'button',
      checked: el.type === 'radio' ? el.checked : undefined,
      section: sectionOf(target),
      ...prominence(el.type === 'radio' ? target : el),
      bbox: box(target),
    })
    if (controls.length >= 30) break
  }

  // Persuasive or claim-like lines ("Most customers choose Express delivery"), beyond the timers and stock above.
  const claimed = new Set([...timers, ...stock, ...salesClaims].map((c) => c.text))
  const notes = smallest(
    /\b(most (customers|people|shoppers)|popular|recommended|best ?seller|selling fast|in (high )?demand|(people|others) (are )?(viewing|looking)|limited (time|stock|offer)|don'?t miss|last chance|exclusive|one-time|guaranteed?)\b/i,
    120,
  )
    .filter((el) => aboutProduct(el) && !claimed.has(text(el)) && !el.closest('[role=dialog], [aria-modal=true], dialog'))
    .slice(0, 12)
    .map((el) => ({ text: text(el), section: sectionOf(el), bbox: textBox(el) }))

  // The product's name: the page's h1, else the heading nearest the price, else the title minus the site's name.
  const productName = () => {
    if (title && text(title)) return text(title).replace(/\.{3}\s*more$/i, '').trim()
    const anchor = mainPrice && smallest(MONEY, 40).find((el) => text(el) && mainPrice.text.includes(text(el)))
    const headings = [...document.querySelectorAll('h2, h3, [itemprop=name]')].filter((h) => shown(h) && !chrome(h) && text(h).length > 1)
    if (anchor) {
      // Same column as the price (overlapping horizontally), at or above it, closest first: not a sidebar's headings.
      const a = anchor.getBoundingClientRect()
      // Above the price, scored by distance plus how far its left edge is from the price's (aligned = same column).
      const near = headings
        .map((h) => ({ h, r: h.getBoundingClientRect() }))
        .filter(({ r }) => r.top <= a.top + 5 && a.top - r.top < 400)
        .map(({ h, r }) => ({ h, score: a.top - r.top + 3 * Math.abs(r.left - a.left) }))
        .sort((x, y) => x.score - y.score)[0]
      if (near) return text(near.h)
    }
    return (document.title || '').split(/\s[|–—-]\s/)[0].trim()
  }

  // Fees disclosed in page text ("+ ₹9 platform fee per order").
  const body = text(document.body)
  const feeDisclosures = [...body.matchAll(/\+\s?(?:₹|Rs\.?)\s?([\d,]+)\s+([a-z ]{0,30}?(?:fee|charge))/gi)].map((m) => ({
    label: m[2].trim().toLowerCase(),
    amount: toNumber(m[1]),
  }))

  // Sign-in walls: a visible password field, a phone/OTP login form, or "sign in to continue"-style wording.
  const password = [...document.querySelectorAll('input[type=password]')].find(visible)
  const WALL = /\b(sign|log)\s?-?in( to your account)? (to|and) (continue|checkout|check out|proceed|place)|\blogin account to proceed|\blog\s?in or sign\s?up\b|\b(register|sign\s?up) \/ (login|log in|sign in)\b|\b(request|get|send) otp\b|\b(sign|log)\s?-?in or (create|register)\b|\bcreate (an |your )?account or (sign|log)\s?-?in\b/i
  const wallText = smallest(WALL, 300).find((el) => !chrome(el))
  // A sign-in page that asks for an email or phone first, with the password on a later screen.
  const SIGN_IN_PATH = /\/(ap\/)?(sign-?in|log-?in)\b|\/account\/login\b/i
  const credential = SIGN_IN_PATH.test(location.pathname)
    ? [...document.querySelectorAll('input[type=email], input[type=tel], input[type=text], input:not([type])')].find(shown)
    : null
  const signInWall = password
    ? { reason: 'Sign-in required', bbox: box(password.closest('form, [role=dialog]') || password) }
    : wallText
      ? { reason: 'Sign-in required', bbox: box(wallText.closest('form, [role=dialog], .modal') || wallText) }
      : credential
        ? { reason: 'Sign-in required', bbox: box(credential.closest('form, [role=dialog]') || credential) }
        : null

  // An error page instead of content ("Something went wrong", "Please try again later"): little text, an apology.
  const ERROR = /something went wrong|please try again later|we'?re having trouble|unexpected error|oops[!,.]|page (isn'?t|is not) available/i
  const pageError = body.length < 600 && ERROR.test(body) ? { reason: body.slice(0, 80) } : null
  // Nothing at all: no text and no picture (a site serving automated browsers a blank page).
  const emptyPage = !body && ![...document.querySelectorAll('img, svg, canvas, iframe, video')].some(visible) ? { reason: 'Empty page' } : null

  // Bot protection: a CAPTCHA frame, or a "prove you're human" / "access denied" page.
  const captcha = [...document.querySelectorAll('iframe')].find(
    (f) => visible(f) && /recaptcha|hcaptcha|challenges\.cloudflare|turnstile|arkoselabs|funcaptcha/i.test(f.src || ''),
  )
  const BOT =
    /verify (that )?you are (a )?human|are you a (human|robot)|robot or human|i'?m not a robot|access denied|unusual traffic|(press|click|tap|activate) (and|&) hold|confirm (that )?you'?(re| are) (a )?human|checking your browser|request (was )?blocked|bot protection/i
  const botText = smallest(BOT, 200)[0]
  // A short page at a /blocked or /captcha address, whatever it says.
  const blockedPage = /\/(blocked|captcha)\b/i.test(location.pathname) && body.length < 1500
  const botWall = captcha
    ? { reason: 'CAPTCHA', bbox: box(captcha) }
    : botText
      ? { reason: text(botText).slice(0, 80), bbox: box(botText) }
      : blockedPage
        ? { reason: 'Blocked page', bbox: { x: 0, y: 0, w: 1, h: Math.min(1, 800 / H) } }
        : null

  // The product can't be bought right now ("Currently unavailable", "Out of stock").
  const unavailableEl = smallest(/\b(currently unavailable|out of stock|sold out|temporarily unavailable|no longer available)\b/i, 160).find(
    aboutProduct,
  )
  const unavailable = unavailableEl ? { text: text(unavailableEl), bbox: textBox(unavailableEl) } : null

  return {
    url: location.href,
    title: document.title,
    heading: productName(),
    width: W,
    height: H,
    timers,
    deadlines,
    stock,
    salesClaims,
    priceBlock,
    dialogs,
    checkboxes,
    cartLines,
    controls,
    notes,
    summary,
    feeDisclosures,
    signInWall,
    // An unavailable product with no price block of its own: any price nearby is another option's (a colour swatch).
    mainPrice: unavailable && !priceBlock ? null : mainPrice,
    botWall,
    pageError,
    emptyPage,
    unavailable,
  }
}
