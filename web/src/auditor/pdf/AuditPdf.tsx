import { Circle, Document, Image, Link, Page, Path, Rect, Svg, Text, View } from '@react-pdf/renderer'
import type { ReactNode } from 'react'
import type { AuditReport, Finding, JurisdictionCode, JurisdictionExposure, Severity } from '../../shared/contract'
import { PATTERNS } from '../../shared/patterns'
import { AGENTS } from '../agents'
import { JOURNEY_STEPS } from '../../shared/contract'
import { STEP_LABEL } from '../labels'
import { formatMoney, percentUp } from '../money'
import { nothingChecked } from '../coverage'
import { buildHeadline } from '../headline'
import { verdictOf } from '../score'
import type { Decision } from '../components/Report'
import type { LogEntry } from '../useAudit'
import { DISPLAY_FONT, registerPdfFonts } from './fonts'
import { C, coverageLine, s, safeHost } from './shared'
import { pdfText as t } from './text'

registerPdfFonts()

const SEVERITY_ORDER: Severity[] = ['high', 'medium', 'low']
const SEVERITY_COLOUR: Record<Severity, string> = { high: C.pink, medium: C.sun, low: C.line }
const VERDICT_COLOUR = { pink: C.pink, sun: C.sun, lime: C.lime, white: C.white }

export interface AuditPdfProps {
  report: AuditReport
  logs: LogEntry[]
  jurisdiction: JurisdictionCode
  decisions: Record<string, Decision>
  origin: string
}

