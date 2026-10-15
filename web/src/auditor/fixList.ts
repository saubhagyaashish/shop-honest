import type { AuditReport, FixItem } from '../shared/contract'
import { PATTERNS } from '../shared/patterns'
import { STEP_LABEL } from './labels'

/** Plain text for the site's developers: every fix, or only the planned ones. */
export function fixList(report: AuditReport, items: FixItem[], planned: ReadonlySet<string>): string {
  const chosen = planned.size ? items.filter((i) => planned.has(i.findingId)) : items
  const lines = [`Fixes for ${report.targetUrl}`, `ShopHonest audit ${report.auditId}, ${report.completedAt.slice(0, 10)}`, '']
  chosen.forEach((item, n) => {
    lines.push(`${n + 1}. ${item.title} (${PATTERNS[item.patternId].name}, ${STEP_LABEL[item.step]})`)
    if (item.changes.length) for (const c of item.changes) lines.push(`   Set ${c.setting}: ${c.from} → ${c.to}. ${c.why}`)
    else lines.push(`   ${item.suggestion}`)
    if (item.kind === 'review') lines.push('   (Awaiting human review: may not break a rule.)')
  })
  return lines.join('\n')
}
