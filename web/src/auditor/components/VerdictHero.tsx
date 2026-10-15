import { ArrowDown, FileDown, Flag as FlagIcon, LoaderCircle, ReceiptText, RotateCcw, Scale, Wrench } from 'lucide-react'
import { motion } from 'motion/react'
import type { ReactNode } from 'react'
import type { AuditReport, FixChange } from '../../shared/contract'
import { coverageOf } from '../coverage'
import { buildHeadline, summariseRisk } from '../headline'
import { STEP_LABEL } from '../labels'
import { formatMoney, percentUp } from '../money'
import { Confetti } from '../ui/Confetti'
import { CountUp } from '../ui/CountUp'
import { Flag } from '../ui/Flag'
import { buttonClass, TONE_BG } from '../ui/styles'
import type { Tone } from '../ui/styles'
import { CoverageBar } from './CoverageBar'
import { TrustScore } from './TrustScore'

interface Props {
  report: AuditReport
  pdfBusy: boolean
  onDownloadPdf: () => void
  onSeeFixes: () => void
  /** Open "Fix it" (live backends only). */
  onFix?: () => void
  /** Re-audit this page and compare (live backends only). */
  onReaudit?: () => void
  reauditBusy?: boolean
  reauditError?: string
}

/** Above-the-fold verdict: score, one-line takeaway and the three numbers that matter. */
export function VerdictHero({ report, pdfBusy, onDownloadPdf, onSeeFixes, onFix, onReaudit, reauditBusy = false, reauditError }: Props) {
  const { lead, punch } = buildHeadline(report)
  const risk = summariseRisk(report)
  const confirmed = report.findings.filter((f) => f.status === 'confirmed').length
  const review = report.findings.length - confirmed
  const drift = report.exposure?.priceDrift
  const extra = drift ? drift.payable.amount - drift.advertised.amount : 0
  const clean = report.findings.length === 0
  const target = targetLabel(report.targetUrl)
  const coverage = coverageOf(report.steps)
  const lastAudited = coverage.audited[coverage.audited.length - 1]
  const reached = coverage.complete ? 'charged' : `by ${lastAudited ? STEP_LABEL[lastAudited] : 'the last step'}`

  return (
    <motion.section
      id="overview"
      className="brutal relative scroll-mt-32 rounded-3xl bg-white p-6 lg:p-8"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
    >
      {clean && <Confetti />}
      <div className="grid items-center gap-8 lg:grid-cols-[200px_minmax(0,1fr)]">
        <TrustScore score={report.trustScore} size="sm" />

        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-ink/60">
            <span className="rounded-md border-2 border-ink bg-cream px-1.5 py-0.5 font-mono text-[11px] text-ink">{target}</span>
            <span>audited {new Date(report.completedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
            {report.appliedFixes && <FixedCopyBadge fixes={report.appliedFixes} />}
          </div>
          <div className="mt-2">
            <CoverageBar steps={report.steps} />
          </div>
          <h1 className="mt-3 font-display text-[28px] leading-[1.15] font-extrabold tracking-tight sm:text-[34px]">
            {lead}{' '}
            <span className={`box-decoration-clone px-1.5 ${clean ? 'bg-lime' : 'bg-pink'}`}>{punch}</span>
          </h1>

          <div className="mt-6 grid gap-3 md:grid-cols-3">
            <ImpactTile
              tone={confirmed ? 'white' : 'lime'}
              icon={<FlagIcon size={16} strokeWidth={2.6} />}
              label="Tricks caught"
              value={<CountUp value={confirmed} />}
              sub={review ? `+${review} waiting for your review` : clean ? 'Every check passed' : 'All confirmed by the agents'}
            />
            <ImpactTile
              tone={extra > 0 ? 'pink' : 'lime'}
              icon={<ReceiptText size={16} strokeWidth={2.6} />}
              label={coverage.complete ? 'Overcharge per order' : 'Overcharge so far'}
              value={extra > 0 && drift ? `+${formatMoney({ amount: extra, currency: drift.payable.currency })}` : '₹0'}
              sub={
                drift
                  ? extra > 0
                    ? `${formatMoney(drift.advertised)} shown → ${formatMoney(drift.payable)} ${reached} (+${percentUp(drift.advertised.amount, drift.payable.amount)}%)`
                    : `${formatMoney(drift.payable)}, exactly as shown`
                  : 'No price data'
              }
            />
            <ImpactTile
              tone={risk.focus ? 'ink' : 'lime'}
              icon={<Scale size={16} strokeWidth={2.6} />}
              label="Fine risk"
              value={risk.focus ? risk.focus.penaltyHeadline : '0 rules broken'}
              valueSize="text-[19px] leading-snug"
              sub={
                risk.focus ? (
                  <span className="inline-flex items-center gap-1.5">
                    <Flag code={risk.focus.code} className="h-3.5 w-[21px]" /> {risk.focus.name} · rules broken in {risk.regionsBroken} of {risk.regionsChecked} regions
                  </span>
                ) : (
                  `Checked against ${risk.regionsChecked} regions’ laws`
                )
              }
            />
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-3 print:hidden">
            {onFix && !clean && (
              <button type="button" onClick={onFix} className={buttonClass('pink', 'md')}>
                <Wrench size={18} strokeWidth={2.6} /> Fix it
              </button>
            )}
            <button type="button" onClick={onDownloadPdf} disabled={pdfBusy} className={buttonClass('lime', 'md')}>
              {pdfBusy ? <LoaderCircle size={18} strokeWidth={2.6} className="animate-spin" /> : <FileDown size={18} strokeWidth={2.6} />}
              {pdfBusy ? 'Building PDF…' : 'Download PDF report'}
            </button>
            {!clean && (
              <button type="button" onClick={onSeeFixes} className={buttonClass('white', 'md')}>
                See what to fix <ArrowDown size={16} strokeWidth={2.6} />
              </button>
            )}
            {onReaudit && (
              <button
                type="button"
                onClick={onReaudit}
                disabled={reauditBusy}
                className={buttonClass('white', 'md')}
                title="Audit this page again and compare with this audit"
              >
                {reauditBusy ? <LoaderCircle size={18} strokeWidth={2.6} className="animate-spin" /> : <RotateCcw size={18} strokeWidth={2.6} />}
                {reauditBusy ? 'Starting…' : 'Re-audit this page'}
              </button>
            )}
            {reauditError && <p className="basis-full text-sm font-semibold text-[#d6336c]">{reauditError}</p>}
          </div>
        </div>
      </div>
    </motion.section>
  )
}

function FixedCopyBadge({ fixes }: { fixes: FixChange[] }) {
  const n = new Set(fixes.map((c) => c.setting)).size
  return (
    <span className="rounded-md border-2 border-ink bg-lime px-1.5 py-0.5 text-[11px] font-extrabold text-ink">
      🔧 a fixed copy: {n} setting{n === 1 ? '' : 's'} changed, in the auditor’s browser only
    </span>
  )
}

function ImpactTile({ tone, icon, label, value, sub, valueSize = 'text-[34px] leading-none' }: { tone: Tone; icon: ReactNode; label: string; value: ReactNode; sub: ReactNode; valueSize?: string }) {
  const dark = tone === 'ink'
  return (
    <div className={`brutal-sm flex flex-col rounded-2xl p-4 ${TONE_BG[tone]}`}>
      <div className="flex items-center gap-2 text-[11px] font-extrabold tracking-wider uppercase">
        <span className={`grid h-7 w-7 place-items-center rounded-lg border-2 ${dark ? 'border-cream/80 bg-cream/10' : 'border-ink bg-white'}`}>{icon}</span>
        {label}
      </div>
      <div className={`mt-3 font-display font-extrabold ${valueSize}`}>{value}</div>
      <div className={`mt-auto pt-2 text-[13px] leading-snug font-semibold ${dark ? 'text-cream/80' : 'text-ink/75'}`}>{sub}</div>
    </div>
  )
}

function targetLabel(url: string): string {
  try {
    const u = new URL(url)
    return `${u.host}${u.pathname}`
  } catch {
    return url
  }
}
