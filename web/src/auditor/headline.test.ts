import { describe, expect, it } from 'vitest'
import type { AuditEvent } from '../shared/contract'
import { buildHeadline, summariseRisk } from './headline'
import { buildMockAudit } from './mock/scripts'
import { project } from './projection'

function report(storeId: 'a' | 'b') {
  const last = buildMockAudit(storeId, `mock-${storeId}-t`, 'http://localhost').at(-1)!.event as Extract<AuditEvent, { type: 'audit.completed' }>
  return last.report
}

describe('headline', () => {
  it('leads with the count and the overcharge for a rigged store', () => {
    expect(buildHeadline(report('a'))).toEqual({ lead: '8 dark patterns found.', punch: 'Shoppers pay 26% more than the price they saw.' })
  })

  it('reassures for a clean store', () => {
    expect(buildHeadline(report('b'))).toEqual({ lead: 'No dark patterns found.', punch: 'What shoppers see is what they pay.' })
  })

  it('says where a partial audit stopped instead of what shoppers pay', () => {
    const partial = {
      ...report('b'),
      steps: [
        ...report('b').steps.filter((s) => ['product', 'variant', 'cart'].includes(s.step)),
        { step: 'checkout' as const, url: 'https://shop.example/checkout', status: 'blocked' as const, blockedReason: 'Sign-in required' },
      ],
    }
    expect(buildHeadline(partial)).toEqual({
      lead: 'No dark patterns found so far.',
      punch: 'The agent stopped at checkout (sign-in required), so the rest wasn’t checked.',
    })
  })

  it('calls a higher price with no confirmed finding behind it a gap to check, not an overcharge', () => {
    const a = report('a')
    const unconfirmed = { ...a, findings: a.findings.map((f) => ({ ...f, status: 'needs_review' as const })) }
    expect(buildHeadline(unconfirmed).punch).toBe('Shoppers were charged ₹1,894 against ₹1,499 shown: ₹395 for a human to check.')
    const partial = {
      ...unconfirmed,
      steps: [
        ...a.steps.filter((s) => ['product', 'variant', 'cart'].includes(s.step)),
        { step: 'checkout' as const, url: 'https://shop.example/checkout', status: 'blocked' as const, blockedReason: 'Sign-in required' },
      ],
    }
    expect(buildHeadline(partial).punch).toBe('By the cart it was ₹1,894 against ₹1,499 shown: ₹395 for a human to check.')
  })

  it('never reassures about a page it could not check', () => {
    const blocked = {
      ...report('b'),
      steps: [{ step: 'product' as const, url: 'https://shop.example/p/1', status: 'blocked' as const, blockedReason: 'The site showed an empty page (it may be blocking automated browsers)' }],
    }
    expect(buildHeadline(blocked)).toEqual({
      lead: 'Couldn’t check this page.',
      punch: 'The site showed an empty page (it may be blocking automated browsers).',
    })
  })
})

describe('risk summary', () => {
  it('headlines India’s ceiling, the figure Fix it shows, and names the strictest region beside it', () => {
    const a = report('a')
    const r = summariseRisk(a)
    expect(r.focus?.code).toBe('IN')
    expect(r.strictest?.code).toBe('GB')
    expect(r.strictest?.penaltyHeadline).toBe('Up to 10% of global turnover')
    expect(r.perContravention).toEqual({ amount: 1_000_000, currency: 'INR' })
    expect(r.ceiling).toEqual(project(a, new Set()).fineCeiling)
    expect(r.ceiling?.amount).toBe(r.rulesBroken * 1_000_000)
    expect(r.rulesBroken).toBeGreaterThan(0)
    expect(r.regionsBroken).toBe(7)
  })

  it('finds no broken rules for a clean store', () => {
    const r = summariseRisk(report('b'))
    expect(r.focus).toBeUndefined()
    expect(r.regionsBroken).toBe(0)
    expect(r.regionsChecked).toBe(7)
  })
})
