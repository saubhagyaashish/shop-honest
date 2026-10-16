import { StyleSheet } from '@react-pdf/renderer'
import type { AuditReport } from '../../shared/contract'
import { coverageOf } from '../coverage'
import { STEP_LABEL } from '../labels'
import { BODY_FONT, DISPLAY_FONT } from './fonts'

/** Colours and styles shared by the audit report and the CCPA self-audit PDFs. */
export const C = {
  ink: '#111111',
  muted: '#5f5a52',
  faint: '#8c867b',
  line: '#e4ddd0',
  cream: '#fff8ec',
  lime: '#c6f432',
  pink: '#ff5ca8',
  sun: '#ffd23f',
  red: '#d6336c',
  white: '#ffffff',
}

export const s = StyleSheet.create({
  page: { fontFamily: BODY_FONT, fontSize: 9.5, color: C.ink, paddingTop: 60, paddingBottom: 52, paddingHorizontal: 44, lineHeight: 1.45 },
  cover: { fontFamily: BODY_FONT, fontSize: 10, color: C.ink, padding: 0 },
  header: { position: 'absolute', top: 22, left: 44, right: 44, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: C.line, paddingBottom: 8 },
  headerRight: { fontSize: 8, color: C.muted },
  // Anchored from the top: react-pdf places a fixed element's `bottom` thousands of points off the page. All pages are A4 (841.9 pt).
  footer: { position: 'absolute', top: 800, left: 44, right: 44, flexDirection: 'row', justifyContent: 'space-between', fontSize: 7.5, color: C.faint, borderTopWidth: 1, borderTopColor: C.line, paddingTop: 6 },
  kicker: { fontSize: 8, fontWeight: 700, color: C.muted, letterSpacing: 1, textTransform: 'uppercase' },
  h1: { fontFamily: DISPLAY_FONT, fontWeight: 800, fontSize: 20, lineHeight: 1.18, marginTop: 2, marginBottom: 8 },
  h2: { fontFamily: DISPLAY_FONT, fontWeight: 800, fontSize: 14, lineHeight: 1.2, marginTop: 14, marginBottom: 6 },
  h3: { fontWeight: 700, fontSize: 10.5, marginTop: 8, marginBottom: 3 },
  p: { marginBottom: 6 },
  muted: { color: C.muted },
  small: { fontSize: 8, color: C.muted },
  box: { borderWidth: 1.2, borderColor: C.ink, borderRadius: 6, padding: 10 },
  row: { flexDirection: 'row' },
  chip: { fontSize: 7.5, fontWeight: 700, borderWidth: 1, borderColor: C.ink, borderRadius: 4, paddingHorizontal: 4, paddingVertical: 1.5, marginRight: 4, marginBottom: 4 },
  bullet: { flexDirection: 'row', marginBottom: 3 },
  bulletDot: { width: 10 },
  table: { borderWidth: 1, borderColor: C.ink, borderRadius: 4 },
  th: { flexDirection: 'row', backgroundColor: C.ink, color: C.white, fontWeight: 700, fontSize: 8 },
  tr: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: C.line, fontSize: 8.5 },
  td: { padding: 5 },
  ruleRow: { flexDirection: 'row', fontSize: 7.8, lineHeight: 1.3 },
  ruleTd: { paddingHorizontal: 5, paddingVertical: 2.5 },
  link: { color: C.ink, textDecoration: 'underline' },
})

/** How much of the journey the audit covered, in one line. */
export function coverageLine(report: AuditReport): string {
  const coverage = coverageOf(report.steps)
  return coverage.complete
    ? `Full journey, ${coverage.total} of ${coverage.total} steps (${coverage.audited.map((st) => STEP_LABEL[st]).join(' › ')})`
    : `Partial: ${coverage.audited.length} of ${coverage.total} steps (${coverage.audited.map((st) => STEP_LABEL[st]).join(' › ') || 'none'}). Stopped at ${coverage.blocked ? `${STEP_LABEL[coverage.blocked.step]}: ${coverage.blocked.reason}` : 'an unreachable step'}.`
}

export function safeHost(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return url
  }
}
