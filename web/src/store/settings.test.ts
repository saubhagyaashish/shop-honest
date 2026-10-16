import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { findProduct } from './catalog'
import { applySettings, currentSettings, PATCH_STORAGE_KEY, readPatch, SETTINGS } from './settings'
import { pricingOf, STORES } from './variants'

/** The tests run in Node: a minimal sessionStorage. */
function memoryStorage(): Storage {
  const items = new Map<string, string>()
  return {
    get length() {
      return items.size
    },
    clear: () => items.clear(),
    getItem: (k) => items.get(k) ?? null,
    key: (i) => [...items.keys()][i] ?? null,
    removeItem: (k) => void items.delete(k),
    setItem: (k, v) => void items.set(k, String(v)),
  }
}

describe('store settings', () => {
  beforeEach(() => vi.stubGlobal('sessionStorage', memoryStorage()))
  afterEach(() => vi.unstubAllGlobals())

  it('lists every dark-pattern behaviour, the upfront fee and each product MRP, with current values', () => {
    const keys = SETTINGS.map((s) => s.key)
    expect(keys).toContain('behaviour.autoAddProtection')
    expect(keys).not.toContain('behaviour.signInWallAt')
    expect(currentSettings(STORES.a)).toMatchObject({ 'behaviour.autoAddProtection': true, upfrontPlatformFee: 0, 'mrp.sonicbuds-pro': 3999 })
    expect(currentSettings(STORES.b)).toMatchObject({ 'behaviour.autoAddProtection': false, upfrontPlatformFee: 9, 'mrp.sonicbuds-pro': 1999 })
  })

  it('applies a patch: behaviours, the upfront fee and an MRP', () => {
    const fixed = applySettings(STORES.a, { 'behaviour.autoAddProtection': false, upfrontPlatformFee: 97, 'mrp.sonicbuds-pro': 1599 })
    expect(fixed.behaviour.autoAddProtection).toBe(false)
    expect(fixed.behaviour.resettingTimer).toBe(true) // untouched
    expect(fixed.upfrontPlatformFee).toBe(97)
    expect(pricingOf(findProduct('sonicbuds-pro')!, fixed)).toEqual({ price: 1499, mrp: 1599 })
    expect(STORES.a.behaviour.autoAddProtection).toBe(true) // the original store is unchanged
  })

  it('ignores unknown settings and values of the wrong type', () => {
    const fixed = applySettings(STORES.a, { 'behaviour.signInWallAt': false, 'behaviour.frozenStock': 0, upfrontPlatformFee: true, nonsense: 1 })
    expect(fixed.behaviour).toEqual(STORES.a.behaviour)
    expect(fixed.upfrontPlatformFee).toBe(0)
  })

  it('reads the patch the auditor left in sessionStorage, and nothing else', () => {
    expect(readPatch()).toEqual({})
    sessionStorage.setItem(PATCH_STORAGE_KEY, JSON.stringify({ 'behaviour.buyersClaim': false }))
    expect(readPatch()).toEqual({ 'behaviour.buyersClaim': false })
    sessionStorage.setItem(PATCH_STORAGE_KEY, 'not json')
    expect(readPatch()).toEqual({})
  })
})
