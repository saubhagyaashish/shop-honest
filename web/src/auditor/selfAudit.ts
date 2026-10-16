import type { AuditReport, Finding, JourneyStep } from '../shared/contract'
import { JOURNEY_STEPS } from '../shared/contract'
import type { PatternInfo } from '../shared/patterns'
import { PATTERNS } from '../shared/patterns'
import { coverageOf } from './coverage'

/** What one audit established about a pattern. */
export type CheckResult = 'found' | 'review' | 'clear' | 'not_reached' | 'not_assessed'

export interface PatternRow {
  pattern: PatternInfo
  /** Item number in Annexure 1 of the CCPA guidelines; absent for patterns outside the 13. */
  item?: number
  result: CheckResult
  /** How this audit checked it. */
  measured: boolean
  judged: boolean
  /** The journey steps where it was checked. */
  steps: JourneyStep[]
  findings: Finding[]
  /** One line on what was checked, or why it wasn't. */
  note: string
}

export interface SelfAudit {
  /** The guidelines' 13 patterns, in Annexure 1 order. */
  ccpa: PatternRow[]
  /** Checked as well, under other law (the inflated MRP). */
  also: PatternRow[]
  /** How many of the 13 ended up with each result. */
  counts: Record<CheckResult, number>
}

/** Where on the journey, as a phrase: "in the cart", "at checkout". */
const AT: Record<JourneyStep, string> = {
  product: 'on the product page',
  variant: 'on variant selection',
  cart: 'in the cart',
  checkout: 'at checkout',
  payment: 'at payment',
}

export const RESULT_LABEL: Record<CheckResult, string> = {
  found: 'Found',
  review: 'For review',
  clear: 'None found',
  not_reached: 'Not reached',
  not_assessed: 'Not assessed',
}

/**
 * The CCPA self-audit: each of the guidelines' 13 dark patterns, and what this audit established about it.
 * A pattern counts as checked only where its check actually ran: measured checks once the journey reached their step,
 * judgement on the steps whose screens a model read (report.reviewedSteps).
 */
export function buildSelfAudit(report: AuditReport): SelfAudit {
  const coverage = coverageOf(report.steps)
  const reached = coverage.audited
  // Reports from before reviewedSteps existed were all judged by a model throughout.
  const reviewed = (report.reviewedSteps ?? reached).filter((s) => reached.includes(s))
  const stopped = coverage.blocked ? `${AT[coverage.blocked.step]} (${coverage.blocked.reason.toLowerCase()})` : undefined
  const hasPriceHistory = report.exposure?.priceDrift.genuineSaving !== undefined

  const row = (pattern: PatternInfo): PatternRow => {
    const check = pattern.check
    const findings = report.findings.filter((f) => f.patternId === pattern.id)
    const needsHistory = pattern.id === 'misleading_price'
    const measuredOn = needsHistory && !hasPriceHistory && !findings.length ? [] : (check.measured ?? []).filter((s) => reached.includes(s))
    const judgedOn = check.judged ? reviewed : []
    const steps = JOURNEY_STEPS.filter((s) => measuredOn.includes(s) || judgedOn.includes(s) || findings.some((f) => f.step === s))
    const base = { pattern, item: annexureItem(pattern), measured: measuredOn.length > 0, judged: judgedOn.length > 0, steps, findings }

    const confirmed = findings.filter((f) => f.status === 'confirmed')
    if (confirmed.length || findings.length) {
      const result: CheckResult = confirmed.length ? 'found' : 'review'
      const n = confirmed.length || findings.length
      const where = list(JOURNEY_STEPS.filter((s) => findings.some((f) => f.step === s)).map((s) => AT[s]))
      const what = confirmed.length ? 'confirmed' : 'sent for human review'
      return { ...base, result, note: `${n} finding${n === 1 ? '' : 's'} ${what} ${where}.` }
    }
    if (steps.length) {
      return { ...base, result: 'clear', note: [how(measuredOn, judgedOn, reached), check.limits].filter(Boolean).join(' ') }
    }
    if (check.measured?.length && !(needsHistory && !hasPriceHistory)) {
      const at = list(check.measured.map((s) => AT[s]))
      const note = check.judged && reached.length
        ? `Measured ${at}, which the journey didn't reach, and no screen was judged by AI.`
        : `Measured ${at}; the journey stopped ${stopped ?? 'before it'}.`
      return { ...base, result: 'not_reached', note }
    }
    if (check.judged) {
      return { ...base, result: 'not_assessed', note: "Needs a model's judgement, and no screen was judged in this audit." }
    }
    return { ...base, result: 'not_assessed', note: check.limits ?? 'Not checked by an automated audit.' }
  }

  const all = Object.values(PATTERNS).map(row)
  const ccpa = all.filter((r) => r.item !== undefined).sort((a, b) => a.item! - b.item!)
  const counts: Record<CheckResult, number> = { found: 0, review: 0, clear: 0, not_reached: 0, not_assessed: 0 }
  for (const r of ccpa) counts[r.result] += 1
  return { ccpa, also: all.filter((r) => r.item === undefined), counts }
}

function annexureItem(pattern: PatternInfo): number | undefined {
  if (!pattern.rule.source.startsWith('CCPA')) return undefined
  const m = /item (\d+)/.exec(pattern.rule.clause)
  return m ? Number(m[1]) : undefined
}

function how(measuredOn: JourneyStep[], judgedOn: JourneyStep[], reached: JourneyStep[]): string {
  const measured = measuredOn.length ? `Measured ${list(measuredOn.map((s) => AT[s]))}` : ''
  const everywhere = judgedOn.length > 1 && judgedOn.length === reached.length
  const judged = !judgedOn.length ? '' : everywhere ? `judged by AI on all ${judgedOn.length} steps` : `judged by AI ${list(judgedOn.map((s) => AT[s]))}`
  if (measured && judged) return `${measured}; ${judged}.`
  return `${(measured || judged).replace(/^j/, 'J')}.`
}

function list(items: string[]): string {
  if (items.length <= 1) return items.join('')
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`
}
