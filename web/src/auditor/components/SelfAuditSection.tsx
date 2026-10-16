import { FileDown, LoaderCircle } from 'lucide-react'
import type { AuditReport } from '../../shared/contract'
import { PATTERN_ICON } from '../patternIcons'
import { RESULT_LABEL, buildSelfAudit } from '../selfAudit'
import type { CheckResult, PatternRow } from '../selfAudit'
import { SectionHead } from '../ui/SectionHead'
import { buttonClass } from '../ui/styles'

const RESULT_STYLE: Record<CheckResult, string> = {
  found: 'bg-pink',
  review: 'bg-sun',
  clear: 'bg-lime',
  not_reached: 'border-dashed bg-white text-ink/70',
  not_assessed: 'border-dashed bg-cream text-ink/60',
}

/** The CCPA self-audit: what this audit established about each of the guidelines' 13 dark patterns. */
export function SelfAuditSection({
  report,
  pdfBusy,
  onDownloadPdf,
  onJumpToFinding,
}: {
  report: AuditReport
  pdfBusy: boolean
  onDownloadPdf: () => void
  onJumpToFinding: (id: string) => void
}) {
  const audit = buildSelfAudit(report)
  const { counts } = audit
  const date = new Date(report.completedAt).toLocaleDateString('en-IN', { dateStyle: 'medium' })

  return (
    <section id="ccpa" className="scroll-mt-32">
      <SectionHead
        kicker="CCPA self-audit 📋"
        title="All 13 dark patterns, checked"
        note="India’s 2023 guidelines name 13 dark patterns. Here is what this audit established about each one: what it found, what it checked and found clean, and what an automated audit can’t check."
        right={
          <button type="button" onClick={onDownloadPdf} disabled={pdfBusy} className={buttonClass('white', 'md')}>
            {pdfBusy ? <LoaderCircle size={18} strokeWidth={2.6} className="animate-spin" /> : <FileDown size={18} strokeWidth={2.6} />}
            {pdfBusy ? 'Building PDF…' : 'Self-audit PDF'}
          </button>
        }
      />

      <div className="mt-5 flex flex-wrap gap-2 text-[13px] font-bold">
        {(['found', 'review', 'clear', 'not_reached', 'not_assessed'] as CheckResult[])
          .filter((r) => counts[r] > 0)
          .map((r) => (
            <span key={r} className={`rounded-lg border-2 border-ink px-2.5 py-1 ${RESULT_STYLE[r]}`}>
              {counts[r]} {RESULT_LABEL[r].toLowerCase()}
            </span>
          ))}
      </div>

      <ol className="brutal mt-4 overflow-hidden rounded-3xl bg-white">
        {audit.ccpa.map((row) => (
          <Row key={row.pattern.id} row={row} onJumpToFinding={onJumpToFinding} />
        ))}
      </ol>

      {audit.also.length > 0 && (
        <ol className="mt-3 overflow-hidden rounded-2xl border-2 border-ink bg-white">
          {audit.also.map((row) => (
            <Row key={row.pattern.id} row={row} onJumpToFinding={onJumpToFinding} />
          ))}
        </ol>
      )}

      <p className="mt-3 max-w-3xl text-[13px] text-ink/60">
        Automated observations of what a logged-out shopper was shown on {date}. They are not a legal finding: a person should review each item before
        it’s relied on in a self-audit.
      </p>
    </section>
  )
}

function Row({ row, onJumpToFinding }: { row: PatternRow; onJumpToFinding: (id: string) => void }) {
  const Icon = PATTERN_ICON[row.pattern.id]
  const first = row.findings[0]
  const muted = row.result === 'not_reached' || row.result === 'not_assessed'
  return (
    <li className="flex flex-col gap-2 border-t-2 border-ink/10 px-4 py-3 first:border-t-0 sm:flex-row sm:items-center sm:gap-4 sm:px-5">
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <span className={`mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl border-2 border-ink ${muted ? 'bg-cream' : 'bg-white'}`}>
          <Icon size={17} strokeWidth={2.4} className={muted ? 'text-ink/45' : ''} />
        </span>
        <div className="min-w-0">
          <div className="flex flex-wrap items-baseline gap-x-2 text-[15px] leading-snug font-bold">
            {row.item !== undefined && <span className="font-mono text-[12px] text-ink/45">{String(row.item).padStart(2, '0')}</span>}
            <span className={muted ? 'text-ink/65' : ''}>{row.pattern.name}</span>
            {row.measured && <span className="rounded-md bg-ink/10 px-1.5 text-[11px] font-bold text-ink/60">measured</span>}
            {row.judged && <span className="rounded-md bg-ink/10 px-1.5 text-[11px] font-bold text-ink/60">AI-judged</span>}
          </div>
          <p className="mt-0.5 text-[13px] leading-snug text-ink/65">{row.note}</p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2 pl-12 sm:pl-0">
        <span className={`rounded-lg border-2 border-ink px-2.5 py-0.5 text-[13px] font-bold ${RESULT_STYLE[row.result]}`}>{RESULT_LABEL[row.result]}</span>
        {first && (
          <button type="button" onClick={() => onJumpToFinding(first.id)} className="text-[13px] font-bold underline underline-offset-2 hover:text-ink/70">
            See {row.findings.length > 1 ? 'findings' : 'finding'}
          </button>
        )}
      </div>
    </li>
  )
}
