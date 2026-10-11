// Generic page-signal extractor, run in the page by Playwright after each capture.
// It reads facts a shopper can see (timers, stock claims, prices, dialogs,
// checkboxes, cart lines, the order summary, sign-in walls) using text
// patterns and roles only: no site-specific ids. Every fact carries a
// bounding box as fractions of the full-page screenshot.
() => {
  const W = document.documentElement.scrollWidth
  const H = document.documentElement.scrollHeight
  const MONEY = /₹\s?([\d,]+(?:\.\d+)?)/
  const MONEY_ALL = /₹\s?([\d,]+(?:\.\d+)?)/g

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
  const struck = (el) => {
    for (let n = el; n && n !== document.body; n = n.parentElement) {
      if (['S', 'DEL', 'STRIKE'].includes(n.tagName)) return true
      if (getComputedStyle(n).textDecorationLine.includes('line-through')) return true
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

  // Countdown timers ("Deal ends in 09:51"). Clock times ("11:59 PM") are deadlines, not countdowns.
  const timers = []
  const deadlines = []
  for (const el of smallest(/(ends?|left|hurry|deal|offer|expires|closes)\b[^]{0,40}?\b\d{1,2}:\d{2}/i)) {
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
  const stock = smallest(/\bonly\s+\d+\s+(left|remaining)\b|\b\d+\s+left in stock\b/i).map((el) => {
    const t = text(el)
    return { text: t, count: Number(/(\d+)/.exec(t)[1]), bbox: textBox(el) }
  })

  // Sales-volume claims ("120+ bought in the last 24 hours").
  const salesClaims = smallest(/\b\d[\d,]*\+?\s+(bought|sold|people bought|orders)\b/i).map((el) => ({ text: text(el), bbox: textBox(el) }))

  // Price block: a struck-through ₹ amount (MRP) next to the selling price.
  let priceBlock = null
  for (const mrpEl of smallest(MONEY, 40).filter(struck)) {
    let block = mrpEl.parentElement
    for (let i = 0; i < 4 && block && new Set((text(block).match(MONEY_ALL) || [])).size < 2; i++) block = block.parentElement
    if (!block) continue
    const amounts = smallest(MONEY, 40).filter((el) => block.contains(el) && !struck(el))
    if (!amounts.length) continue
    const priceEl = amounts.reduce((a, b) => (parseFloat(getComputedStyle(b).fontSize) > parseFloat(getComputedStyle(a).fontSize) ? b : a))
    // Grow to include the whole price block (label, discount, tax note).
    while (block.parentElement && text(block.parentElement).length < 200 && !block.parentElement.querySelector('button')) block = block.parentElement
    priceBlock = { price: money(text(priceEl)), mrp: money(text(mrpEl)), text: text(block), bbox: box(block) }
    break
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
  for (const control of [...document.querySelectorAll('button, a, [role=button]')].filter((b) => visible(b) && /^(remove|delete)$/i.test(text(b)))) {
    const row = control.closest('li, tr, [role=listitem], article') || control.parentElement?.parentElement
    if (!row) continue
    const lines = (row.innerText || '').split('\n').map((s) => s.trim()).filter(Boolean)
    const prices = smallest(MONEY, 40).filter((el) => row.contains(el) && !struck(el))
    cartLines.push({ name: lines[0] || '', text: text(row), amount: prices.length ? money(text(prices[prices.length - 1])) : null, bbox: box(row) })
  }

  // Order summary: label → amount rows under a "price details / summary" heading.
  let summary = null
  const heading = smallest(/^(price details|order summary|summary|bill details|payment summary)$/i, 40)[0]
  if (heading) {
    let container = heading.parentElement
    while (container && container !== document.body && !/total/i.test(text(container))) container = container.parentElement
    if (container) {
      const rows = []
      let total = null
      for (const row of container.querySelectorAll('*')) {
        if (!visible(row) || row.children.length !== 2) continue
        const [labelEl, valueEl] = row.children
        const label = text(labelEl)
        const value = text(valueEl)
        if (!label || !value || MONEY.test(label) || !(MONEY.test(value) || /^free$/i.test(value))) continue
        const amount = /^free$/i.test(value) ? 0 : money(value) * (/^[−-]/.test(value) ? -1 : 1)
        const entry = { label, amount, text: `${label} ${value}`, bbox: box(row) }
        if (/total/i.test(label)) total = entry
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
    .filter((el) => !chrome(el) && !claimed.has(text(el)) && !el.closest('[role=dialog], [aria-modal=true], dialog'))
    .slice(0, 12)
    .map((el) => ({ text: text(el), section: sectionOf(el), bbox: textBox(el) }))

  // Fees disclosed in page text ("+ ₹9 platform fee per order").
  const body = text(document.body)
  const feeDisclosures = [...body.matchAll(/\+\s?₹\s?([\d,]+)\s+([a-z ]{0,30}?(?:fee|charge))/gi)].map((m) => ({
    label: m[2].trim().toLowerCase(),
    amount: toNumber(m[1]),
  }))

  // Sign-in walls: a visible password field, or a "sign in to continue" form.
  const password = [...document.querySelectorAll('input[type=password]')].find(visible)
  const signInWall = password
    ? { reason: 'Sign-in required', bbox: box(password.closest('form') || password) }
    : /\b(sign|log)\s?in to (continue|checkout|proceed)\b/i.test(body)
      ? { reason: 'Sign-in required', bbox: null }
      : null

  return {
    url: location.href,
    title: document.title,
    heading: text(document.querySelector('h1')),
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
  }
}
