// The contract between the auditor UI and the agent backend.
// The mock source and the future SSE source both emit exactly these shapes,
// so the Python/ADK side must serialise to the same JSON.

export type PatternId =
  | 'false_urgency'
  | 'basket_sneaking'
  | 'confirm_shaming'
  | 'forced_action'
  | 'subscription_trap'
  | 'interface_interference'
  | 'bait_and_switch'
  | 'drip_pricing'
  | 'disguised_advertisement'
  | 'nagging'
  | 'trick_question'
  | 'saas_billing'
  | 'rogue_malware'
  // Not one of the 13 CCPA dark patterns: covered by the Consumer Protection Act.
  | 'misleading_price'

export type JourneyStep = 'product' | 'variant' | 'cart' | 'checkout' | 'payment'

export const JOURNEY_STEPS: readonly JourneyStep[] = ['product', 'variant', 'cart', 'checkout', 'payment']

export type AgentName =
  | 'navigator'
  | 'pattern_analyst'
  | 'evidence'
  | 'price_historian'
  | 'seller_trust'
  | 'adjudicator'
  | 'reporter'
  | 'fixer'

export type Severity = 'high' | 'medium' | 'low'

/** Adjudicator outcome: asserted in the report, or sent to a human. */
export type FindingStatus = 'confirmed' | 'needs_review'

/** Bounding box as fractions (0–1) of the screenshot's width and height. */
export interface BBox {
  x: number
  y: number
  w: number
  h: number
}

export interface EvidenceFrame {
  screenshotUrl: string
  caption: string
  bbox?: BBox
}

export interface Evidence {
  /** More than one frame when the proof is a comparison, e.g. before/after reload. */
  frames: EvidenceFrame[]
  elementText?: string
  /** Concrete measurements the agent made, e.g. "Timer read 09:55, then 10:00 after reload". */
  observations: string[]
}

export interface RuleCitation {
  source: string
  clause: string
  /** False when only the instrument, not the exact clause, has been checked. */
  verified?: boolean
}

export type JurisdictionCode = 'IN' | 'SG' | 'GB' | 'EU' | 'US' | 'KR' | 'AU'

export type CurrencyCode = 'INR' | 'SGD' | 'GBP' | 'EUR' | 'USD' | 'KRW' | 'AUD'

export interface Money {
  amount: number
  currency: CurrencyCode
}

/** A charge the shopper ends up paying that the product page did not show. */
export interface PriceDriftLine {
  label: string
  amount: Money
  kind: 'sneaked_item' | 'subscription' | 'fee' | 'upgrade'
  /** Step on which the shopper could first see this charge. */
  firstSeen: JourneyStep
  recurring?: 'monthly' | 'yearly'
  /** The finding that explains this charge, if any. */
  findingId?: string
}

/** What the shopper was told to expect versus what they are asked to pay. Measured by the agents. */
export interface PriceDrift {
  /** Total the product page led the shopper to expect, including any fees disclosed there. */
  advertised: Money
  /** Total on the payment step. */
  payable: Money
  lines: PriceDriftLine[]
  /** Saving the store claims, e.g. MRP minus price. */
  claimedSaving?: Money
  /** Saving against the genuine prior price. */
  genuineSaving?: Money
  /** Finding that disputes the claimed saving. */
  savingFindingId?: string
}

/** A real enforcement outcome for a similar practice. */
export interface Precedent {
  id: string
  jurisdiction: JurisdictionCode
  company: string
  regulator: string
  /** ISO date or year-month. */
  date: string
  outcome: string
  amount?: Money
  patternIds: PatternId[]
  summary: string
  sourceUrl: string
  /** 'official' = regulator or legislation; 'reported' = press or law-firm commentary. */
  confidence: 'official' | 'reported'
}

export interface JurisdictionExposure {
  code: JurisdictionCode
  name: string
  law: string
  regulator: string
  status: 'in_force' | 'coming'
  maxPenalty: string
  /** One short line for at-a-glance cards, e.g. "Up to 10% of global turnover". */
  penaltyHeadline: string
  /** The statutory maximum for one contravention, where the law fixes an amount (India: ₹10 lakh, the first time). */
  perContraventionMax?: Money
  /** New law already passed but not yet in force. */
  upcoming?: { law: string; effectiveFrom: string; summary: string }
  /** Rule each finding breaches here, keyed by finding id. */
  citations: Record<string, RuleCitation>
  precedents: Precedent[]
}

export interface Exposure {
  priceDrift: PriceDrift
  jurisdictions: JurisdictionExposure[]
  /** Strictest regime currently in force, used for the headline risk. */
  strictest?: JurisdictionCode
  disclaimer: string
}

