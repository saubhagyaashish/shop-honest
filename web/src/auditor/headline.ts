import type { AuditReport, JurisdictionExposure } from '../shared/contract'
import { percentUp } from './money'

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

  if (confirmed === 0) {
    const lead = review > 0 ? `No confirmed dark patterns, ${review} claim${review === 1 ? '' : 's'} to check.` : 'No dark patterns found.'
    return { lead, punch: pct > 0 ? `But shoppers pay ${pct}% more than the price they saw.` : 'What shoppers see is what they pay.' }
  }
  const lead = `${confirmed} dark pattern${confirmed === 1 ? '' : 's'} found.`
  return {
    lead,
    punch: pct > 0 ? `Shoppers pay ${pct}% more than the price they saw.` : 'Each one breaks consumer law in at least one region.',
  }
}

export interface RiskSummary {
  /** Regime to headline: the strictest in force, if any rule is broken there. */
  focus?: JurisdictionExposure
  /** How many regions have at least one rule broken by a confirmed finding. */
  regionsBroken: number
  regionsChecked: number
}

export function summariseRisk(report: AuditReport): RiskSummary {
  const exposure = report.exposure
  if (!exposure) return { regionsBroken: 0, regionsChecked: 0 }
  const confirmedIds = report.findings.filter((f) => f.status === 'confirmed').map((f) => f.id)
  const broken = exposure.jurisdictions.filter((j) => confirmedIds.some((id) => j.citations[id]))
  const strictest = broken.find((j) => j.code === exposure.strictest)
  return { focus: strictest ?? broken[0], regionsBroken: broken.length, regionsChecked: exposure.jurisdictions.length }
}
