import type { JourneyStep } from '../shared/contract'
import type { StoreId } from './catalog'

/**
 * Which behaviours a store instance has switched on. Store A turns on every
 * seeded behaviour; store B is the honest control with the same product and
 * journey. Nothing here may leak into the rendered DOM or URLs.
 */
export interface StoreBehaviour {
  /** Countdown restarts from 10:00 on every page load. */
  resettingTimer: boolean
  /** "Only 2 left!" no matter what happens. */
  frozenStock: boolean
  /** Protection plan added to the cart alongside the product. */
  autoAddProtection: boolean
  /** Platform/handling/convenience fees first shown on the payment step. */
  feesAtPaymentOnly: boolean
  /** Offer modal whose decline link guilt-trips the shopper. */
  guiltDeclinePopup: boolean
  /** Paid membership checkbox ticked by default, terms in fine print. */
  membershipTickedByDefault: boolean
  /** Express upgrade as a big button; standard as a tiny grey link. */
  lopsidedDeliveryChoice: boolean
  /** "120+ bought in the last 24 hours" with nothing behind it. */
  buyersClaim: boolean
  /** A sign-in wall at this step: a logged-out shopper (or agent) can't get past it. */
  signInWallAt?: JourneyStep
}

export interface StoreSetup {
  id: StoreId
  /** Route segment under /demo/. Deliberately neutral. */
  key: string
  behaviour: StoreBehaviour
  /** Disclosed from the product page onwards. */
  upfrontPlatformFee: number
  /** Only applied when feesAtPaymentOnly is on. */
  paymentStepFees: { label: string; amount: number }[]
}

export const STORES: Record<StoreId, StoreSetup> = {
  a: {
    id: 'a',
    key: 'store-a',
    behaviour: {
      resettingTimer: true,
      frozenStock: true,
      autoAddProtection: true,
      feesAtPaymentOnly: true,
      guiltDeclinePopup: true,
      membershipTickedByDefault: true,
      lopsidedDeliveryChoice: true,
      buyersClaim: true,
    },
    upfrontPlatformFee: 0,
    paymentStepFees: [
      { label: 'Platform fee', amount: 29 },
      { label: 'Handling fee', amount: 49 },
      { label: 'Convenience fee', amount: 19 },
    ],
  },
  b: {
    id: 'b',
    key: 'store-b',
    behaviour: {
      resettingTimer: false,
      frozenStock: false,
      autoAddProtection: false,
      feesAtPaymentOnly: false,
      guiltDeclinePopup: false,
      membershipTickedByDefault: false,
      lopsidedDeliveryChoice: false,
      buyersClaim: false,
    },
    upfrontPlatformFee: 9,
    paymentStepFees: [],
  },
}

/** Store A's data and tricks, but checkout needs an account: the logged-out shopper's view. */
export const STORE_C: StoreSetup = {
  ...STORES.a,
  key: 'store-c',
  behaviour: { ...STORES.a.behaviour, signInWallAt: 'checkout' },
}

/** Every store instance served under /demo/. */
export const ALL_STORES: StoreSetup[] = [STORES.a, STORES.b, STORE_C]

export function storeForKey(key: string | undefined): StoreSetup | undefined {
  return ALL_STORES.find((s) => s.key === key)
}

export function storePath(setup: StoreSetup, path = ''): string {
  return `/demo/${setup.key}${path}`
}
