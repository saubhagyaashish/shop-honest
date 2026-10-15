import type { AuditReport, Finding, JurisdictionExposure, Money } from '../shared/contract'
import { JURISDICTIONS } from './mock/legal'
import { trustScore } from './score'
import { buildSelfAudit } from './selfAudit'

/**
 * The report's headline numbers if the given findings were fixed ("Fix it"). A calculation from this audit's own
 * evidence, not a measurement: "Verify these fixes" audits a fixed copy to prove it.
 */
export interface Projection {
  trust: number
  /** What the shopper pays beyond what the product page said, from charges whose finding isn't fixed. */
  hiddenExtras?: Money
  /** Confirmed findings left that break a rule where a fixed penalty per contravention applies (India). */
  rulesBroken: number
  /** The statutory maximum for one contravention (India: ₹10 lakh, the first time). */
  perContravention?: Money
  /** rulesBroken × perContravention: a ceiling, never a prediction. */
  fineCeiling?: Money
  /** CCPA Annexure 1 patterns still found. */
  ccpaFound: number
}

export function project(report: AuditReport, fixed: ReadonlySet<string>): Projection {
  const left = report.findings.filter((f) => !fixed.has(f.id))
  const exposure = report.exposure
  const drift = exposure?.priceDrift
  let hiddenExtras: Money | undefined
  if (drift) {
    const gone = drift.lines.filter((l) => l.findingId && fixed.has(l.findingId)).reduce((sum, l) => sum + l.amount.amount, 0)
    const extra = drift.payable.amount - drift.advertised.amount
    hiddenExtras = { amount: Math.max(0, extra - gone), currency: drift.payable.currency }
  }
  const region = exposure?.jurisdictions.find((j) => perContravention(j))
  const rulesBroken = region ? breaches(left, region.citations) : left.filter((f) => f.status === 'confirmed').length
  const max = region && perContravention(region)
  return {
    trust: trustScore(left),
    hiddenExtras,
    rulesBroken,
    perContravention: max,
    fineCeiling: max ? { amount: rulesBroken * max.amount, currency: max.currency } : undefined,
    ccpaFound: buildSelfAudit({ ...report, findings: left }).counts.found,
  }
}

/** Reports recorded before the figure was in the report get it from the site's own legal data. */
function perContravention(j: JurisdictionExposure): Money | undefined {
  return j.perContraventionMax ?? JURISDICTIONS.find((src) => src.code === j.code)?.perContraventionMax
}

function breaches(findings: Finding[], citations: Record<string, unknown>): number {
  return findings.filter((f) => f.status === 'confirmed' && citations[f.id]).length
}
