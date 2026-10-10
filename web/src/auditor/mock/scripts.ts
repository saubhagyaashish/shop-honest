// Scripted audits of the two demo stores. Every screenshot, bounding box and
// quoted string comes from a real walk of the stores (captures.json), so the
// mock looks exactly like the live agent will, minus the model calls.

import type { AgentName, AuditEvent, AuditReport, Finding, JourneyStep, Severity, StepCapture } from '../../shared/contract'
import { JOURNEY_STEPS } from '../../shared/contract'
import { PATTERNS } from '../../shared/patterns'
import { ANSWER_KEY } from '../../store/answerKey'
import type { ExpectedFinding, FrameId } from '../../store/answerKey'
import { discountPercent, findProduct, formatINR, HERO_SLUG, PLUS_MEMBERSHIP, PROTECTION_PLAN } from '../../store/catalog'
import type { StoreId } from '../../store/catalog'
import { STORES } from '../../store/variants'
import { REVIEW_THRESHOLD, trustScore } from '../score'
import type { Captures, CapturedFrame } from './captures'
import capturesJson from './captures.json'

const CAPTURES = capturesJson as unknown as Captures


export interface ScriptedEvent {
  delayMs: number
  event: AuditEvent
}

interface Narrative {
  title: string
  explanation: string
  confidence: number
  detectedBy: AgentName
  severity?: Severity
  captions: string[]
  observations: string[]
}

class Ctx {
  readonly storeId: StoreId
  readonly origin: string
  constructor(storeId: StoreId, origin: string) {
    this.storeId = storeId
    this.origin = origin
  }

  frame(id: FrameId): CapturedFrame {
    const f = CAPTURES.stores[this.storeId].frames[id]
    if (!f) throw new Error(`No capture for ${this.storeId}/${id}. Run npm run capture.`)
    return f
  }

  text(id: FrameId, selector: string): string {
    return this.frame(id).elements[selector]?.text ?? ''
  }

  probe(key: string): string {
    return CAPTURES.stores[this.storeId].probes[key] ?? ''
  }

  url(id: FrameId): string {
    return this.origin + this.frame(id).url
  }
}

function priceFacts(storeId: StoreId) {
  const product = findProduct(HERO_SLUG)!
  const { price, mrp } = product.pricing[storeId]
  const history = product.priceHistory![storeId]
  const sold = history.map((p) => p.price)
  const firstWithCurrentMrp = history.find((p) => p.mrp === mrp)!
  const priorMrp = history[0].mrp
  return {
    name: product.name,
    price,
    mrp,
    weeks: history.length - 1,
    minSold: Math.min(...sold),
    maxSold: Math.max(...sold),
    priorMrp,
    mrpChangedDaysAgo: firstWithCurrentMrp.daysAgo,
    advertisedDiscount: discountPercent(price, mrp),
    realDiscount: discountPercent(price, priorMrp),
    observations: history.length,
    weeksAtMrp: history.filter((p) => p.price === mrp).length,
  }
}

