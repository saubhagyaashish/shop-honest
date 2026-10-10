import type { StoreId } from '../store/catalog'
import type { Tone } from './ui/styles'

export interface Sample {
  /** Data the store uses (prices, answer key). Store C reuses Store A's. */
  storeId: StoreId
  /** Route key under /demo/, unique per store instance. */
  key: string
  path: string
  name: string
  badge: string
  tone: Tone
  description: string
  expectations: string[]
}

export const SAMPLES: Sample[] = [
  {
    storeId: 'a',
    key: 'store-a',
    path: '/demo/store-a/p/sonicbuds-pro',
    name: 'BazaarNest · Store A',
    badge: 'RIGGED 🚩',
    tone: 'pink',
    description: '8 planted tricks and 1 borderline claim. The agents should catch every trick and hand the borderline one to a human.',
    expectations: ['Resetting timer', 'Frozen stock', 'Inflated MRP', 'Guilt-trip popup', 'Sneaked add-on', 'Pre-ticked membership', 'Lopsided buttons', 'Fees at payment'],
  },
  {
    storeId: 'b',
    key: 'store-b',
    path: '/demo/store-b/p/sonicbuds-pro',
    name: 'BazaarNest · Store B',
    badge: 'LEGIT ✓',
    tone: 'lime',
    description: 'Same product, same journey, zero tricks. The agents should walk it end to end and report nothing.',
    expectations: ['Fixed sale deadline', 'Genuine discount', 'Fees shown upfront', 'Opt-in add-ons', 'Even choices'],
  },
  {
    storeId: 'a',
    key: 'store-c',
    path: '/demo/store-c/p/sonicbuds-pro',
    name: 'BazaarNest · Store C',
    badge: 'SIGN-IN WALL 🔒',
    tone: 'sun',
    description: 'Store A’s tricks, but checkout needs an account. Shows how a logged-out audit reports exactly what it could and couldn’t check.',
    expectations: ['Stops at sign-in', 'Partial audit, 3 of 5 steps', 'Tricks before checkout still caught'],
  },
]

export function sampleForKey(key: string): Sample | undefined {
  return SAMPLES.find((s) => s.key === key)
}

export function sampleForUrl(url: string): Sample | undefined {
  let parsed: URL
  try {
    parsed = new URL(url, window.location.origin)
  } catch {
    return undefined
  }
  if (parsed.origin !== window.location.origin) return undefined
  return SAMPLES.find((s) => parsed.pathname.startsWith(s.path.split('/p/')[0] + '/') || parsed.pathname === s.path.split('/p/')[0])
}