export function AuditPdf({ report, logs, jurisdiction, decisions, origin }: AuditPdfProps) {
  const exposure = report.exposure
  const focus = exposure?.jurisdictions.find((j) => j.code === jurisdiction) ?? exposure?.jurisdictions[0]
  const confirmed = report.findings
    .filter((f) => f.status === 'confirmed')
    .sort((a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity) || b.confidence - a.confidence)
  const review = report.findings.filter((f) => f.status === 'needs_review')
  const ordered = [...confirmed, ...review]
  const host = safeHost(report.targetUrl)
  const date = new Date(report.completedAt)
  const dateLabel = date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
  const abs = (src: string) => new URL(src, origin).href
  const meta = { host, auditId: report.auditId }
  const headline = buildHeadline(report)
  const coverageText = coverageLine(report)
  // Blocked on the first page: no score and no verdict.
  const unchecked = nothingChecked(report.steps)
  const verdict = verdictOf(report)

  return (
    <Document title={`Shop Honest audit · ${host}`} author="Shop Honest" subject="Dark-pattern audit report" creator="Shop Honest" producer="Shop Honest">
      {/* 1. Cover */}
      <Page size="A4" style={s.cover}>
        <View style={{ backgroundColor: C.lime, borderBottomWidth: 2, borderBottomColor: C.ink, paddingHorizontal: 44, paddingTop: 40, paddingBottom: 28 }}>
          <Brand size={30} />
          <Text style={{ fontFamily: DISPLAY_FONT, fontWeight: 800, fontSize: 32, marginTop: 34, lineHeight: 1.05 }}>Dark-Pattern Audit Report</Text>
          <Text style={{ fontSize: 11, marginTop: 8 }}>{t(report.targetUrl)}</Text>
        </View>
        <View style={{ paddingHorizontal: 44, paddingTop: 26 }}>
          <View style={[s.row, { gap: 18 }]}>
            <View style={[s.box, { width: 170, alignItems: 'center', paddingVertical: 16 }]}>
              <Text style={s.kicker}>Trust score</Text>
              <Text style={{ fontFamily: DISPLAY_FONT, fontWeight: 800, fontSize: 46, lineHeight: 1.1 }}>{unchecked ? '–' : report.trustScore}</Text>
              <Text style={s.small}>{unchecked ? 'not rated' : 'out of 100'}</Text>
              <Text style={{ marginTop: 8, fontWeight: 700, fontSize: 9, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4, borderWidth: 1, borderColor: C.ink, backgroundColor: unchecked ? C.white : VERDICT_COLOUR[verdict.tone] }}>
                {unchecked ? 'Nothing could be checked' : verdict.label}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <KeyValue label="Audit ID" value={report.auditId} />
              <KeyValue label="Completed" value={`${dateLabel}, ${date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`} />
              <KeyValue label="Coverage" value={coverageText} />
              {focus && <KeyValue label="Jurisdiction focus" value={`${focus.name} (${focus.code})`} />}
            </View>
          </View>

          <View style={[s.row, { gap: 10, marginTop: 18 }]}>
            <Metric label="Confirmed violations" value={String(confirmed.length)} colour={confirmed.length ? C.pink : C.lime} />
            <Metric label="Sent for human review" value={String(review.length)} colour={review.length ? C.sun : C.white} />
            {exposure &&
              (confirmed.length === 0 && exposure.priceDrift.lines.length ? (
                <Metric label="Price gap to check" value={driftLabel(report)} colour={C.sun} />
              ) : (
                <Metric label="Extra paid per order" value={driftLabel(report)} colour={exposure.priceDrift.lines.length ? C.pink : C.lime} />
              ))}
          </View>

          <Text style={{ fontFamily: DISPLAY_FONT, fontWeight: 800, fontSize: 17, lineHeight: 1.25, marginTop: 20 }}>
            {t(headline.lead)} <Text style={{ backgroundColor: confirmed.length ? C.pink : report.findings.length ? C.sun : C.lime }}>{t(headline.punch)}</Text>
          </Text>
          <Text style={[s.h3, { marginTop: 14 }]}>Summary</Text>
          <Text style={s.p}>{t(report.summary)}</Text>
          {focus && confirmed.length > 0 && (
            <Text style={s.p}>
              <Text style={{ fontWeight: 700 }}>Maximum exposure ({focus.name}): </Text>
              {t(focus.maxPenalty)}
            </Text>
          )}
        </View>
        <View style={{ position: 'absolute', bottom: 28, left: 44, right: 44, borderTopWidth: 1, borderTopColor: C.line, paddingTop: 8 }}>
          <Text style={s.small}>
            Prepared by Shop Honest AI agents on {dateLabel}. Confidential. This report supports a compliance review and is not legal advice.
          </Text>
        </View>
      </Page>

      {/* 2. Executive summary + overview */}
      <Page size="A4" style={s.page}>
        <Chrome {...meta} />
        <Text style={s.kicker}>Executive summary</Text>
        <Text style={s.h1}>What we found</Text>
        <Text style={s.p}>{t(report.summary)}</Text>

        {exposure && (
          <>
            <Text style={s.h2}>What shoppers actually pay</Text>
            <View style={[s.row, { gap: 10 }]}>
              <Metric label="Shown on product page" value={formatMoney(exposure.priceDrift.advertised)} colour={C.white} />
              <Metric label="Asked to pay" value={formatMoney(exposure.priceDrift.payable)} colour={C.white} />
              <Metric label="Difference" value={driftLabel(report)} colour={exposure.priceDrift.lines.length ? C.pink : C.lime} />
            </View>
          </>
        )}

        {focus && (
          <>
            <Text style={s.h2}>Legal exposure: {focus.name}</Text>
            <KeyValue label="Law" value={focus.law} />
            <KeyValue label="Regulator" value={focus.regulator} />
            <KeyValue label="Maximum penalty" value={focus.maxPenalty} />
            {focus.upcoming && <KeyValue label="Coming" value={`${focus.upcoming.law} from ${fmtDate(focus.upcoming.effectiveFrom)}`} />}
          </>
        )}

        {confirmed.length > 0 && (
          <>
            <Text style={s.h2}>Priority fixes</Text>
            {confirmed.slice(0, 3).map((f, i) => (
              <View key={f.id} style={[s.bullet, { marginBottom: 5 }]}>
                <Text style={{ width: 14, fontWeight: 700 }}>{i + 1}.</Text>
                <Text style={{ flex: 1 }}>
                  <Text style={{ fontWeight: 700 }}>{t(f.title)}. </Text>
                  {t(f.remediation)}
                </Text>
              </View>
            ))}
          </>
        )}

        <Text style={s.h2} break={false}>
          Findings overview
        </Text>
        {unchecked ? (
          <View style={s.box}>
            <Text style={{ fontFamily: DISPLAY_FONT, fontWeight: 800, fontSize: 14 }}>Nothing could be checked.</Text>
            <Text>The agent stopped on the first page (see Coverage), so this report makes no finding either way.</Text>
          </View>
        ) : ordered.length === 0 ? (
          <View style={[s.box, { backgroundColor: C.lime }]}>
            <Text style={{ fontFamily: DISPLAY_FONT, fontWeight: 800, fontSize: 14 }}>No dark patterns found.</Text>
            <Text>Every urgency claim, price, cart line, consent box and fee matched what the shopper was shown.</Text>
          </View>
        ) : (
          <View style={s.table}>
            <View style={s.th}>
              <Text style={[s.td, { width: 22 }]}>#</Text>
              <Text style={[s.td, { flex: 1 }]}>Finding</Text>
              <Text style={[s.td, { width: 92 }]}>Pattern</Text>
              <Text style={[s.td, { width: 62 }]}>Step</Text>
              <Text style={[s.td, { width: 48 }]}>Severity</Text>
              <Text style={[s.td, { width: 38 }]}>Conf.</Text>
              <Text style={[s.td, { width: 62 }]}>Status</Text>
            </View>
            {ordered.map((f, i) => (
              <View key={f.id} style={[s.tr, { backgroundColor: i % 2 ? C.cream : C.white }]} wrap={false}>
                <Text style={[s.td, { width: 22, fontWeight: 700 }]}>{i + 1}</Text>
                <Text style={[s.td, { flex: 1 }]}>{t(f.title)}</Text>
                <Text style={[s.td, { width: 92 }]}>{PATTERNS[f.patternId].name}</Text>
                <Text style={[s.td, { width: 62 }]}>{STEP_LABEL[f.step]}</Text>
                <Text style={[s.td, { width: 48, textTransform: 'capitalize' }]}>{f.severity}</Text>
                <Text style={[s.td, { width: 38 }]}>{f.confidence.toFixed(2)}</Text>
                <Text style={[s.td, { width: 62 }]}>{statusLabel(f, decisions)}</Text>
              </View>
            ))}
          </View>
        )}
      </Page>

      {/* 3. One page per finding */}
      {ordered.map((f, i) => (
        <Page key={f.id} size="A4" style={s.page}>
          <Chrome {...meta} />
          <Text style={s.kicker}>
            Finding {i + 1} of {ordered.length} · {f.status === 'confirmed' ? 'Confirmed' : 'Human review'}
          </Text>
          <Text style={s.h1}>{t(f.title)}</Text>
          <View style={[s.row, { flexWrap: 'wrap', marginBottom: 6 }]}>
            <Text style={[s.chip, { backgroundColor: SEVERITY_COLOUR[f.severity], textTransform: 'uppercase' }]}>{f.severity}</Text>
            <Text style={s.chip}>{PATTERNS[f.patternId].name}</Text>
            <Text style={s.chip}>Step: {STEP_LABEL[f.step]}</Text>
            <Text style={s.chip}>Confidence {f.confidence.toFixed(2)}</Text>
            <Text style={s.chip}>Found by {AGENTS[f.detectedBy].label}</Text>
            {f.status === 'needs_review' && <Text style={[s.chip, { backgroundColor: C.sun }]}>{statusLabel(f, decisions)}</Text>}
          </View>
          <Text style={s.p}>{t(f.explanation)}</Text>

          <Text style={s.h3}>Observations</Text>
          {f.evidence.observations.map((o) => (
            <Bullet key={o}>{t(o)}</Bullet>
          ))}

          <Text style={s.h3}>Evidence</Text>
          <View style={[s.row, { gap: 10, justifyContent: 'center' }]} wrap={false}>
            {f.evidence.frames.map((fr, k) => (
              <View key={k} style={{ width: f.evidence.frames.length > 1 ? '49%' : '62%' }}>
                <View style={{ position: 'relative', borderWidth: 1, borderColor: C.ink }}>
                  <Image src={abs(fr.screenshotUrl)} style={{ width: '100%' }} />
                  {fr.bbox && (
                    <View
                      style={{
                        position: 'absolute',
                        left: `${fr.bbox.x * 100}%`,
                        top: `${fr.bbox.y * 100}%`,
                        width: `${fr.bbox.w * 100}%`,
                        height: `${fr.bbox.h * 100}%`,
                        borderWidth: 2,
                        borderColor: C.red,
                        borderRadius: 2,
                      }}
                    />
                  )}
                </View>
                <Text style={[s.small, { marginTop: 3 }]}>
                  {f.evidence.frames.length > 1 ? `${k + 1}. ` : ''}
                  {t(fr.caption)}
                </Text>
              </View>
            ))}
          </View>

          <View style={[s.box, { backgroundColor: '#eef9cf', marginTop: 8, paddingVertical: 6 }]} wrap={false}>
            <Text style={{ fontWeight: 700, marginBottom: 2 }}>Recommended fix</Text>
            <Text>{t(f.remediation)}</Text>
          </View>

          {exposure && (
            <View wrap={false}>
              <Text style={s.h3}>Rules engaged</Text>
              <View style={s.table}>
                {exposure.jurisdictions.map((j, k) => {
                  const c = j.citations[f.id]
                  return (
                    <View key={j.code} style={[s.ruleRow, k > 0 ? { borderTopWidth: 1, borderTopColor: C.line } : {}, { backgroundColor: j.code === focus?.code ? C.cream : C.white }]}>
                      <Text style={[s.ruleTd, { width: 26, fontWeight: 700 }]}>{j.code}</Text>
                      <Text style={[s.ruleTd, { flex: 1 }]}>
                        {t(c?.source)}, {t(c?.clause)}
                        {c?.verified === false ? ' *' : ''}
                      </Text>
                    </View>
                  )
                })}
              </View>
              {exposure.jurisdictions.some((j) => j.citations[f.id]?.verified === false) && (
                <Text style={[s.small, { marginTop: 3 }]}>* Instrument confirmed; exact clause to be confirmed against the official text.</Text>
              )}
            </View>
          )}

          {exposure && precedentsFor(exposure.jurisdictions, f).length > 0 && (
            <View wrap={false}>
              <Text style={s.h3}>Enforcement precedents for this practice</Text>
              {precedentsFor(exposure.jurisdictions, f).map((p) => (
                <Bullet key={p.id} small>
                  <Text style={{ fontWeight: 700 }}>
                    {t(p.company)} ({p.jurisdiction}, {p.regulator}, {p.date.slice(0, 7)}):{' '}
                  </Text>
                  {t(p.outcome)}.{' '}
                  <Link src={p.sourceUrl} style={s.link}>
                    {p.confidence === 'official' ? 'Official source' : 'Press report'}
                  </Link>
                </Bullet>
              ))}
            </View>
          )}
        </Page>
      ))}

      {/* 4. Money and law annex */}
      {exposure && (
        <Page size="A4" style={s.page}>
          <Chrome {...meta} />
          <Text style={s.kicker}>Annex A</Text>
          <Text style={s.h1}>Price drift</Text>
          <Text style={s.p}>
            The product page led the shopper to expect {formatMoney(exposure.priceDrift.advertised)}. The payment step asked for {formatMoney(exposure.priceDrift.payable)}.
          </Text>
          {exposure.priceDrift.lines.length > 0 ? (
            <View style={s.table}>
              <View style={s.th}>
                <Text style={[s.td, { flex: 1 }]}>Charge</Text>
                <Text style={[s.td, { width: 80 }]}>First shown</Text>
                <Text style={[s.td, { width: 70 }]}>Recurring</Text>
                <Text style={[s.td, { width: 70, textAlign: 'right' }]}>Amount</Text>
              </View>
              {exposure.priceDrift.lines.map((l, i) => (
                <View key={l.label} style={[s.tr, { backgroundColor: i % 2 ? C.cream : C.white }]}>
                  <Text style={[s.td, { flex: 1 }]}>{t(l.label)}</Text>
                  <Text style={[s.td, { width: 80 }]}>{STEP_LABEL[l.firstSeen]}</Text>
                  <Text style={[s.td, { width: 70 }]}>{l.recurring ? l.recurring[0].toUpperCase() + l.recurring.slice(1) : 'No'}</Text>
                  <Text style={[s.td, { width: 70, textAlign: 'right' }]}>+{formatMoney(l.amount)}</Text>
                </View>
              ))}
              <View style={[s.tr, { fontWeight: 700 }]}>
                <Text style={[s.td, { flex: 1 }]}>Total added after the product page</Text>
                <Text style={[s.td, { width: 70, textAlign: 'right' }]}>
                  +{formatMoney({ amount: exposure.priceDrift.payable.amount - exposure.priceDrift.advertised.amount, currency: exposure.priceDrift.payable.currency })}
                </Text>
              </View>
            </View>
          ) : (
            <Text style={s.p}>No charges were added after the product page.</Text>
          )}
          {exposure.priceDrift.claimedSaving && exposure.priceDrift.genuineSaving && (
            <Text style={[s.p, { marginTop: 8 }]}>
              The store claimed a saving of {formatMoney(exposure.priceDrift.claimedSaving)}. Against the genuine prior price the saving is{' '}
              {formatMoney(exposure.priceDrift.genuineSaving)}.
            </Text>
          )}

          <Text style={[s.kicker, { marginTop: 18 }]}>Annex B</Text>
          <Text style={s.h1}>Legal exposure by jurisdiction</Text>
          {exposure.jurisdictions.map((j) => (
            <View key={j.code} style={[s.box, { marginBottom: 8, backgroundColor: j.code === focus?.code ? C.cream : C.white }]} wrap={false}>
              <Text style={{ fontFamily: DISPLAY_FONT, fontWeight: 800, fontSize: 11 }}>
                {j.name} ({j.code})
              </Text>
              <KeyValue label="Law" value={j.law} compact />
              <KeyValue label="Regulator" value={j.regulator} compact />
              <KeyValue label="Maximum penalty" value={j.maxPenalty} compact />
              {j.upcoming && <KeyValue label="Coming" value={`${j.upcoming.law} from ${fmtDate(j.upcoming.effectiveFrom)}. ${j.upcoming.summary}`} compact />}
              {j.precedents.map((p) => (
                <Bullet key={p.id}>
                  <Text style={{ fontWeight: 700 }}>{t(p.company)}: </Text>
                  {t(p.outcome)} ({p.regulator}, {p.date.slice(0, 7)}).{' '}
                  <Link src={p.sourceUrl} style={s.link}>
                    {p.confidence === 'official' ? 'Official source' : 'Press report'}
                  </Link>
                </Bullet>
              ))}
            </View>
          ))}
          <Text style={s.small}>{t(exposure.disclaimer)}</Text>
        </Page>
      )}

      {/* 5. Method and audit trail */}
      <Page size="A4" style={s.page}>
        <Chrome {...meta} />
        <Text style={s.kicker}>Annex C</Text>
        <Text style={s.h1}>Method and audit trail</Text>
        <Text style={s.p}>
          A fresh browser session walked the journey the way a shopper would. Specialist agents captured each screen, judged it against the rulebook, checked prices and history, and an adjudicator sent findings below the confidence
          threshold to a human instead of asserting them.
        </Text>
        <Text style={s.h3}>Coverage</Text>
        <Text style={s.p}>{coverageText}</Text>
        <View style={s.table}>
          {JOURNEY_STEPS.map((stepId, i) => {
            const st = report.steps.find((c) => c.step === stepId)
            const status = !st ? 'Not reached' : st.status === 'blocked' ? `Not audited: ${st.blockedReason ?? 'blocked'}` : 'Audited'
            return (
              <View key={stepId} style={i === 0 ? s.row : s.tr}>
                <Text style={[s.td, { width: 100, fontWeight: 700 }]}>
                  {i + 1}. {STEP_LABEL[stepId]}
                </Text>
                <Text style={[s.td, { width: 120, fontWeight: st && st.status !== 'blocked' ? 400 : 700 }]}>{status}</Text>
                <Text style={[s.td, { flex: 1 }]}>{st?.url ?? '-'}</Text>
              </View>
            )
          })}
        </View>
        <Text style={s.h3}>Agent log</Text>
        {logs.map((l) => (
          <View key={l.id} style={[s.row, { marginBottom: 3 }]} wrap={false}>
            <Text style={{ width: 34, fontSize: 7.5, color: C.faint }}>{offset(l.at - (logs[0]?.at ?? l.at))}</Text>
            <Text style={{ width: 82, fontSize: 8, fontWeight: 700 }}>{AGENTS[l.agent].label}</Text>
            <Text style={{ flex: 1, fontSize: 8 }}>{t(l.message)}</Text>
          </View>
        ))}
      </Page>
    </Document>
  )
}

