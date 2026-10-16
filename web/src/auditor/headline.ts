import type { AuditReport, JurisdictionExposure, Money } from '../shared/contract'
import { coverageOf } from './coverage'
import { STEP_LABEL } from './labels'
import { formatMoney, percentUp } from './money'
import { project } from './projection'

export interface Headline {
  /** Short statement of what was found. */
  lead: string
  /** The consequence, in shopper terms. */
  punch: string
}

/** The one sentence a judge should take away, built from the report data. */
export function buildHeadline(report: AuditReport): Headline {
  const confirmed = report.findings.filter((f) => f.status === 'confirmed').length
  const review = report.findings.length - confirmed
  const drift = report.exposure?.priceDrift
  const pct = drift ? percentUp(drift.advertised.amount, drift.payable.amount) : 0
  const coverage = coverageOf(report.steps)

  if (!coverage.audited.length) {
    const reason = coverage.blocked?.reason ?? 'The agent reached no step of the journey'
    return { lead: 'Couldn’t check this page.', punch: /[.!?]$/.test(reason) ? reason : `${reason}.` }
  }

  if (confirmed === 0) {
    const none = coverage.complete ? 'No dark patterns found.' : 'No dark patterns found so far.'
    const lead = review > 0 ? `No confirmed dark patterns, ${review} claim${review === 1 ? '' : 's'} to check.` : none
    // A price that went up with no confirmed finding behind it is a gap to check, not an overcharge.
    if (drift && pct > 0) {
      const gap = formatMoney({ amount: drift.payable.amount - drift.advertised.amount, currency: drift.payable.currency })
      const last = coverage.audited[coverage.audited.length - 1]
      const when = coverage.complete || !last ? 'Shoppers were charged' : `By the ${STEP_LABEL[last].toLowerCase()} it was`
      return { lead, punch: `${when} ${formatMoney(drift.payable)} against ${formatMoney(drift.advertised)} shown: ${gap} for a human to check.` }
    }
    // Only a whole journey can say what shoppers pay.
    const stop = coverage.blocked
    if (stop) {
      const where = STEP_LABEL[stop.step].toLowerCase()
      return { lead, punch: `The agent stopped at ${where} (${stop.reason.toLowerCase()}), so the rest wasn’t checked.` }
    }
    return { lead, punch: 'What shoppers see is what they pay.' }
  }
  const lead = `${confirmed} dark pattern${confirmed === 1 ? '' : 's'} found.`
  return {
    lead,
    punch: pct > 0 ? `Shoppers pay ${pct}% more than the price they saw.` : 'Each one breaks consumer law in at least one region.',
  }
}

export interface RiskSummary {
  /** Regime to headline: India (the CCPA) if any rule is broken there, else the strictest region with one broken. */
  focus?: JurisdictionExposure
  /** The strictest region with a rule broken, when it isn't the focus. */
  strictest?: JurisdictionExposure
  /** India's ceiling: rules broken × the maximum per contravention (the same figure as in Fix it). */
  ceiling?: Money
  perContravention?: Money
  /** Rules broken under the focus regime's per-contravention penalty. */
  rulesBroken: number
  /** How many regions have at least one rule broken by a confirmed finding. */
  regionsBroken: number
  regionsChecked: number
}

export function summariseRisk(report: AuditReport): RiskSummary {
  const exposure = report.exposure
  if (!exposure) return { rulesBroken: 0, regionsBroken: 0, regionsChecked: 0 }
  const confirmedIds = report.findings.filter((f) => f.status === 'confirmed').map((f) => f.id)
  const broken = exposure.jurisdictions.filter((j) => confirmedIds.some((id) => j.citations[id]))
  const strictest = broken.find((j) => j.code === exposure.strictest)
  const india = broken.find((j) => j.code === 'IN')
  const focus = india ?? strictest ?? broken[0]
  const { fineCeiling, rulesBroken, perContravention } = project(report, new Set())
  return {
    focus,
    strictest: strictest && strictest !== focus ? strictest : undefined,
    ceiling: india && fineCeiling && fineCeiling.amount > 0 ? fineCeiling : undefined,
    perContravention: india ? perContravention : undefined,
    rulesBroken: india ? rulesBroken : 0,
    regionsBroken: broken.length,
    regionsChecked: exposure.jurisdictions.length,
  }
}