function storeANarratives(c: Ctx): Record<string, Narrative> {
  const p = priceFacts('a')
  const timerBefore = c.probe('clockBeforeReload').replace('Deal ends in ', '')
  const timerAfter = c.text('product-reload', '#deal-timer').replace('Deal ends in ', '')
  const secondsOnPage = c.probe('secondsOnPage')
  const stock = c.text('product', '#stock-note')
  const fees = STORES.a.paymentStepFees
  const feeTotal = fees.reduce((n, f) => n + f.amount, 0)
  return {
    'a-guilt-decline': {
      title: 'Decline link shames the shopper',
      explanation:
        'A first-order offer opened 1.2 s after the page loaded, without any action from the shopper. Its only exit is a link that frames saying no as a foolish choice, rather than a neutral "No thanks".',
      confidence: 0.91,
      detectedBy: 'pattern_analyst',
      captions: ['Offer modal on first load'],
      observations: [
        'Modal appeared unprompted, 1.2 s after load',
        `Decline wording: "${c.text('product-popup', '#offer-modal-decline')}"`,
        'No close (×) button: the shaming link is the only way out',
      ],
    },
    'a-inflated-mrp': {
      title: `${p.advertisedDiscount}% discount is calculated off an MRP raised ${p.mrpChangedDaysAgo} days ago`,
      explanation: `The page advertises ${formatINR(p.price)} as ${p.advertisedDiscount}% off an MRP of ${formatINR(p.mrp)}. Over the last ${p.weeks} weeks the product sold at ${formatINR(p.minSold)}–${formatINR(p.maxSold)} against an MRP of ${formatINR(p.priorMrp)}. The MRP was raised to ${formatINR(p.mrp)} ${p.mrpChangedDaysAgo} days ago and the product has never sold at that price. Against the genuine reference price, the discount is ${p.realDiscount}%.`,
      confidence: 0.93,
      detectedBy: 'price_historian',
      captions: ['Advertised price block'],
      observations: [
        `Advertised: ${formatINR(p.price)}, MRP ${formatINR(p.mrp)} (${p.advertisedDiscount}% off)`,
        `Last ${p.weeks} weeks: sold at ${formatINR(p.minSold)}–${formatINR(p.maxSold)}, never at ${formatINR(p.mrp)}`,
        `MRP changed ${formatINR(p.priorMrp)} → ${formatINR(p.mrp)}, ${p.mrpChangedDaysAgo} days ago`,
        `Discount against the prior MRP: ${p.realDiscount}%`,
      ],
    },
    'a-restarting-timer': {
      title: 'Countdown timer restarts on every page load',
      explanation: `The "Deal ends in" countdown read ${timerBefore} after ${secondsOnPage} s on the page. Straight after a reload it read ${timerAfter}. A real deadline cannot move later, so this timer is restarting per visit and the urgency it creates is false.`,
      confidence: 0.97,
      detectedBy: 'pattern_analyst',
      captions: [`First look, after ${secondsOnPage} s on the page`, 'Second look, straight after reload'],
      observations: [
        `Before reload: ${timerBefore}`,
        `After reload: ${timerAfter}`,
        'The deadline moved later, which a real end time cannot do',
      ],
    },
    'a-frozen-stock': {
      title: '"Only 2 left" never changes',
      explanation:
        'The scarcity badge shows the same count on first load, after a reload and after switching colour. Different colours normally carry separate stock, so an identical "2 left" everywhere is consistent with a hard-coded message rather than live inventory.',
      confidence: 0.84,
      detectedBy: 'pattern_analyst',
      severity: 'medium',
      captions: ['First look', 'After reload'],
      observations: [
        `Read on 3 looks: "${stock}" every time`,
        'Looks taken: first load, after a reload, after a colour change',
        'Same count for Midnight Black and Ocean Blue',
      ],
    },
    'a-buyers-claim': {
      title: '"120+ bought in the last 24 hours" cannot be verified',
      explanation:
        'This sales-volume claim may well be true: the figure is plausible for a popular product and the agent has no access to order data. Rather than assert a violation, the adjudicator sent it to a reviewer who can check it against real orders.',
      confidence: 0.58,
      detectedBy: 'pattern_analyst',
      severity: 'low',
      captions: ['Sales-volume claim under the rating'],
      observations: [
        `Claim: "${c.text('product', '#buyers-note').replace(/^\W+/u, '')}"`,
        'No source, timestamp or link behind the figure',
        `Adjudicator confidence 0.58, below the ${REVIEW_THRESHOLD} threshold`,
      ],
    },
    'a-added-protection': {
      title: 'Protection plan added to the cart without consent',
      explanation: `The agent added exactly one item to the cart. The cart then held two lines: a ${formatINR(PROTECTION_PLAN.price)} "${PROTECTION_PLAN.name}" had been added automatically. The shopper never ticked, chose or was asked about it.`,
      confidence: 0.96,
      detectedBy: 'evidence',
      captions: ['Cart after adding one item'],
      observations: [
        'Added by the agent: 1 line (SonicBuds Pro, Ocean Blue)',
        'Found in cart: 2 lines',
        `Extra line: ${PROTECTION_PLAN.name}, ${formatINR(PROTECTION_PLAN.price)}`,
        `Cart total ${c.text('cart', '#order-total')} instead of ${formatINR(p.price)}`,
      ],
    },
    'a-ticked-membership': {
      title: 'Paid membership ticked by default',
      explanation: `Checkout enrols the shopper in ${PLUS_MEMBERSHIP.name} at ${formatINR(PLUS_MEMBERSHIP.monthly)}/month unless they spot and untick it. The recurring charge and the "cancelled via written request" exit are in 10 px grey fine print, so leaving is made deliberately hard.`,
      confidence: 0.94,
      detectedBy: 'pattern_analyst',
      captions: ['Membership section on arrival at checkout'],
      observations: [
        'Checkbox state on arrival: ticked',
        'Recurring-charge terms: 10 px, light grey',
        'Cancellation only "via written request", with no online exit',
        `${formatINR(PLUS_MEMBERSHIP.monthly)} added to the order total`,
      ],
    },
    'a-lopsided-delivery': {
      title: 'Paid upgrade is a giant button, free option a tiny grey link',
      explanation:
        'The delivery step makes the ₹79 Express upgrade the full-width primary action. The free standard option is an 11 px grey text link beneath it, styled to be missed. "Most customers choose Express" adds unverified social pressure.',
      confidence: 0.81,
      detectedBy: 'pattern_analyst',
      captions: ['Delivery speed choice'],
      observations: [
        'Express: full-width, bold, saffron button',
        'Standard (free): 11 px grey link, no button',
        'Both lead to payment; only the paid one looks like a choice',
      ],
    },
    'a-late-fees': {
      title: `${formatINR(feeTotal)} in fees appears only at the payment step`,
      explanation: `The product page showed ${formatINR(p.price)} "inclusive of all taxes" with free delivery. ${fees
        .map((f) => `${f.label} (${formatINR(f.amount)})`)
        .join(', ')} were first shown on the payment step, after the shopper had invested in the journey. None was disclosed on the product, cart or checkout pages.`,
      confidence: 0.95,
      detectedBy: 'evidence',
      captions: ['Price as first shown', 'Price breakdown at payment'],
      observations: [
        `Product page: ${formatINR(p.price)}`,
        `Cart: ${c.text('cart', '#order-total')} · Checkout: ${c.text('checkout', '#order-total')} · Payment: ${c.text('payment', '#order-total')}`,
        `New at payment: ${fees.map((f) => `${f.label.toLowerCase()} ${formatINR(f.amount)}`).join(', ')}`,
      ],
    },
  }
}

