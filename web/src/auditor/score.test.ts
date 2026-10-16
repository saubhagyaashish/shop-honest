import { describe, expect, it } from 'vitest'
import type { Finding, FindingStatus, JourneyStep, Severity } from '../shared/contract'
import { JOURNEY_STEPS } from '../shared/contract'
import { scoreBand, trustScore, verdictOf } from './score'

function finding(severity: Severity, status: FindingStatus = 'confirmed'): Finding {
  return { severity, status } as Finding
}

describe('trustScore', () => {
  it('is 100 with no findings', () => {
    expect(trustScore([])).toBe(100)
  })

  it('deducts by severity for confirmed findings only', () => {
    expect(trustScore([finding('high'), finding('medium'), finding('low')])).toBe(100 - 12 - 6 - 3)
    expect(trustScore([finding('high', 'needs_review')])).toBe(100)
  })

  it('never goes below zero', () => {
    expect(trustScore(Array.from({ length: 20 }, () => finding('high')))).toBe(0)
  })

  it('bands scores', () => {
    expect(scoreBand(100)).toBe('trustworthy')
    expect(scoreBand(79)).toBe('concerns')
    expect(scoreBand(22)).toBe('deceptive')
  })
})

describe('verdict', () => {
  const step = (s: JourneyStep, status: 'audited' | 'blocked' = 'audited') => ({ step: s, url: 'https://shop.example', status })
  const all = JOURNEY_STEPS.map((s) => step(s))

  it('says honest journey only for a whole journey with nothing found', () => {
    expect(verdictOf({ trustScore: 100, findings: [], steps: all }).vibe).toBe('LEGIT ✅')
  })

  it('never calls a journey honest while claims wait for a human', () => {
    expect(verdictOf({ trustScore: 100, findings: [finding('low', 'needs_review')], steps: all })).toEqual({
      vibe: 'NEEDS A HUMAN 🤔',
      label: 'Claims to review',
      tone: 'sun',
    })
  })

  it('says clean so far when the walk stopped early', () => {
    const partial = [step('product'), step('variant'), step('cart'), step('checkout', 'blocked')]
    expect(verdictOf({ trustScore: 100, findings: [], steps: partial }).label).toBe('Checked 3 of 5 steps')
  })

  it('keeps the band when something was confirmed', () => {
    expect(verdictOf({ trustScore: 16, findings: [finding('high')], steps: all }).vibe).toBe('SUS 🚩')
  })
})