export function Chrome({ host, auditId, title = 'Dark-pattern audit' }: { host: string; auditId: string; title?: string }) {
  return (
    <>
      <View style={s.header} fixed>
        <Brand size={13} />
        <Text style={s.headerRight}>
          {title} · {host}
        </Text>
      </View>
      <View style={s.footer} fixed>
        <Text>Audit {auditId} · Confidential · Not legal advice</Text>
        <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
      </View>
    </>
  )
}

export function Brand({ size }: { size: number }) {
  return (
    <View style={[s.row, { alignItems: 'center' }]}>
      <Svg viewBox="0 0 48 48" style={{ width: size * 1.35, height: size * 1.35 }}>
        <Rect x="2" y="2" width="44" height="44" rx="12" fill={C.lime} stroke={C.ink} strokeWidth={3} />
        <Path d="M18.5 18v-3a5.5 5.5 0 0 1 11 0v3" fill="none" stroke={C.ink} strokeWidth={2.8} />
        <Path d="M12.5 18h23l-1.6 19.2a2 2 0 0 1-2 1.8H16.1a2 2 0 0 1-2-1.8L12.5 18Z" fill={C.white} stroke={C.ink} strokeWidth={2.8} />
        <Circle cx="22.5" cy="28" r="5.6" fill={C.pink} stroke={C.ink} strokeWidth={2.6} />
        <Path d="m26.6 32.1 4.4 4.4" stroke={C.ink} strokeWidth={3.2} />
      </Svg>
      <Text style={{ fontFamily: DISPLAY_FONT, fontWeight: 800, fontSize: size, marginLeft: size * 0.35 }}>shop honest</Text>
    </View>
  )
}