function buildFinding(c: Ctx, expected: ExpectedFinding, n: Narrative): Finding {
  const pattern = PATTERNS[expected.patternId]
  const last = expected.evidence[expected.evidence.length - 1]
  const first = expected.evidence[0]
  return {
    id: expected.id,
    patternId: expected.patternId,
    title: n.title,
    explanation: n.explanation,
    severity: n.severity ?? pattern.defaultSeverity,
    confidence: n.confidence,
    status: expected.status,
    step: expected.step,
    pageUrl: c.url(last.frame),
    rule: pattern.rule,
    detectedBy: n.detectedBy,
    evidence: {
      frames: expected.evidence.map((e, i) => ({
        screenshotUrl: c.frame(e.frame).src,
        caption: n.captions[i] ?? '',
        bbox: c.frame(e.frame).elements[e.selector]?.bbox,
      })),
      elementText: c.text(first.frame, first.selector),
      observations: n.observations,
    },
  }
}

const PRIMARY_FRAME: Record<JourneyStep, FrameId> = {
  product: 'product',
  variant: 'variant',
  cart: 'cart',
  checkout: 'checkout',
  payment: 'payment',
}

class ScriptBuilder {
  readonly events: ScriptedEvent[] = []
  readonly findings: Finding[] = []
  private readonly c: Ctx
  private readonly byId: Map<string, Finding>
  constructor(c: Ctx, findings: Finding[]) {
    this.c = c
    this.byId = new Map(findings.map((f) => [f.id, f]))
  }

  emit(event: AuditEvent, delayMs = 600) {
    this.events.push({ delayMs, event })
  }
  log(agent: AgentName, message: string, delayMs = 1300) {
    this.emit({ type: 'agent.log', agent, message }, delayMs)
  }
  step(step: JourneyStep, delayMs = 900) {
    this.emit({ type: 'step.started', step, url: this.c.url(PRIMARY_FRAME[step]) }, delayMs)
  }
  capture(frameId: FrameId, delayMs = 500) {
    const f = this.c.frame(frameId)
    this.emit({ type: 'step.captured', step: f.step, url: this.c.url(frameId), screenshotUrl: f.src }, delayMs)
  }
  finding(id: string, delayMs = 900) {
    const f = this.byId.get(id)
    if (!f) throw new Error(`Unknown finding ${id}`)
    this.findings.push(f)
    this.emit({ type: 'finding', finding: f }, delayMs)
  }
}

