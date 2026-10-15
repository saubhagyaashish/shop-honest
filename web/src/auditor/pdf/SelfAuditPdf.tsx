import { Document, Page, Text, View } from '@react-pdf/renderer'
import type { AuditReport } from '../../shared/contract'
import { STEP_LABEL } from '../labels'
import { RESULT_LABEL, buildSelfAudit } from '../selfAudit'
import type { CheckResult, PatternRow } from '../selfAudit'
import { Brand, Bullet, Chrome, KeyValue } from './AuditPdf'
import { C, coverageLine, s, safeHost } from './shared'
import { pdfText as t } from './text'

const RESULT_COLOUR: Record<CheckResult, string> = {
  found: C.pink,
  review: C.sun,
  clear: C.lime,
  not_reached: C.white,
  not_assessed: C.cream,
}
const cell = { paddingHorizontal: 5, paddingVertical: 3.5 }
const ORDER: CheckResult[] = ['found', 'review', 'clear', 'not_reached', 'not_assessed']

/** The CCPA self-audit as a document a compliance team can file: scope, the 13 patterns, findings, and a sign-off. */
export function SelfAuditPdf({ report }: { report: AuditReport }) {
  const audit = buildSelfAudit(report)
  const host = safeHost(report.targetUrl)
  const date = new Date(report.completedAt)
  const dateLabel = date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
  const meta = { host, auditId: report.auditId, title: 'CCPA self-audit' }
  const findings = [...audit.ccpa, ...audit.also].flatMap((row) => row.findings.map((f) => ({ row, f })))

  return (
    <Document title={`CCPA self-audit · ${host}`} author="Shop Honest" subject="Dark-pattern self-audit" creator="Shop Honest" producer="Shop Honest">
      <Page size="A4" style={s.page}>
        <Chrome {...meta} />
        <Text style={s.kicker}>Guidelines for Prevention and Regulation of Dark Patterns, 2023</Text>
        <Text style={s.h1}>Dark-pattern self-audit</Text>

        <View style={[s.box, { marginBottom: 10 }]}>
          <KeyValue label="Platform" value={host} compact />
          <KeyValue label="Page audited" value={report.targetUrl} compact />
          <KeyValue label="Date" value={dateLabel} compact />
          <KeyValue label="Session" value="A new browser, logged out, no cookies. Nothing was bought, typed or signed up for." compact />
          <KeyValue label="Journey covered" value={coverageLine(report)} compact />
          <KeyValue
            label="Method"
            value="Measured checks on each screen, then AI judgement (Gemini) of wording and design, with every claim checked against measured evidence before it is reported."
            compact
          />
          <KeyValue label="Audit ID" value={report.auditId} compact />
        </View>

        <View style={[s.row, { flexWrap: 'wrap', marginBottom: 8 }]}>
          {ORDER.filter((r) => audit.counts[r] > 0).map((r) => (
            <Text key={r} style={[s.chip, { backgroundColor: RESULT_COLOUR[r], fontSize: 8.5 }]}>
              {audit.counts[r]} {RESULT_LABEL[r].toLowerCase()}
            </Text>
          ))}
        </View>

        <PatternTable rows={audit.ccpa} />
        {audit.also.length > 0 && (
          <>
            <Text style={[s.h3, { marginTop: 10 }]}>Also checked, under the Consumer Protection Act, 2019</Text>
            <PatternTable rows={audit.also} />
          </>
        )}
      </Page>

      <Page size="A4" style={s.page}>
        <Chrome {...meta} />
        <Text style={s.kicker}>Detail</Text>
        <Text style={s.h1}>{findings.length ? `Findings (${findings.length})` : 'No findings'}</Text>
        {findings.length === 0 && <Text style={s.p}>No dark pattern was found on the steps this audit covered.</Text>}
        {findings.map(({ row, f }) => (
          <View key={f.id} style={{ marginBottom: 10 }} wrap={false}>
            <Text style={s.small}>
              {row.item !== undefined ? `Item ${row.item} · ` : ''}
              {row.pattern.name} · {STEP_LABEL[f.step]} · {f.status === 'confirmed' ? 'Confirmed' : 'For human review'} · confidence {Math.round(f.confidence * 100)}%
            </Text>
            <Text style={{ fontWeight: 700, fontSize: 10.5 }}>{t(f.title)}</Text>
            <Text style={[s.p, { marginBottom: 3 }]}>{t(f.explanation)}</Text>
            {f.evidence.observations.slice(0, 3).map((o, i) => (
              <Bullet key={i} small>
                {t(o)}
              </Bullet>
            ))}
            <Text style={{ fontSize: 9 }}>
              <Text style={{ fontWeight: 700 }}>Fix: </Text>
              {t(f.remediation)}
            </Text>
          </View>
        ))}

        <View style={[s.box, { marginTop: 8 }]} wrap={false}>
          <Text style={[s.h3, { marginTop: 0 }]}>Declaration</Text>
          <Text style={s.p}>
            This self-audit records automated observations of what a logged-out shopper was shown on {dateLabel}. It is not a legal finding. Items marked “for review” need
            a person’s decision; items marked “not reached” or “not assessed” need checks this audit could not make, as noted against each.
          </Text>
          <View style={[s.row, { marginTop: 14, gap: 16 }]}>
            {['Reviewed by (name, role)', 'Date', 'Signature'].map((label) => (
              <View key={label} style={{ flex: 1, borderTopWidth: 1, borderTopColor: C.ink, paddingTop: 3 }}>
                <Text style={s.small}>{label}</Text>
              </View>
            ))}
          </View>
        </View>
        <View style={[s.row, { marginTop: 12, alignItems: 'center' }]}>
          <Brand size={10} />
          <Text style={[s.small, { marginLeft: 8 }]}>Prepared by Shop Honest AI agents. The full audit report has the screenshots behind each finding.</Text>
        </View>
      </Page>
    </Document>
  )
}

function PatternTable({ rows }: { rows: PatternRow[] }) {
  return (
    <View style={s.table}>
      <View style={s.th}>
        <Text style={[cell, { width: 20 }]}>#</Text>
        <Text style={[cell, { width: 112 }]}>Pattern</Text>
        <Text style={[cell, { width: 56 }]}>Checked</Text>
        <Text style={[cell, { width: 66 }]}>Result</Text>
        <Text style={[cell, { flex: 1 }]}>What was checked</Text>
      </View>
      {rows.map((row) => (
        <View key={row.pattern.id} style={[s.tr, { fontSize: 7.8, lineHeight: 1.3 }]} wrap={false}>
          <Text style={[cell, { width: 20, color: C.muted }]}>{row.item ?? '-'}</Text>
          <Text style={[cell, { width: 112, fontWeight: 700 }]}>{row.pattern.name}</Text>
          <Text style={[cell, { width: 56 }]}>{[row.measured && 'Measured', row.judged && 'AI-judged'].filter(Boolean).join('\n') || '-'}</Text>
          <View style={[cell, { width: 66 }]}>
            <Text style={{ fontWeight: 700, fontSize: 7.3, textAlign: 'center', backgroundColor: RESULT_COLOUR[row.result], borderWidth: 1, borderColor: C.ink, borderRadius: 3, paddingVertical: 1 }}>
              {RESULT_LABEL[row.result]}
            </Text>
          </View>
          <Text style={[cell, { flex: 1 }]}>{t(row.note)}</Text>
        </View>
      ))}
    </View>
  )
}
