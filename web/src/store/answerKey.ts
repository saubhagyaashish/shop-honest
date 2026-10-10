// Ground truth for the two demo stores: what a correct audit must report.
// Used to score the agent, to pick evidence bounding boxes in the capture
// script, and by the mock audit. Never rendered into store pages.

import type { FindingStatus, JourneyStep, PatternId } from '../shared/contract'
import type { StoreId } from './catalog'

/** Screens the capture script takes, in journey order. */
export type FrameId = 'product-popup' | 'product' | 'product-reload' | 'variant' | 'cart' | 'checkout' | 'payment'

export const FRAME_STEPS: Record<FrameId, JourneyStep> = {
  'product-popup': 'product',
  product: 'product',
  'product-reload': 'product',
  variant: 'variant',
  cart: 'cart',
  checkout: 'checkout',
  payment: 'payment',
}

export interface ExpectedEvidence {
  frame: FrameId
  selector: string
}

export interface ExpectedFinding {
  id: string
  patternId: PatternId
  step: JourneyStep
  status: FindingStatus
  evidence: ExpectedEvidence[]
}

export const ANSWER_KEY: Record<StoreId, ExpectedFinding[]> = {
  a: [
    {
      id: 'a-guilt-decline',
      patternId: 'confirm_shaming',
      step: 'product',
      status: 'confirmed',
      evidence: [{ frame: 'product-popup', selector: '#offer-modal-decline' }],
    },
    {
      id: 'a-inflated-mrp',
      patternId: 'misleading_price',
      step: 'product',
      status: 'confirmed',
      evidence: [{ frame: 'product', selector: '#price-block' }],
    },
    {
      id: 'a-restarting-timer',
      patternId: 'false_urgency',
      step: 'product',
      status: 'confirmed',
      evidence: [
        { frame: 'product', selector: '#deal-timer' },
        { frame: 'product-reload', selector: '#deal-timer' },
      ],
    },
    {
      id: 'a-frozen-stock',
      patternId: 'false_urgency',
      step: 'product',
      status: 'confirmed',
      evidence: [
        { frame: 'product', selector: '#stock-note' },
        { frame: 'product-reload', selector: '#stock-note' },
      ],
    },
    {
      id: 'a-buyers-claim',
      patternId: 'false_urgency',
      step: 'product',
      status: 'needs_review',
      evidence: [{ frame: 'product', selector: '#buyers-note' }],
    },
    {
      id: 'a-added-protection',
      patternId: 'basket_sneaking',
      step: 'cart',
      status: 'confirmed',
      evidence: [{ frame: 'cart', selector: '#line-protect-1y' }],
    },
    {
      id: 'a-ticked-membership',
      patternId: 'subscription_trap',
      step: 'checkout',
      status: 'confirmed',
      evidence: [{ frame: 'checkout', selector: '#plus-optin' }],
    },
    {
      id: 'a-lopsided-delivery',
      patternId: 'interface_interference',
      step: 'checkout',
      status: 'confirmed',
      evidence: [{ frame: 'checkout', selector: '#delivery-choice' }],
    },
    {
      id: 'a-late-fees',
      patternId: 'drip_pricing',
      step: 'payment',
      status: 'confirmed',
      evidence: [
        { frame: 'product', selector: '#price-block' },
        { frame: 'payment', selector: '#fee-lines' },
      ],
    },
  ],
  b: [],
}

/** Elements worth reading on every frame, so audit narration can quote them. */
export const PROBE_SELECTORS = [
  '#deal-timer',
  '#sale-deadline',
  '#stock-note',
  '#buyers-note',
  '#price-block',
  '#plus-optin',
  '#delivery-choice',
  '#protection-offer',
  '#fee-lines',
  '#order-total',
]