function scriptStoreA(b: ScriptBuilder, c: Ctx) {
  const p = priceFacts('a')
  const timerBefore = c.probe('clockBeforeReload').replace('Deal ends in ', '')
  const timerAfter = c.text('product-reload', '#deal-timer').replace('Deal ends in ', '')

  b.step('product', 700)
  b.log('navigator', 'Opened the product page. A modal appeared 1.2 s after load, without any action from me.', 1200)
  b.capture('product-popup')
  b.log('pattern_analyst', `Reading the modal. Its only exit is a link: "${c.text('product-popup', '#offer-modal-decline')}".`, 1500)
  b.finding('a-guilt-decline')
  b.log('navigator', `Dismissed the modal. Staying on the page for ${c.probe('secondsOnPage')} s, like a shopper reading the details.`, 1200)
  b.capture('product')
  b.log('pattern_analyst', `Urgency signals: a countdown at ${timerBefore}, "${c.text('product', '#stock-note')}" and a sales-volume claim. One look can't tell real from fake, so I've asked Navigator for a second look.`, 1700)
  b.log('price_historian', `Pulling ${p.weeks} weeks of price history for ${p.name}…`, 1200)
  b.log('price_historian', `Sold at ${formatINR(p.minSold)}–${formatINR(p.maxSold)} all quarter. MRP changed ${formatINR(p.priorMrp)} → ${formatINR(p.mrp)} ${p.mrpChangedDaysAgo} days ago.`, 1600)
  b.finding('a-inflated-mrp')
  b.log('navigator', 'Reloading the page for a second look.', 1000)
  b.capture('product-reload', 900)
  b.log('pattern_analyst', `Timer went from ${timerBefore} to ${timerAfter} after the reload: the deadline moved later.`, 1300)
  b.finding('a-restarting-timer')
  b.log('pattern_analyst', 'Stock badge is identical on every look and on every colour.', 1300)
  b.finding('a-frozen-stock')
  b.log('pattern_analyst', '"120+ bought in the last 24 hours" has no source, and nothing on the page can confirm or refute it.', 1400)
  b.log('adjudicator', `Confidence 0.58 is below the ${REVIEW_THRESHOLD} threshold. Sending to human review instead of asserting it.`, 1200)
  b.finding('a-buyers-claim', 700)

  b.step('variant')
  b.log('navigator', 'Choosing colour: Ocean Blue.', 800)
  b.capture('variant')
  b.log('pattern_analyst', `Price stays ${formatINR(p.price)} on every colour, so there's no bait-and-switch between variants.`, 1300)

  b.step('cart')
  b.log('navigator', 'Added 1 × SonicBuds Pro (Ocean Blue) to the cart. Opening the cart.', 900)
  b.capture('cart')
  b.log('evidence', 'Comparing the cart with what I actually added: expected 1 line, found 2.', 1500)
  b.finding('a-added-protection')

  b.step('checkout')
  b.log('navigator', 'Proceeding to checkout with the saved address.', 800)
  b.capture('checkout')
  b.log('pattern_analyst', `Membership checkbox arrived ticked: ${formatINR(PLUS_MEMBERSHIP.monthly)}/month, terms in 10 px grey.`, 1400)
  b.finding('a-ticked-membership')
  b.log('pattern_analyst', 'Delivery step: a full-width ₹79 Express button against an 11 px grey link for free delivery.', 1300)
  b.finding('a-lopsided-delivery')
  b.log('navigator', 'Choosing free standard delivery via the small grey link, as a careful shopper would.', 1100)

  b.step('payment')
  b.capture('payment')
  b.log('evidence', `Reconciling prices: product ${formatINR(p.price)} → cart ${c.text('cart', '#order-total')} → checkout ${c.text('checkout', '#order-total')} → payment ${c.text('payment', '#order-total')}.`, 1500)
  b.finding('a-late-fees')
  b.log('navigator', 'Stopped before paying. No order was placed.', 900)
}

