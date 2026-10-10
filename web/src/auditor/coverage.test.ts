import { describe, expect, it } from 'vitest'
import type { AuditEvent } from '../shared/contract'
import { coverageOf } from './coverage'
import { buildHeadline } from './headline'
import { buildMockAudit } from './mock/scripts'
import type { MockOptions } from './mock/scripts'

function run(storeId: 'a' | 'b', options?: MockOptions) {
  const events = buildMockAudit(storeId, `mock-${storeId}-t`, 'http://localhost', options).map((e) => e.event)
  const last = events[events.length - 1] as Extract<AuditEvent, { type: 'audit.completed' }>
  return { events, report: last.report }
}

describe('coverage', () => {
  it('reports a full walk as complete', () => {
    const c = coverageOf(run('a').report.steps)
    expect(c).toMatchObject({ total: 5, complete: true, notReached: [] })
    expect(c.audited).toHaveLength(5)
    expect(c.blocked).toBeUndefined()
  })

  it('stops at a sign-in wall and only counts what was seen before it', () => {
    const { events, report } = run('a', { blockAt: 'checkout' })
    const c = coverageOf(report.steps)
    expect(c).toMatchObject({ complete: false, audited: ['product', 'variant', 'cart'], blocked: { step: 'checkout', reason: 'Sign-in required' }, notReached: ['payment'] })

    // Nothing from checkout or payment can be reported.
    expect(report.findings.every((f) => ['product', 'variant', 'cart'].includes(f.step))).toBe(true)
    expect(report.findings.map((f) => f.patternId)).not.toContain('drip_pricing')
    expect(report.exposure!.priceDrift.payable.amount).toBe(1698)
    expect(report.exposure!.priceDrift.lines.map((l) => l.firstSeen)).toEqual(['cart'])
    expect(report.summary).toContain('Checkout and Payment could not be audited')

    // The live stream says so, and never shows a later step.
    const types = events.map((e) => e.type)
    expect(types).toContain('step.blocked')
    expect(events.some((e) => e.type === 'step.started' && e.step === 'payment')).toBe(false)
  })

  it('keeps the headline honest about a partial walk', () => {
    const { report } = run('a', { blockAt: 'checkout' })
    expect(buildHeadline(report).punch).toBe('Shoppers pay 13% more than the price they saw.')
  })
})

describe('store C (sign-in wall at checkout)', () => {
  it('stops at checkout and uses its own URLs', async () => {
    const { buildMockAuditForStore } = await import('./mock/scripts')
    const { STORE_C } = await import('../store/variants')
    const events = buildMockAuditForStore(STORE_C, 'mock-store-c-t', 'http://localhost').map((e) => e.event)
    const report = (events.at(-1) as Extract<AuditEvent, { type: 'audit.completed' }>).report
    expect(coverageOf(report.steps)).toMatchObject({ complete: false, blocked: { step: 'checkout' }, notReached: ['payment'] })
    expect(report.targetUrl).toBe('http://localhost/demo/store-c/p/sonicbuds-pro')
    expect(JSON.stringify(events)).not.toContain('/demo/store-a/')
  })
})
