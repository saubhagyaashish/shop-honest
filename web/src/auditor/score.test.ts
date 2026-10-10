import { describe, expect, it } from 'vitest'
import type { Finding, FindingStatus, Severity } from '../shared/contract'
import { scoreBand, trustScore } from './score'

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
