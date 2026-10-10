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
  rule: RuleCitation
  detectedBy: AgentName
  evidence: Evidence
}

export interface StepCapture {
  step: JourneyStep
  url: string
  screenshotUrl: string
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
}

export type AuditEvent =
  | { type: 'audit.started'; auditId: string; targetUrl: string; startedAt: string }
  | { type: 'step.started'; step: JourneyStep; url: string }
  | { type: 'step.captured'; step: JourneyStep; url: string; screenshotUrl: string }
  | { type: 'agent.log'; agent: AgentName; message: string }
  | { type: 'finding'; finding: Finding }
  | { type: 'audit.completed'; report: AuditReport }
  | { type: 'audit.failed'; error: string }
