import { useMemo, useState } from 'react'
import type { AuditReport, Finding, JourneyStep, JurisdictionCode, Severity } from '../../shared/contract'
import { JOURNEY_STEPS } from '../../shared/contract'
import { Lock } from 'lucide-react'
import { STEP_LABEL } from '../labels'
import { coverageOf, nothingChecked } from '../coverage'
import { formatMoney } from '../money'
import { SectionHead } from '../ui/SectionHead'
import { Sticker } from '../ui/Sticker'
import { buttonClass } from '../ui/styles'
import type { LogEntry } from '../useAudit'
import { AgentLog } from './AgentLog'
import { DamageSection } from './DamageSection'
import { EvidenceViewer } from './Evidence'
import { ExposureSection } from './ExposureSection'
import { FindingRow } from './FindingCard'
import { ComparisonSection } from './ComparisonSection'
import { ReportNav } from './ReportNav'
import type { NavItem } from './ReportNav'
import { SelfAuditSection } from './SelfAuditSection'
import { VerdictHero } from './VerdictHero'

export type Decision = 'approved' | 'dismissed'

const SEVERITY_ORDER: Severity[] = ['high', 'medium', 'low']

interface ReportProps {
  report: AuditReport
  logs: LogEntry[]
  jurisdiction: JurisdictionCode
  onJurisdiction: (code: JurisdictionCode) => void
  decisions: Record<string, Decision>
  onDecide: (findingId: string, decision: Decision | undefined) => void
  pdfBusy: boolean
  onDownloadPdf: () => void
  selfAuditBusy: boolean
  onDownloadSelfAudit: () => void
  /** Open "Fix it" (needs the backend). */
  onFix?: () => void
  onReaudit?: () => void
  reauditBusy?: boolean
  reauditError?: string
}

