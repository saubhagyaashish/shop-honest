import { describe, expect, it } from 'vitest'
import type { AuditEvent, AuditReport, PatternId } from '../shared/contract'
import { buildMockAudit } from './mock/scripts'
import type { MockOptions } from './mock/scripts'
import { buildSelfAudit } from './selfAudit'
import type { CheckResult } from './selfAudit'

function report(storeId: 'a' | 'b', options?: MockOptions): AuditReport {
  const events = buildMockAudit(storeId, `mock-${storeId}-t`, 'http://localhost', options).map((e) => e.event)
  return (events[events.length - 1] as Extract<AuditEvent, { type: 'audit.completed' }>).report
}

function results(r: AuditReport): Partial<Record<PatternId, CheckResult>> {
  const audit = buildSelfAudit(r)
  return Object.fromEntries([...audit.ccpa, ...audit.also].map((row) => [row.pattern.id, row.result]))
}

describe('CCPA self-audit', () => {
  it('lists the 13 patterns in the order of Annexure 1, with the MRP check apart', () => {
    const audit = buildSelfAudit(report('a'))
    expect(audit.ccpa.map((r) => r.item)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13])
    expect(audit.also.map((r) => r.pattern.id)).toEqual(['misleading_price'])
    expect(Object.values(audit.counts).reduce((a, b) => a + b)).toBe(13)
  })

  it('marks what Store A was caught doing, and what an automated audit cannot check', () => {
    const r = results(report('a'))
    expect(r).toMatchObject({
      false_urgency: 'found',
      basket_sneaking: 'found',
      confirm_shaming: 'found',
      subscription_trap: 'found',
      interface_interference: 'found',
      drip_pricing: 'found',
      misleading_price: 'found',
      forced_action: 'clear',
      nagging: 'clear',
      bait_and_switch: 'not_assessed',
      saas_billing: 'not_assessed',
      rogue_malware: 'not_assessed',
    })
  })

  it('finds nothing on the honest store but still says what it checked', () => {
    const audit = buildSelfAudit(report('b'))
    expect(audit.counts).toMatchObject({ found: 0, review: 0, clear: 10, not_assessed: 3 })
    const sneaking = audit.ccpa.find((row) => row.pattern.id === 'basket_sneaking')!
    expect(sneaking).toMatchObject({ measured: true, judged: false, steps: ['cart'], note: 'Measured in the cart.' })
    const urgency = audit.ccpa.find((row) => row.pattern.id === 'false_urgency')!
    expect(urgency.note).toBe('Measured on the product page; judged by AI on all 5 steps.')
    const nagging = buildSelfAudit({ ...report('b'), reviewedSteps: ['cart', 'checkout'] }).ccpa.find((row) => row.pattern.id === 'nagging')!
    expect(nagging.note).toBe('Judged by AI in the cart and at checkout.')
  })

  it('does not claim steps past a sign-in wall', () => {
    const audit = buildSelfAudit(report('b', { blockAt: 'checkout' }))
    const drip = audit.ccpa.find((row) => row.pattern.id === 'drip_pricing')!
    expect(drip.result).toBe('not_reached')
    expect(drip.note).toBe('Measured at payment; the journey stopped at checkout (sign-in required).')
    expect(results(report('b', { blockAt: 'checkout' }))).toMatchObject({ subscription_trap: 'not_reached', basket_sneaking: 'clear' })
  })

  it('leaves judgement patterns unassessed when no model judged a screen', () => {
    const r = results({ ...report('b'), reviewedSteps: [] })
    expect(r).toMatchObject({ confirm_shaming: 'not_assessed', trick_question: 'not_assessed', false_urgency: 'clear', drip_pricing: 'clear' })
  })

  it('needs price history before it calls the MRP clean', () => {
    const r = report('b')
    expect(results(r).misleading_price).toBe('clear')
    const withoutHistory = { ...r, exposure: { ...r.exposure!, priceDrift: { ...r.exposure!.priceDrift, genuineSaving: undefined } } }
    expect(results(withoutHistory).misleading_price).toBe('not_assessed')
  })
})