function Metric({ label, value, colour }: { label: string; value: string; colour: string }) {
  return (
    <View style={[s.box, { flex: 1, backgroundColor: colour }]}>
      <Text style={s.kicker}>{label}</Text>
      <Text style={{ fontFamily: DISPLAY_FONT, fontWeight: 800, fontSize: 18, lineHeight: 1.2, marginTop: 2 }}>{value}</Text>
    </View>
  )
}

export function KeyValue({ label, value, compact = false }: { label: string; value: string; compact?: boolean }) {
  return (
    <View style={[s.row, { marginBottom: compact ? 2 : 4 }]}>
      <Text style={{ width: compact ? 90 : 110, fontWeight: 700, fontSize: compact ? 8.5 : 9.5 }}>{label}</Text>
      <Text style={{ flex: 1, fontSize: compact ? 8.5 : 9.5 }}>{t(value)}</Text>
    </View>
  )
}

export function Bullet({ children, small = false }: { children: ReactNode; small?: boolean }) {
  return (
    <View style={[s.bullet, small ? { marginBottom: 2 } : {}]}>
      <Text style={s.bulletDot}>•</Text>
      <Text style={small ? { flex: 1, fontSize: 8, lineHeight: 1.35 } : { flex: 1 }}>{children}</Text>
    </View>
  )
}

function precedentsFor(jurisdictions: JurisdictionExposure[], f: Finding) {
  return jurisdictions.flatMap((j) => j.precedents).filter((p) => p.patternIds.includes(f.patternId))
}

function statusLabel(f: Finding, decisions: Record<string, Decision>): string {
  if (f.status === 'confirmed') return 'Confirmed'
  const d = decisions[f.id]
  return d === 'approved' ? 'Confirmed by reviewer' : d === 'dismissed' ? 'Dismissed by reviewer' : 'Awaiting review'
}

function driftLabel(report: AuditReport): string {
  const d = report.exposure?.priceDrift
  if (!d) return '-'
  const extra = d.payable.amount - d.advertised.amount
  return extra > 0 ? `+${formatMoney({ amount: extra, currency: d.payable.currency })} (+${percentUp(d.advertised.amount, d.payable.amount)}%)` : 'None'
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

function offset(ms: number): string {
  const sec = Math.max(0, Math.round(ms / 1000))
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`
}