function scriptStoreB(b: ScriptBuilder, c: Ctx) {
  const p = priceFacts('b')
  const fee = STORES.b.upfrontPlatformFee
  const deadline = c.text('product', '#sale-deadline')

  b.step('product', 700)
  b.log('navigator', 'Opened the product page. No modal or interstitial appeared.', 1200)
  b.log('navigator', `Staying on the page for ${c.probe('secondsOnPage')} s, like a shopper reading the details.`, 1000)
  b.capture('product')
  b.log('pattern_analyst', `Urgency signals: "${deadline}", a fixed date and time. Stock reads "${c.text('product', '#stock-note')}", with no scarcity claim.`, 1600)
  b.log('price_historian', `Pulling ${p.weeks} weeks of price history for ${p.name}…`, 1200)
  b.log('price_historian', `Sold at the ${formatINR(p.mrp)} MRP in ${p.weeksAtMrp} of ${p.observations} weekly observations; ${formatINR(p.price)} only since the sale began. The ${p.advertisedDiscount}% discount is genuine. ✓`, 1600)
  b.log('pattern_analyst', `A ${formatINR(fee)} platform fee is disclosed next to the price. I'll check it's the only extra.`, 1300)
  b.log('navigator', 'Reloading the page for a second look.', 1000)
  b.capture('product-reload', 900)
  b.log('pattern_analyst', 'Sale deadline unchanged after the reload. A fixed, real deadline is legitimate urgency. ✓', 1400)

  b.step('variant')
  b.log('navigator', 'Choosing colour: Ocean Blue.', 800)
  b.capture('variant')
  b.log('pattern_analyst', `Price stays ${formatINR(p.price)} on every colour. ✓`, 1200)

  b.step('cart')
  b.log('navigator', 'Added 1 × SonicBuds Pro (Ocean Blue) to the cart. Opening the cart.', 900)
  b.capture('cart')
  b.log('evidence', 'Cart holds exactly what I added: 1 line. ✓', 1300)
  b.log('pattern_analyst', 'Protection plan is offered as an unticked opt-in with neutral wording. ✓', 1300)

  b.step('checkout')
  b.log('navigator', 'Proceeding to checkout with the saved address.', 800)
  b.capture('checkout')
  b.log('pattern_analyst', 'Membership checkbox is unticked; terms in normal type with one-click cancellation. ✓', 1400)
  b.log('pattern_analyst', 'Delivery options are two equal cards, with free standard pre-selected. ✓', 1300)

  b.step('payment')
  b.capture('payment')
  b.log('evidence', `Reconciling prices: product ${formatINR(p.price)} + ${formatINR(fee)} disclosed fee → payment ${c.text('payment', '#order-total')}. No new charges. ✓`, 1500)
  b.log('navigator', 'Stopped before paying. No order was placed.', 900)
}

export function buildMockAudit(storeId: StoreId, auditId: string, origin: string): ScriptedEvent[] {
  const c = new Ctx(storeId, origin)
  const narratives = storeId === 'a' ? storeANarratives(c) : {}
  const allFindings = ANSWER_KEY[storeId].map((expected) => buildFinding(c, expected, narratives[expected.id]))
  const b = new ScriptBuilder(c, allFindings)
  const targetUrl = c.url('product')
  const startedAt = new Date().toISOString()

  b.emit({ type: 'audit.started', auditId, targetUrl, startedAt }, 0)
  b.log('navigator', 'Launching a fresh browser: 1280×800, no cookies, not signed in.', 500)
  if (storeId === 'a') scriptStoreA(b, c)
  else scriptStoreB(b, c)

  const confirmed = b.findings.filter((f) => f.status === 'confirmed')
  const review = b.findings.filter((f) => f.status === 'needs_review')
  b.log(
    'adjudicator',
    confirmed.length + review.length === 0
      ? 'No findings. Every check passed; nothing to escalate.'
      : `${confirmed.length} findings confirmed, ${review.length} sent to human review. Every confirmed finding carries a screenshot and a rule citation.`,
    1200,
  )
  b.log('reporter', 'Building the audit report…', 1100)

  const steps: StepCapture[] = JOURNEY_STEPS.map((step) => {
    const f = c.frame(PRIMARY_FRAME[step])
    return { step, url: c.url(PRIMARY_FRAME[step]), screenshotUrl: f.src }
  })
  const productPrice = priceFacts(storeId).price
  const paymentTotal = c.text('payment', '#order-total')
  const paymentAmount = Number(paymentTotal.replace(/[^\d]/g, ''))
  const stepsHit = new Set(confirmed.map((f) => f.step)).size
  const summary =
    confirmed.length === 0
      ? `No deceptive patterns found. The agent walked all ${steps.length} steps, and urgency, pricing, cart contents, consent and fees all matched what the shopper was shown.`
      : `${confirmed.length} violations confirmed across ${stepsHit} of ${steps.length} journey steps, and ${review.length} claim sent for human review. The amount payable rose from ${formatINR(productPrice)} on the product page to ${paymentTotal} at payment (+${Math.round((paymentAmount / productPrice - 1) * 100)}%).`

  const report: AuditReport = {
    auditId,
    targetUrl,
    startedAt,
    completedAt: startedAt,
    trustScore: trustScore(b.findings),
    steps,
    findings: b.findings,
    summary,
  }
  b.emit({ type: 'audit.completed', report }, 1000)
  return b.events
}
