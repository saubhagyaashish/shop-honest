// A store's settings, as a merchant changes them in an admin panel: which behaviours are on, the platform fee shown
// from the product page onwards, and each product's listed M.R.P. ShopHonest's Fixer writes changes to these settings;
// the auditor's own browser applies them to a copy of the store through sessionStorage, never through the URL or
// anything on the page. Exported to shared/store_settings.json (npm run knowledge) for the backend.

import { PRODUCTS } from './catalog'
import type { StoreBehaviour, StoreSetup } from './variants'

export type SettingValue = boolean | number
/** Setting key → new value, e.g. { "behaviour.autoAddProtection": false, "mrp.sonicbuds-pro": 1599 }. */
export type SettingsPatch = Record<string, SettingValue>

export interface SettingInfo {
  key: string
  type: 'boolean' | 'number'
  description: string
}

/** Where the auditor's browser leaves a patch for the copy it audits. */
export const PATCH_STORAGE_KEY = 'shophonest:settings'

type Flag = Exclude<keyof StoreBehaviour, 'signInWallAt'>

const FLAGS: Record<Flag, string> = {
  resettingTimer: 'On: the deal countdown restarts from 10:00 on every page load. Off: it counts down to a fixed end time.',
  frozenStock: 'On: "Only 2 left!" is shown whatever happens. Off: the stock shown comes from live inventory.',
  autoAddProtection:
    'On: a ₹199 protection plan is put in the cart along with the product. Off: it is offered in the cart as an unticked option.',
  feesAtPaymentOnly:
    'On: platform, handling and convenience fees (₹97 in all) are first added at the payment step. Off: those fees are not added at payment.',
  guiltDeclinePopup: 'On: an offer popup whose decline link guilt-trips the shopper. Off: no such popup.',
  membershipTickedByDefault:
    'On: the paid BazaarNest Plus membership (₹99/month) is ticked at checkout, its terms in fine print. Off: it starts unticked.',
  lopsidedDeliveryChoice:
    'On: express delivery is a big orange button and standard delivery a tiny grey link. Off: both are shown as equal options.',
  buyersClaim: 'On: shows "120+ bought in the last 24 hours" with no data behind it. Off: no such claim.',
}

export const SETTINGS: SettingInfo[] = [
  ...(Object.entries(FLAGS) as [Flag, string][]).map(([flag, description]) => ({
    key: `behaviour.${flag}`,
    type: 'boolean' as const,
    description,
  })),
  {
    key: 'upfrontPlatformFee',
    type: 'number',
    description: 'A fee (₹) charged on every order and shown from the product page onwards ("+ ₹9 platform fee per order"). 0 shows none.',
  },
  ...PRODUCTS.map((p) => ({
    key: `mrp.${p.slug}`,
    type: 'number' as const,
    description: `The M.R.P. (₹) shown crossed out next to the selling price of ${p.name}.`,
  })),
]

const INFO = new Map(SETTINGS.map((s) => [s.key, s]))

/** This store's current value of every setting. */
export function currentSettings(setup: StoreSetup): SettingsPatch {
  const out: SettingsPatch = {}
  for (const flag of Object.keys(FLAGS) as Flag[]) out[`behaviour.${flag}`] = setup.behaviour[flag]
  out.upfrontPlatformFee = setup.upfrontPlatformFee
  for (const p of PRODUCTS) out[`mrp.${p.slug}`] = setup.mrpOverride?.[p.slug] ?? p.pricing[setup.id].mrp
  return out
}

/** The store with a patch applied. Unknown keys and values of the wrong type are ignored. */
export function applySettings(setup: StoreSetup, patch: SettingsPatch): StoreSetup {
  const behaviour = { ...setup.behaviour }
  const mrpOverride = { ...setup.mrpOverride }
  let upfrontPlatformFee = setup.upfrontPlatformFee
  for (const [key, value] of Object.entries(patch)) {
    const info = INFO.get(key)
    if (!info || typeof value !== info.type) continue
    if (key.startsWith('behaviour.')) behaviour[key.slice('behaviour.'.length) as Flag] = value as boolean
    else if (key === 'upfrontPlatformFee') upfrontPlatformFee = Math.max(0, value as number)
    else if (key.startsWith('mrp.')) mrpOverride[key.slice('mrp.'.length)] = Math.max(0, value as number)
  }
  return { ...setup, behaviour, upfrontPlatformFee, mrpOverride }
}

/** The patch the auditor's browser left for this copy of the store, if any. */
export function readPatch(): SettingsPatch {
  try {
    const parsed: unknown = JSON.parse(sessionStorage.getItem(PATCH_STORAGE_KEY) ?? 'null')
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as SettingsPatch) : {}
  } catch {
    return {}
  }
}
