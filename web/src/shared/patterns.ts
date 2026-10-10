import type { PatternId, RuleCitation, Severity } from './contract'

export interface PatternInfo {
  id: PatternId
  name: string
  /** One line a compliance manager can read at a glance. */
  description: string
  rule: RuleCitation
  defaultSeverity: Severity
}

const CCPA = 'CCPA Guidelines for Prevention and Regulation of Dark Patterns, 2023'

function ccpa(item: number): RuleCitation {
  return { source: CCPA, clause: `Annexure 1, item ${item}` }
}

// Order and numbering follow Annexure 1 of the notified guidelines (30 Nov 2023).
export const PATTERNS: Record<PatternId, PatternInfo> = {
  false_urgency: {
    id: 'false_urgency',
    name: 'False urgency',
    description: 'Falsely stating or implying urgency or scarcity to rush a purchase.',
    rule: ccpa(1),
    defaultSeverity: 'high',
  },
  basket_sneaking: {
    id: 'basket_sneaking',
    name: 'Basket sneaking',
    description: 'Adding products, services or charges to the cart without the user’s consent.',
    rule: ccpa(2),
    defaultSeverity: 'high',
  },
  confirm_shaming: {
    id: 'confirm_shaming',
    name: 'Confirm shaming',
    description: 'Using guilt, fear or ridicule to steer the user towards a choice.',
    rule: ccpa(3),
    defaultSeverity: 'medium',
  },
  forced_action: {
    id: 'forced_action',
    name: 'Forced action',
    description: 'Forcing an unrelated action (sign-up, app download, purchase) to continue.',
    rule: ccpa(4),
    defaultSeverity: 'medium',
  },
  subscription_trap: {
    id: 'subscription_trap',
    name: 'Subscription trap',
    description: 'Enrolling users in recurring payments by default or making exit hard.',
    rule: ccpa(5),
    defaultSeverity: 'high',
  },
  interface_interference: {
    id: 'interface_interference',
    name: 'Interface interference',
    description: 'Visual design that highlights one option and obscures the alternative.',
    rule: ccpa(6),
    defaultSeverity: 'medium',
  },
  bait_and_switch: {
    id: 'bait_and_switch',
    name: 'Bait and switch',
    description: 'Advertising one outcome and delivering another, usually costlier.',
    rule: ccpa(7),
    defaultSeverity: 'high',
  },
  drip_pricing: {
    id: 'drip_pricing',
    name: 'Drip pricing',
    description: 'Revealing charges only late in the journey instead of upfront.',
    rule: ccpa(8),
    defaultSeverity: 'high',
  },
  disguised_advertisement: {
    id: 'disguised_advertisement',
    name: 'Disguised advertisement',
    description: 'Paid placements presented as editorial or organic content.',
    rule: ccpa(9),
    defaultSeverity: 'medium',
  },
  nagging: {
    id: 'nagging',
    name: 'Nagging',
    description: 'Repeated requests or interruptions unrelated to the purchase.',
    rule: ccpa(10),
    defaultSeverity: 'low',
  },
  trick_question: {
    id: 'trick_question',
    name: 'Trick question',
    description: 'Confusing or double-negative wording that misleads the user’s choice.',
    rule: ccpa(11),
    defaultSeverity: 'medium',
  },
  saas_billing: {
    id: 'saas_billing',
    name: 'SaaS billing',
    description: 'Recurring charges collected silently, e.g. after a free trial.',
    rule: ccpa(12),
    defaultSeverity: 'high',
  },
  rogue_malware: {
    id: 'rogue_malware',
    name: 'Rogue malware',
    description: 'Software that misleads users into paying or installing malware.',
    rule: ccpa(13),
    defaultSeverity: 'high',
  },
  misleading_price: {
    id: 'misleading_price',
    name: 'Inflated reference price',
    description: 'A discount calculated off an MRP that was never the real selling price.',
    rule: {
      source: 'Consumer Protection Act, 2019',
      clause: 'Sec. 2(28) misleading advertisement; Sec. 2(47) unfair trade practice',
    },
    defaultSeverity: 'high',
  },
}
