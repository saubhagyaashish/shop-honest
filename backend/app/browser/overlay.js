  // Layers over the page, shared by signals.js and the general navigator's scripts (journeys/generic.py), which splice
  // this in at /*OVERLAY*/.
  //
  // A layer is whatever a site puts over the page, however it marks it up (a popup, a bottom sheet, a cart drawer): the
  // outermost fixed box of a good size that is on screen and on top. A fixed header is too short to count; a fixed shell
  // around the whole page (one holding its main content or title) is the page itself; a fixed box nothing of which is on
  // top (a hidden drawer's see-through frame, a background) isn't over anything.
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
  // A layer's first line in words ("MY CART (1)", not a count badge's "1").
  const firstLine = (n) => (n.innerText || '').split('\n').map((s) => s.trim()).find((s) => /[a-z]{3}/i.test(s)) || ''
  // The cart itself, opened as a panel over the page: its first line names it ("MY CART (1)", "SHOPPING CART"). A popup
  // that merely mentions the cart ("We've added the Membership to your cart") isn't one.
  const cartPanel = (n) => /^(my |your |shopping )?(cart|bag|basket)\b/i.test(firstLine(n))
