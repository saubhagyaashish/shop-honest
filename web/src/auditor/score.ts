import type { AuditReport, Finding, Severity } from '../shared/contract'
import { coverageOf } from './coverage'

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

export interface Verdict {
  /** The sticker ("LEGIT ✅"). */
  vibe: string
  /** The formal label under it ("Honest journey"). */
  label: string
  tone: 'lime' | 'sun' | 'pink' | 'white'
}

const BAND_TONE: Record<ScoreBand, Verdict['tone']> = { trustworthy: 'lime', concerns: 'sun', deceptive: 'pink' }

/**
 * The verdict under the score. It never says more than the audit saw: a high score with claims still waiting for
 * review, or with steps the agent couldn't reach, isn't an "Honest journey".
 */
export function verdictOf(report: Pick<AuditReport, 'trustScore' | 'findings' | 'steps'>): Verdict {
  const band = scoreBand(report.trustScore)
  if (band === 'trustworthy' && !report.findings.some((f) => f.status === 'confirmed')) {
    if (report.findings.length) return { vibe: 'NEEDS A HUMAN 🤔', label: 'Claims to review', tone: 'sun' }
    const coverage = coverageOf(report.steps)
    if (!coverage.complete) return { vibe: 'CLEAN SO FAR 👀', label: `Checked ${coverage.audited.length} of ${coverage.total} steps`, tone: 'white' }
  }
  return { vibe: BAND_VIBE[band], label: BAND_LABEL[band], tone: BAND_TONE[band] }
}

/** Below this adjudicator confidence, a finding goes to a human instead of the report. */
export const REVIEW_THRESHOLD = 0.75
