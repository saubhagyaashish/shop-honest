import { describe, expect, it } from 'vitest'
import type { AuditEvent, AuditReport } from '../shared/contract'
import { buildMockAudit } from './mock/scripts'
import { project } from './projection'

function report(storeId: 'a' | 'b'): AuditReport {
  const events = buildMockAudit(storeId, `mock-${storeId}-t`, 'http://localhost').map((e) => e.event)
  return (events[events.length - 1] as Extract<AuditEvent, { type: 'audit.completed' }>).report
}

describe('projected numbers as fixes are switched on', () => {
  const a = report('a')

  it('starts at the report itself', () => {
    const now = project(a, new Set())
    expect(now.trust).toBe(a.trustScore)
    expect(now.hiddenExtras).toEqual({ amount: 395, currency: 'INR' })
    // 8 confirmed findings, each a contravention of the CCPA guidelines: up to ₹10 lakh each, the first time.
    expect(now.rulesBroken).toBe(8)
    expect(now.fineCeiling).toEqual({ amount: 8_000_000, currency: 'INR' })
    expect(now.ccpaFound).toBeGreaterThan(0)
  })

  it('drops each charge with the finding that explains it', () => {
    expect(project(a, new Set(['a-added-protection'])).hiddenExtras?.amount).toBe(196)
    // The late fees are three charges, one finding.
    expect(project(a, new Set(['a-late-fees'])).hiddenExtras?.amount).toBe(298)
  })

  it('reaches a clean report when every finding is fixed', () => {
    const all = project(a, new Set(a.findings.map((f) => f.id)))
    expect(all).toEqual({
      trust: 100,
      hiddenExtras: { amount: 0, currency: 'INR' },
      rulesBroken: 0,
      perContravention: { amount: 1_000_000, currency: 'INR' },
      fineCeiling: { amount: 0, currency: 'INR' },
      ccpaFound: 0,
    })
  })

  it('counts a finding awaiting review as no contravention, so fixing it moves only what it shows', () => {
    const review = a.findings.find((f) => f.status === 'needs_review')!
    const fixed = project(a, new Set([review.id]))
    expect(fixed.trust).toBe(a.trustScore)
    expect(fixed.rulesBroken).toBe(8)
  })

  it('has nothing to project on an honest store', () => {
    const b = project(report('b'), new Set())
    expect(b.trust).toBe(100)
    expect(b.rulesBroken).toBe(0)
  })
})
