import { ArrowLeft, FileDown, LoaderCircle, RotateCcw, ScrollText, Search, Wrench } from 'lucide-react'
import { Link } from 'react-router'
import type { AuditReport } from '../../shared/contract'
import { nothingChecked } from '../coverage'
import { buttonClass } from '../ui/styles'

interface Props {
  report: AuditReport
  pdfBusy: boolean
  onDownloadPdf: () => void
  selfAuditBusy: boolean
  onDownloadSelfAudit: () => void
  onFix?: () => void
  onReaudit?: () => void
  reauditBusy?: boolean
  reauditError?: string
}

/** The report's last word: what to do with it, starting with fixing what it found. */
export function WhatNext({ report, pdfBusy, onDownloadPdf, selfAuditBusy, onDownloadSelfAudit, onFix, onReaudit, reauditBusy = false, reauditError }: Props) {
  const unchecked = nothingChecked(report.steps)
  const verified = report.appliedFixes !== undefined
  const fixable = !unchecked && !verified && report.findings.length > 0 && onFix !== undefined
  const [title, note] = unchecked
    ? ['Nothing could be checked here', 'The site stopped the agent before any step. Try again later, or audit another store.']
    : verified
      ? ['Fixed and verified', 'This report is of a fixed copy of the store. Compare it with the audit it fixed, or audit another store.']
      : fixable
        ? ['What next? Fix it', 'A fix for every finding and what each one is worth. On our demo stores, verify the fixes on a copy of the store.']
        : ['What next?', 'Take the report with you, or audit another store.']
  const previous = report.comparison?.previousAuditId

  return (
    <section aria-labelledby="what-next" className="print:hidden">
      <div className="brutal rounded-3xl bg-ink p-6 text-cream sm:p-8">
        <h2 id="what-next" className="font-display text-[26px] leading-tight font-extrabold">
          {title}
        </h2>
        <p className="mt-1 max-w-2xl text-[15px] text-cream/70">{note}</p>
        <div className="mt-5 flex flex-wrap gap-3">
          {fixable && (
            <button type="button" onClick={onFix} className={buttonClass('pink', 'md')}>
              <Wrench size={18} strokeWidth={2.6} aria-hidden="true" /> Fix it
            </button>
          )}
          {verified && previous && (
            <Link to={`/audit/${previous}`} className={buttonClass('lime', 'md')}>
              <ArrowLeft size={18} strokeWidth={2.6} aria-hidden="true" /> Back to the original audit
            </Link>
          )}
          <button type="button" onClick={onDownloadPdf} disabled={pdfBusy} className={buttonClass(fixable || verified ? 'white' : 'lime', 'md')}>
            {pdfBusy ? <LoaderCircle size={18} strokeWidth={2.6} className="animate-spin" /> : <FileDown size={18} strokeWidth={2.6} />}
            {pdfBusy ? 'Building PDF…' : 'Download the PDF report'}
          </button>
          {!unchecked && (
            <button type="button" onClick={onDownloadSelfAudit} disabled={selfAuditBusy} className={buttonClass('white', 'md')}>
              {selfAuditBusy ? <LoaderCircle size={18} strokeWidth={2.6} className="animate-spin" /> : <ScrollText size={18} strokeWidth={2.6} />}
              {selfAuditBusy ? 'Building PDF…' : 'CCPA self-audit PDF'}
            </button>
          )}
          {onReaudit && !verified && (
            <button type="button" onClick={onReaudit} disabled={reauditBusy} className={buttonClass('white', 'md')}>
              {reauditBusy ? <LoaderCircle size={18} strokeWidth={2.6} className="animate-spin" /> : <RotateCcw size={18} strokeWidth={2.6} />}
              {reauditBusy ? 'Starting…' : 'Re-audit this page'}
            </button>
          )}
          <Link to="/" className={buttonClass('white', 'md')}>
            <Search size={18} strokeWidth={2.6} aria-hidden="true" /> Audit another store
          </Link>
        </div>
        {reauditError && <p className="mt-3 text-sm font-semibold text-pink">{reauditError}</p>}
      </div>
    </section>
  )
}
