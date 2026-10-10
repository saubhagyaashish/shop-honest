import { describe, expect, it } from 'vitest'
import type { AuditEvent } from '../../shared/contract'
import { PATTERNS } from '../../shared/patterns'
import { ALL_PRECEDENTS, JURISDICTIONS } from './legal'
import { buildMockAudit } from './scripts'

function run(storeId: 'a' | 'b') {
  const events = buildMockAudit(storeId, `mock-${storeId}-test`, 'http://localhost:5173').map((e) => e.event)
  const last = events[events.length - 1]
  if (last.type !== 'audit.completed') throw new Error('script must end with audit.completed')
  const prices = events.filter((e): e is Extract<AuditEvent, { type: 'price.observed' }> => e.type === 'price.observed')
  return { report: last.report, prices }
}

describe('price drift', () => {
  it('store A: the extra lines explain exactly the gap between shown and payable', () => {
    const drift = run('a').report.exposure!.priceDrift
    const extra = drift.lines.reduce((n, l) => n + l.amount.amount, 0)
    expect(drift.advertised.amount).toBe(1499)
    expect(drift.payable.amount).toBe(1894)
    expect(extra).toBe(drift.payable.amount - drift.advertised.amount)
    expect(drift.claimedSaving?.amount).toBe(2500)
    expect(drift.genuineSaving?.amount).toBe(500)
    expect(drift.savingFindingId).toBe('a-inflated-mrp')
  })

  it('store B: what you see is what you pay', () => {
    const drift = run('b').report.exposure!.priceDrift
    expect(drift.lines).toHaveLength(0)
    expect(drift.payable.amount).toBe(drift.advertised.amount)
    expect(drift.savingFindingId).toBeUndefined()
  })

  it('live price readings only go up and end at the payable total', () => {
    for (const store of ['a', 'b'] as const) {
      const { report, prices } = run(store)
      expect(prices.map((p) => p.step)).toEqual(['product', 'cart', 'checkout', 'payment'])
      const totals = prices.map((p) => p.total.amount)
      expect([...totals].sort((x, y) => x - y)).toEqual(totals)
      expect(totals.at(-1)).toBe(report.exposure!.priceDrift.payable.amount)
    }
  })
})

describe('legal exposure', () => {
  const { report } = run('a')

  it('cites a rule for every finding in every jurisdiction and gives a fix', () => {
    for (const j of report.exposure!.jurisdictions) {
      for (const f of report.findings) {
        expect(j.citations[f.id]?.clause, `${j.code} ${f.id}`).toBeTruthy()
      }
    }
    for (const f of report.findings) expect(f.remediation.length).toBeGreaterThan(20)
  })

  it('covers the 7 agreed jurisdictions', () => {
    expect(JURISDICTIONS.map((j) => j.code)).toEqual(['IN', 'SG', 'GB', 'EU', 'US', 'KR', 'AU'])
  })

  it('backs every precedent with an https source and real pattern ids', () => {
    expect(ALL_PRECEDENTS.length).toBeGreaterThan(0)
    for (const p of ALL_PRECEDENTS) {
      expect(p.sourceUrl, p.id).toMatch(/^https:\/\//)
      expect(p.patternIds.length).toBeGreaterThan(0)
      for (const id of p.patternIds) expect(PATTERNS[id], `${p.id}: ${id}`).toBeDefined()
    }
  })
})