export function Report({
  report,
  logs,
  jurisdiction,
  onJurisdiction,
  decisions,
  onDecide,
  pdfBusy,
  onDownloadPdf,
  selfAuditBusy,
  onDownloadSelfAudit,
  onFix,
  onReaudit,
  reauditBusy,
  reauditError,
}: ReportProps) {
  const exposure = report.exposure
  const region = exposure?.jurisdictions.find((j) => j.code === jurisdiction)
  const confirmed = useMemo(
    () =>
      report.findings
        .filter((f) => f.status === 'confirmed')
        .sort((a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity) || b.confidence - a.confidence),
    [report.findings],
  )
  const review = report.findings.filter((f) => f.status === 'needs_review')
  const clean = report.findings.length === 0
  const coverage = coverageOf(report.steps)
  const lastAudited = coverage.audited[coverage.audited.length - 1]

  const [viewing, setViewing] = useState<Finding | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(confirmed[0] ? [confirmed[0].id] : []))
  const [step, setStep] = useState<JourneyStep | null>(null)

  /** Money each finding costs the shopper, shown on its row. */
  const impact = useMemo(() => {
    const out: Record<string, string> = {}
    const drift = exposure?.priceDrift
    if (!drift) return out
    const sums: Record<string, number> = {}
    for (const l of drift.lines) if (l.findingId) sums[l.findingId] = (sums[l.findingId] ?? 0) + l.amount.amount
    for (const [id, amount] of Object.entries(sums)) out[id] = `+${formatMoney({ amount, currency: drift.payable.currency })}`
    if (drift.savingFindingId && drift.claimedSaving && drift.genuineSaving) {
      out[drift.savingFindingId] = `${formatMoney({ amount: drift.claimedSaving.amount - drift.genuineSaving.amount, currency: drift.payable.currency })} fake`
    }
    return out
  }, [exposure])

  const navItems = useMemo<NavItem[]>(
    () => [
      { id: 'overview', label: 'Overview' },
      ...(report.comparison ? [{ id: 'compared', label: report.appliedFixes ? 'Verified ✓' : 'Re-audit 🔁' }] : []),
      ...(exposure ? [{ id: 'money', label: 'Money 💸' }, { id: 'legal', label: 'Legal ⚖️' }] : []),
      { id: 'findings', label: 'Findings', count: confirmed.length },
      ...(review.length ? [{ id: 'review', label: 'Review', count: review.length }] : []),
      { id: 'ccpa', label: 'CCPA self-audit' },
      { id: 'trail', label: 'Audit trail' },
    ],
    [exposure, confirmed.length, review.length, report.comparison, report.appliedFixes],
  )

  const toggle = (id: string) =>
    setExpanded((s) => {
      const next = new Set(s)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const jumpToFinding = (id: string) => {
    setStep(null)
    setExpanded((s) => new Set(s).add(id))
    requestAnimationFrame(() => document.getElementById(`finding-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }

  const rowProps = (f: Finding) => ({
    finding: f,
    open: expanded.has(f.id),
    onToggle: () => toggle(f.id),
    onOpenEvidence: () => setViewing(f),
    citation: region?.citations[f.id],
    regionName: region?.name,
    precedents: region?.precedents.filter((p) => p.patternIds.includes(f.patternId)) ?? [],
    impact: impact[f.id],
  })

  const shown = step ? confirmed.filter((f) => f.step === step) : confirmed

  const thirdParty = isThirdParty(report.targetUrl)
  return (
    <div className="mx-auto max-w-[1200px]">
      {thirdParty && (
        <p className="brutal-sm mb-6 rounded-xl bg-white px-4 py-2.5 text-sm font-medium">
          Automated observations of <b>{thirdParty}</b> from a logged-out session on {new Date(report.completedAt).toLocaleDateString('en-IN', { dateStyle: 'medium' })}.
          They are not a legal finding: the legal section shows which rules such patterns fall under.
        </p>
      )}
      <VerdictHero
        report={report}
        pdfBusy={pdfBusy}
        onDownloadPdf={onDownloadPdf}
        onSeeFixes={() => document.getElementById('findings')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
        onFix={onFix}
        onReaudit={onReaudit}
        reauditBusy={reauditBusy}
        reauditError={reauditError}
      />
      <ReportNav items={navItems} className="mt-3" />

      <div className="mt-6 space-y-16">
        {report.comparison && <ComparisonSection comparison={report.comparison} applied={report.appliedFixes} />}

        {exposure && (
          <DamageSection drift={exposure.priceDrift} onJumpToFinding={jumpToFinding} stoppedAfter={!coverage.complete && lastAudited ? STEP_LABEL[lastAudited] : undefined} />
        )}

        {exposure && <ExposureSection exposure={exposure} findings={report.findings} jurisdiction={jurisdiction} onJurisdiction={onJurisdiction} />}

        <section id="findings" className="scroll-mt-32">
          <SectionHead
            kicker="the receipts 🧾"
            title={nothingChecked(report.steps) ? 'Nothing checked' : clean ? 'Nothing caught' : 'What we caught'}
            count={confirmed.length}
            note={
              nothingChecked(report.steps)
                ? 'The agent stopped on the first page, so no step below was checked.'
                : clean
                  ? undefined
                  : 'Each row is one trick. Open it for the screenshot, the rule it breaks and the fix.'
            }
          />

          <ol className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {JOURNEY_STEPS.map((stepId, i) => {
              const st = report.steps.find((c) => c.step === stepId)
              const audited = st !== undefined && st.status !== 'blocked'
              const hits = confirmed.filter((f) => f.step === stepId).length
              const selected = step === stepId
              if (!audited) {
                return (
                  <li key={stepId}>
                    <div className="flex w-full items-center gap-2.5 rounded-xl border-2 border-dashed border-ink/40 bg-white/60 p-1.5 pr-3" title={st?.blockedReason ?? 'Not reached'}>
                      <span className="grid h-11 w-16 shrink-0 place-items-center rounded-md border-2 border-dashed border-ink/30 bg-cream">
                        <Lock size={16} strokeWidth={2.6} className="text-ink/50" />
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-[13px] font-bold text-ink/60">
                          {i + 1}. {STEP_LABEL[stepId]}
                        </span>
                        <span className="text-[12px] font-bold text-ink/50">{st?.blockedReason ? 'not audited' : 'not reached'}</span>
                      </span>
                    </div>
                  </li>
                )
              }
              return (
                <li key={stepId}>
                  <button
                    type="button"
                    onClick={() => setStep(selected ? null : stepId)}
                    disabled={hits === 0}
                    aria-pressed={selected}
                    className={`flex w-full items-center gap-2.5 rounded-xl border-2 border-ink p-1.5 pr-3 text-left transition-[transform,box-shadow] disabled:cursor-default ${
                      selected ? 'bg-ink text-cream shadow-brutal' : 'bg-white shadow-brutal-sm enabled:hover:-translate-y-0.5'
                    }`}
                  >
                    <span className="relative h-11 w-16 shrink-0 overflow-hidden rounded-md border-2 border-ink bg-cream">
                      <img src={st.screenshotUrl} alt="" className="w-full" />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-[13px] font-bold">
                        {i + 1}. {STEP_LABEL[stepId]}
                      </span>
                      <span className={`text-[12px] font-bold ${hits ? (selected ? 'text-pink' : 'text-[#d6336c]') : selected ? 'text-lime' : 'text-green-700'}`}>
                        {hits ? `${hits} caught` : 'clean ✓'}
                      </span>
                    </span>
                  </button>
                </li>
              )
            })}
          </ol>

          {clean ? (
            <div className="brutal mt-5 rounded-3xl bg-lime p-8">
              <div className="font-display text-[34px] leading-tight font-extrabold">LEGIT. ✅</div>
              <p className="mt-1 font-display text-[20px] font-bold">No dark patterns found on any step.</p>
              <p className="mt-2 max-w-2xl text-[15px]">
                Every urgency claim, price, cart line, consent box and fee matched what the shopper was shown. The audit trail below lists each check.
              </p>
            </div>
          ) : (
            <>
              {step && (
                <div className="mt-4 flex items-center gap-3 text-sm font-semibold">
                  Showing {shown.length} finding{shown.length === 1 ? '' : 's'} at {STEP_LABEL[step]}
                  <button type="button" onClick={() => setStep(null)} className="font-bold underline underline-offset-2">
                    show all
                  </button>
                </div>
              )}
              <div className="mt-5 space-y-3">
                {shown.map((f) => (
                  <FindingRow key={f.id} {...rowProps(f)} />
                ))}
              </div>
            </>
          )}
        </section>

        {review.length > 0 && (
          <section id="review" className="scroll-mt-32">
            <SectionHead
              kicker="human review queue"
              title="Your call 🤔"
              count={review.length}
              note="Below the confidence threshold, so the agents won’t assert these on their own."
            />
            <div className="mt-5 space-y-3">
              {review.map((f) => (
                <FindingRow
                  key={f.id}
                  {...rowProps(f)}
                  actions={<ReviewActions decision={decisions[f.id]} onDecide={(d) => onDecide(f.id, d)} onUndo={() => onDecide(f.id, undefined)} />}
                />
              ))}
            </div>
          </section>
        )}


        <SelfAuditSection report={report} pdfBusy={selfAuditBusy} onDownloadPdf={onDownloadSelfAudit} onJumpToFinding={jumpToFinding} />

        <section id="trail" className="scroll-mt-32 break-before-page">
          <details className="group brutal rounded-3xl bg-white" open={clean}>
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-6 py-5">
              <span className="font-display text-[22px] font-extrabold">
                Squad chat 💬 <span className="ml-1 text-sm font-semibold text-ink/50">{logs.length} messages · full audit trail</span>
              </span>
              <span className="sticker bg-white transition group-open:rotate-180 print:hidden">▾</span>
            </summary>
            <div className="max-h-[560px] overflow-y-auto border-t-2 border-ink bg-cream px-6 py-5 print:max-h-none">
              <AgentLog logs={logs} follow={false} />
            </div>
          </details>
        </section>
      </div>

      {viewing && <EvidenceViewer finding={viewing} onClose={() => setViewing(null)} />}
    </div>
  )
}

function ReviewActions({ decision, onDecide, onUndo }: { decision?: Decision; onDecide: (d: Decision) => void; onUndo: () => void }) {
  if (decision) {
    return (
      <>
        <Sticker tone={decision === 'approved' ? 'pink' : 'white'} rotate={-2}>
          {decision === 'approved' ? '🚩 Confirmed' : '👋 Dismissed'}
        </Sticker>
        <button type="button" onClick={onUndo} className="text-xs font-bold underline print:hidden">
          Undo
        </button>
      </>
    )
  }
  return (
    <>
      <button type="button" onClick={() => onDecide('approved')} className={buttonClass('pink', 'sm')}>
        Confirm 🚩
      </button>
      <button type="button" onClick={() => onDecide('dismissed')} className={buttonClass('white', 'sm')}>
        Dismiss 👋
      </button>
    </>
  )
}


/** The host of a store we didn't build, or null for our own demo stores. */
function isThirdParty(targetUrl: string): string | null {
  try {
    const url = new URL(targetUrl)
    return /^\/demo\/store-[a-z]\//.test(url.pathname) ? null : url.hostname
  } catch {
    return null
  }
}
