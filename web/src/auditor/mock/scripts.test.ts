import { describe, expect, it } from 'vitest'
import type { AuditEvent, Finding } from '../../shared/contract'
import { JOURNEY_STEPS } from '../../shared/contract'
import { ANSWER_KEY } from '../../store/answerKey'
import { buildMockAudit } from './scripts'

const ORIGIN = 'http://localhost:5173'

function run(storeId: 'a' | 'b') {
  const events = buildMockAudit(storeId, `mock-${storeId}-test`, ORIGIN).map((e) => e.event)
  const findings = events.filter((e): e is Extract<AuditEvent, { type: 'finding' }> => e.type === 'finding').map((e) => e.finding)
  const last = events[events.length - 1]
  if (last.type !== 'audit.completed') throw new Error('script must end with audit.completed')
  return { events, findings, report: last.report }
}

describe('mock audit of store A', () => {
  const { events, findings, report } = run('a')

  it('reports every answer-key entry with the expected pattern and status', () => {
    for (const expected of ANSWER_KEY.a) {
      const f = findings.find((x) => x.id === expected.id)
      expect(f, expected.id).toBeDefined()
      expect(f!.patternId).toBe(expected.patternId)
      expect(f!.status).toBe(expected.status)
      expect(f!.step).toBe(expected.step)
    }
    expect(findings).toHaveLength(ANSWER_KEY.a.length)
  })

  it('backs every finding with a highlighted screenshot and a rule citation', () => {
    for (const f of findings as Finding[]) {
      expect(f.evidence.frames.length, f.id).toBeGreaterThan(0)
      for (const frame of f.evidence.frames) {
        expect(frame.screenshotUrl).toMatch(/^\/mock\/screens\/a\/.+\.jpg$/)
        expect(frame.bbox, f.id).toBeDefined()
      }
      expect(f.rule.clause).not.toBe('')
      expect(f.evidence.observations.length).toBeGreaterThan(0)
    }
  })

  it('walks the five journey steps in order', () => {
    const steps = events.filter((e) => e.type === 'step.started').map((e) => (e as { step: string }).step)
    expect(steps).toEqual(JOURNEY_STEPS)
  })

  it('scores the seeded store as deceptive and keeps the borderline claim out of the score', () => {
    expect(report.findings.filter((f) => f.status === 'confirmed')).toHaveLength(8)
    expect(report.findings.filter((f) => f.status === 'needs_review')).toHaveLength(1)
    expect(report.trustScore).toBeLessThan(50)
  })
})

describe('mock audit of store B', () => {
  const { findings, report } = run('b')

  it('finds nothing in the honest control', () => {
    expect(findings).toHaveLength(0)
    expect(report.trustScore).toBe(100)
    expect(report.steps.map((s) => s.step)).toEqual(JOURNEY_STEPS)
  })
})
