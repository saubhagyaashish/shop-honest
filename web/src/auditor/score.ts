import type { Finding, Severity } from '../shared/contract'

/** Points deducted per confirmed finding. Findings awaiting review cost nothing until a human confirms them. */
export const SEVERITY_PENALTY: Record<Severity, number> = { high: 12, medium: 6, low: 3 }

export function trustScore(findings: Finding[]): number {
  const penalty = findings
    .filter((f) => f.status === 'confirmed')
    .reduce((sum, f) => sum + SEVERITY_PENALTY[f.severity], 0)
  return Math.max(0, 100 - penalty)
}

export type ScoreBand = 'trustworthy' | 'concerns' | 'deceptive'

export function scoreBand(score: number): ScoreBand {
  if (score >= 80) return 'trustworthy'
  if (score >= 50) return 'concerns'
  return 'deceptive'
}

export const BAND_LABEL: Record<ScoreBand, string> = {
  trustworthy: 'Honest journey',
  concerns: 'Some concerns',
  deceptive: 'Deceptive journey',
}

/** The headline sticker on the report. The formal label sits underneath it. */
export const BAND_VIBE: Record<ScoreBand, string> = {
  trustworthy: 'LEGIT ✅',
  concerns: 'KINDA SUS 😬',
  deceptive: 'SUS 🚩',
}

/** Below this adjudicator confidence, a finding goes to a human instead of the report. */
export const REVIEW_THRESHOLD = 0.75
