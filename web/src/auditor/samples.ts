import type { StoreId } from '../store/catalog'

export interface Sample {
  storeId: StoreId
  path: string
  name: string
  badge: string
  description: string
  expectations: string[]
}

export const SAMPLES: Sample[] = [
  {
    storeId: 'a',
    path: '/demo/store-a/p/sonicbuds-pro',
    name: 'BazaarNest · Store A',
    badge: 'RIGGED 🚩',
    description: '8 planted tricks and 1 borderline claim. The agents should catch every trick and hand the borderline one to a human.',
    expectations: ['Resetting timer', 'Frozen stock', 'Inflated MRP', 'Guilt-trip popup', 'Sneaked add-on', 'Pre-ticked membership', 'Lopsided buttons', 'Fees at payment'],
  },
  {
    storeId: 'b',
    path: '/demo/store-b/p/sonicbuds-pro',
    name: 'BazaarNest · Store B',
    badge: 'LEGIT ✓',
    description: 'Same product, same journey, zero tricks. The agents should walk it end to end and report nothing.',
    expectations: ['Fixed sale deadline', 'Genuine discount', 'Fees shown upfront', 'Opt-in add-ons', 'Even choices'],
  },
]

export function sampleForUrl(url: string): Sample | undefined {
  let parsed: URL
  try {
    parsed = new URL(url, window.location.origin)
  } catch {
    return undefined
  }
  if (parsed.origin !== window.location.origin) return undefined
  return SAMPLES.find((s) => parsed.pathname.startsWith(s.path.split('/p/')[0]))
}