export interface Finding {
  id: string
  patternId: PatternId
  title: string
  /** The agent's reasoning in plain language. */
  explanation: string
  severity: Severity
  /** 0–1, as scored by the adjudicator. */
  confidence: number
  status: FindingStatus
  step: JourneyStep
  pageUrl: string
  /** Primary citation (India). Other jurisdictions are in AuditReport.exposure. */
  rule: RuleCitation
  detectedBy: AgentName
  evidence: Evidence
  /** What the business should change. */
  remediation: string
}

export type StepStatus = 'audited' | 'blocked'

export interface StepCapture {
  step: JourneyStep
  url: string
  /** For a blocked step, a screenshot of what stopped the agent (e.g. the sign-in wall), if any. */
  screenshotUrl?: string
  /** Defaults to 'audited'. Steps after a blocked one are simply absent. */
  status?: StepStatus
  /** Why the agent could not go further, e.g. "Sign-in required". */
  blockedReason?: string
}

/** A change the Fixer made to the store's settings, to fix one finding. */
export interface FixChange {
  findingId: string
  /** The setting, e.g. "behaviour.autoAddProtection". */
  setting: string
  from: string
  to: string
  /** Why this removes the dark pattern, in one sentence. */
  why: string
}

export type FixOutcome = 'resolved' | 'still_present'

/** A finding of the earlier audit, and whether the later one still found it. */
export interface FixResult {
  findingId: string
  title: string
  patternId: PatternId
  step: JourneyStep
  outcome: FixOutcome
}

export interface FindingRef {
  title: string
  patternId: PatternId
  step: JourneyStep
}

/** The same journey audited again: was each earlier finding still there? */
export interface Verification {
  trustBefore: number
  trustAfter: number
  payableBefore?: Money
  payableAfter?: Money
  results: FixResult[]
  /** Found the second time but not the first. */
  newFindings: FindingRef[]
}

/**
 * How a finding can be fixed: `setting` by changing the store's own settings (stores whose settings we control),
 * `code` only by the site's developers, `review` a human's call first (the finding awaits review).
 */
export type FixKind = 'setting' | 'code' | 'review'

/** The Fixer's proposal for one finding. */
export interface FixItem {
  findingId: string
  title: string
  patternId: PatternId
  step: JourneyStep
  status: FindingStatus
  kind: FixKind
  /** Settings changes that fix it; empty unless the store's settings can. */
  changes: FixChange[]
  /** What to change, in words, for the site's developers. */
  suggestion: string
}

/** Response of POST /api/audits/{auditId}/fixes: a fix proposed for each finding of a finished audit. */
export interface FixProposal {
  auditId: string
  items: FixItem[]
  /** The changes can be applied to a copy of this store and verified by re-auditing it (demo stores). */
  canVerify: boolean
}

/** This audit against an earlier one of the same page ("Re-audit this page", or verifying fixes). */
export interface Comparison extends Verification {
  previousAuditId: string
  previousCompletedAt: string
}

export interface AuditReport {
  auditId: string
  targetUrl: string
  startedAt: string
  completedAt: string
  /** 0–100, see auditor/score.ts. */
  trustScore: number
  steps: StepCapture[]
  findings: Finding[]
  summary: string
  /** Money and law. Optional so older backends still render. */
  exposure?: Exposure
  /**
   * Steps whose screens a model judged; patterns that need judgement were checked only there.
   * Empty for a measured-only audit. Absent in reports from before 15 Oct 2026, which a model judged throughout.
   */
  reviewedSteps?: JourneyStep[]
  /** Set when this audit checked a copy of the store with these fixes applied ("Verify these fixes"). */
  appliedFixes?: FixChange[]
  /** Set when this audit re-checked an earlier one of the same page. */
  comparison?: Comparison
}

/** A tool an agent called; its log line says what the tool found. */
export interface AgentTool {
  name: string
  /** The arguments, written out, e.g. "e4, e5". */
  input: string
}

export type AuditEvent =
  | { type: 'audit.started'; auditId: string; targetUrl: string; startedAt: string }
  | { type: 'step.started'; step: JourneyStep; url: string }
  | { type: 'step.captured'; step: JourneyStep; url: string; screenshotUrl: string }
  /** The agent could not continue at this step, e.g. a sign-in wall. No later steps follow. */
  | { type: 'step.blocked'; step: JourneyStep; url: string; reason: string; screenshotUrl?: string }
  | { type: 'agent.log'; agent: AgentName; message: string; tool?: AgentTool }
  /** Running total the shopper would pay at this point of the journey. */
  | { type: 'price.observed'; step: JourneyStep; label: string; total: Money }
  | { type: 'finding'; finding: Finding }
  | { type: 'audit.completed'; report: AuditReport }
  | { type: 'audit.failed'; error: string }
