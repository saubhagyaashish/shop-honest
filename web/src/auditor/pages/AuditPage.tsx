import { ArrowLeft, FileDown, LoaderCircle, RotateCcw, Search, SkipForward } from 'lucide-react'
import { motion } from 'motion/react'
import { useCallback, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import type { JurisdictionCode } from '../../shared/contract'
import { useDocumentTitle } from '../../shared/useDocumentTitle'
import { AgentLog } from '../components/AgentLog'
import { FindingFeedItem } from '../components/FindingCard'
import { FixPanel } from '../components/FixPanel'
import { JourneyTimeline } from '../components/JourneyTimeline'
import { LiveBrowser } from '../components/LiveBrowser'
import { PriceMeter } from '../components/PriceMeter'
import { Report } from '../components/Report'
import type { Decision } from '../components/Report'
import { Sticker } from '../ui/Sticker'
import { buttonClass, TONE_BG } from '../ui/styles'
import type { Tone } from '../ui/styles'
import { auditSource } from '../source'
import type { FixToApply } from '../source/AuditSource'
import { AUDIT_NOT_FOUND } from '../source/sseSource'
import { isDemoAudit } from '../source/withDemoFallback'
import { useAudit } from '../useAudit'
import { useRunKind } from '../useRunKind'
import type { AuditState } from '../useAudit'

export function AuditPage() {
  const { auditId } = useParams()
  // A fresh page per audit: going from a report to its re-audit starts over (view, decisions, panels).
  return <AuditView key={auditId} auditId={auditId} />
}

function AuditView({ auditId }: { auditId: string | undefined }) {
  const [runKey, setRunKey] = useState(0)
  const { state, skipAhead } = useAudit(auditId, runKey)
  const runKind = useRunKind(auditId)
  // After completion, switch to the report on our own unless the viewer picked a view.
  const [autoReport, setAutoReport] = useState(false)
  const [chosenView, setChosenView] = useState<'live' | 'report' | null>(null)
  // Shared by the report and the PDF so both say the same thing.
  const [jurisdiction, setJurisdiction] = useState<JurisdictionCode>('IN')
  const [decisions, setDecisions] = useState<Record<string, Decision>>({})
  const [pdfState, setPdfState] = useState<'idle' | 'building' | 'error'>('idle')
  const [selfAuditState, setSelfAuditState] = useState<'idle' | 'building' | 'error'>('idle')
  const [reauditState, setReauditState] = useState<'idle' | 'starting'>('idle')
  const [reauditError, setReauditError] = useState<string>()
  const [fixing, setFixing] = useState(false)
  const navigate = useNavigate()
  const elapsed = useElapsed(state)
  useDocumentTitle(state.status === 'completed' ? 'Audit report · Shop Honest' : 'Scanning… · Shop Honest')

  useEffect(() => {
    if (state.status !== 'completed') return
    const id = setTimeout(() => setAutoReport(true), 1400)
    return () => clearTimeout(id)
  }, [state.status])

  const view = state.status !== 'completed' ? 'live' : (chosenView ?? (autoReport ? 'report' : 'live'))
  const runAgain = () => {
    setAutoReport(false)
    setChosenView(null)
    setDecisions({})
    setRunKey((k) => k + 1)
  }
  const decide = (findingId: string, decision: Decision | undefined) =>
    setDecisions((all) => {
      const next = { ...all }
      if (decision) next[findingId] = decision
      else delete next[findingId]
      return next
    })
  const downloadPdf = async () => {
    if (!state.report) return
    setPdfState('building')
    try {
      const { downloadAuditPdf } = await import('../pdf/download')
      await downloadAuditPdf({ report: state.report, logs: state.logs, jurisdiction, decisions })
      setPdfState('idle')
    } catch (err) {
      console.error(err)
      setPdfState('error')
    }
  }

  // "Fix it" and "Re-audit this page" need the real backend (never the built-in demo), and make no sense on a report
  // of a fixed copy: its page is the copy, not the store.
  const backed = auditSource.mode === 'live' && !!auditId && !isDemoAudit(auditId) && !state.report?.appliedFixes
  const canReaudit = backed
  const canFix = backed && !!auditSource.proposeFixes
  const loadFixes = useCallback(() => auditSource.proposeFixes!(auditId!), [auditId])
  const reaudit = async () => {
    if (!state.report) return
    setReauditState('starting')
    setReauditError(undefined)
    setFixing(false)
    try {
      const next = await auditSource.start(state.report.targetUrl, { live: true, compareTo: state.report.auditId })
      setReauditState('idle')
      navigate(`/audit/${next}`)
    } catch (err) {
      setReauditState('idle')
      setReauditError(err instanceof Error ? err.message : 'Could not start the re-audit.')
    }
  }
  // Audit a copy of the store with these fixes applied, and compare with this audit (errors show in the panel).
  const verifyFixes = async (fixes: FixToApply[]) => {
    if (!state.report) return
    const next = await auditSource.start(state.report.targetUrl, { live: true, compareTo: state.report.auditId, applyFixes: fixes })
    setFixing(false)
    navigate(`/audit/${next}`)
  }

  const downloadSelfAudit = async () => {
    if (!state.report) return
    setSelfAuditState('building')
    try {
      const { downloadSelfAuditPdf } = await import('../pdf/download')
      await downloadSelfAuditPdf(state.report)
      setSelfAuditState('idle')
    } catch (err) {
      console.error(err)
      setSelfAuditState('error')
    }
  }

  const running = state.status === 'running' || state.status === 'connecting'
  const confirmed = state.findings.filter((f) => f.status === 'confirmed').length
  const review = state.findings.length - confirmed

  return (
    <div className={`mx-auto px-4 pb-8 sm:px-6 ${view === 'report' ? 'max-w-[1248px] pb-24' : 'max-w-[1440px]'}`}>
      {/* Audit header: one row on desktop; on phones the status row, then the Report | Journey switch */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3 py-5">
        <Link to="/" aria-label="New audit" className={buttonClass('white', 'sm', 'print:hidden')}>
          <ArrowLeft size={16} strokeWidth={2.6} aria-hidden="true" /> <span className="hidden sm:inline">New audit</span>
        </Link>
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <StatusSticker status={state.status} />
          {runKind && (
            <span className="shrink-0 rounded-md border-2 border-ink bg-white px-2 py-0.5 text-[11px] font-extrabold tracking-wide uppercase">
              {runKind}
            </span>
          )}
          {state.targetUrl && (
            <span className="hidden truncate rounded-lg border-2 border-ink bg-white px-2.5 py-1 font-mono text-[13px] sm:block">{state.targetUrl}</span>
          )}
          {view !== 'report' && <span className="shrink-0 font-mono text-[13px] font-medium tabular-nums">{elapsed}</span>}
        </div>
        {running && skipAhead && (
          <button type="button" onClick={skipAhead} className={buttonClass('white', 'sm', 'order-last w-full sm:order-none sm:w-auto print:hidden')}>
            Skip to report <SkipForward size={16} strokeWidth={2.6} aria-hidden="true" />
          </button>
        )}
        {state.status === 'completed' && (
          <>
            <div className="brutal-sm order-last flex w-full rounded-xl bg-white p-1 text-sm font-bold sm:order-none sm:w-auto print:hidden">
              {(['report', 'live'] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setChosenView(v)}
                  className={`flex-1 rounded-lg px-3 py-1 sm:flex-none ${view === v ? 'bg-ink text-cream' : 'text-ink/60 hover:text-ink'}`}
                >
                  {v === 'report' ? 'Report' : 'Journey view'}
                </button>
              ))}
            </div>
            <button type="button" onClick={runAgain} aria-label="Run again" className={buttonClass('white', 'sm', 'print:hidden')}>
              <RotateCcw size={16} strokeWidth={2.6} aria-hidden="true" /> <span className="hidden sm:inline">Run again</span>
            </button>
            {view !== 'report' && (
              <button type="button" onClick={downloadPdf} disabled={pdfState === 'building'} className={buttonClass('lime', 'sm', 'print:hidden')}>
                {pdfState === 'building' ? (
                  <>
                    <LoaderCircle size={16} strokeWidth={2.6} className="animate-spin" aria-hidden="true" /> Building PDF…
                  </>
                ) : (
                  <>
                    <FileDown size={16} strokeWidth={2.6} aria-hidden="true" /> {pdfState === 'error' ? 'Retry PDF' : 'Download PDF report'}
                  </>
                )}
              </button>
            )}
          </>
        )}
      </div>

      {auditId && auditSource.mode === 'live' && isDemoAudit(auditId) && (
        <p className="brutal-sm rounded-xl bg-sun px-4 py-2.5 text-sm font-semibold">
          The live audit service can’t be reached right now, so this is the built-in demo replay of this store.
        </p>
      )}

      {state.status === 'failed' &&
        (state.error === AUDIT_NOT_FOUND ? (
          <div className="brutal rounded-3xl bg-white p-8">
            <Sticker tone="sun" rotate={-3}>
              no such audit 🔍
            </Sticker>
            <h1 className="mt-3 font-display text-[30px] leading-tight font-extrabold">We couldn’t find this audit.</h1>
            <p className="mt-1 max-w-xl text-[15px] text-ink/70">The link may be mistyped, or the audit no longer exists. Start a new one: it takes about half a minute.</p>
            <Link to="/" className={buttonClass('lime', 'md', 'mt-5')}>
              <Search size={18} strokeWidth={2.6} aria-hidden="true" /> Audit a store
            </Link>
          </div>
        ) : (
          <div className="brutal rounded-2xl bg-pink p-6 text-sm font-semibold">
            <b className="font-display text-lg">Oof, the audit couldn’t finish.</b> {state.error}
          </div>
        ))}

      {state.status !== 'failed' && view === 'report' && state.report && (
        <Report
          report={state.report}
          logs={state.logs}
          jurisdiction={jurisdiction}
          onJurisdiction={setJurisdiction}
          decisions={decisions}
          onDecide={decide}
          pdfBusy={pdfState === 'building'}
          onDownloadPdf={downloadPdf}
          selfAuditBusy={selfAuditState === 'building'}
          onDownloadSelfAudit={downloadSelfAudit}
          onFix={canFix ? () => setFixing(true) : undefined}
          onReaudit={canReaudit ? reaudit : undefined}
          reauditBusy={reauditState === 'starting'}
          reauditError={reauditError}
        />
      )}

      {fixing && state.report && (
        <FixPanel
          report={state.report}
          load={loadFixes}
          onClose={() => setFixing(false)}
          onVerify={verifyFixes}
          onReaudit={canReaudit ? reaudit : undefined}
        />
      )}

      {state.status !== 'failed' && view === 'live' && (
        <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:h-[calc(100vh-11.5rem)] lg:min-h-[560px] lg:grid-cols-[210px_minmax(0,1fr)_minmax(320px,390px)]">
          <aside className="space-y-4 lg:min-h-0 lg:overflow-y-auto lg:pr-1 lg:pb-2">
            <Panel title="The journey">
              <JourneyTimeline
                currentStep={state.currentStep}
                visited={state.stepsVisited}
                findings={state.findings}
                done={state.status === 'completed'}
                blocked={state.blocked}
              />
            </Panel>
            <div className="grid grid-cols-2 gap-3">
              <Counter label="Caught 🚩" value={confirmed} tone={confirmed ? 'pink' : 'white'} />
              <Counter label="For review 🤔" value={review} tone={review ? 'sun' : 'white'} />
            </div>
            <PriceMeter trail={state.priceTrail} />
          </aside>

          <div className="flex max-h-[70vh] min-h-0 flex-col lg:max-h-none">
            <LiveBrowser
              url={state.browser?.url}
              screenshotUrl={state.browser?.screenshotUrl}
              findings={state.findings}
              latestFindingId={state.latestFindingId}
              busy={running}
              blockedReason={state.blocked?.reason}
            />
          </div>

          <div className="flex min-h-0 flex-col gap-5">
            <Panel title="Receipts 🧾" className="max-h-[46%] min-h-0" count={state.findings.length}>
              {state.findings.length === 0 ? (
                <p className="py-2 text-sm font-medium text-ink/60">
                  {running ? 'No tea yet ☕. Findings land here as the agents confirm them.' : 'Nothing found. Squeaky clean ✨'}
                </p>
              ) : (
                <ul className="space-y-2.5 pb-1">
                  {[...state.findings].reverse().map((f) => (
                    <FindingFeedItem key={f.id} finding={f} fresh={f.id === state.latestFindingId} />
                  ))}
                </ul>
              )}
            </Panel>
            <Panel title="Squad chat 💬" className="min-h-64 flex-1" bodyClass="bg-cream">
              <AgentLog logs={state.logs} startedAt={state.startedAt ? Date.parse(state.startedAt) : undefined} typing={running && state.logs.length > 0} />
            </Panel>
          </div>
        </div>
      )}
    </div>
  )
}

function Panel({ title, count, className = '', bodyClass = '', children }: { title: string; count?: number; className?: string; bodyClass?: string; children: ReactNode }) {
  return (
    <section className={`brutal flex flex-col overflow-hidden rounded-2xl bg-white ${className}`}>
      <h2 className="flex items-center gap-2 border-b-2 border-ink px-4 py-2.5 font-display text-[15px] font-extrabold">
        {title}
        {count !== undefined && count > 0 && <span className="rounded-md bg-ink px-1.5 text-xs text-cream">{count}</span>}
      </h2>
      <div className={`min-h-0 flex-1 overflow-y-auto px-4 py-3 ${bodyClass}`}>{children}</div>
    </section>
  )
}

function Counter({ label, value, tone }: { label: string; value: number; tone: Tone }) {
  return (
    <div className={`brutal rounded-2xl px-3 py-2.5 transition-colors ${TONE_BG[tone]}`}>
      <div className="text-[11px] font-extrabold tracking-wider uppercase">{label}</div>
      <motion.div
        key={value}
        className="font-display text-4xl leading-tight font-extrabold tabular-nums"
        initial={{ scale: 1.7, rotate: -10 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: 'spring', stiffness: 400, damping: 14 }}
      >
        {value}
      </motion.div>
    </div>
  )
}

function StatusSticker({ status }: { status: AuditState['status'] }) {
  const map: Record<AuditState['status'], [Tone, ReactNode]> = {
    connecting: ['white', 'starting…'],
    running: ['sun', <><span className="h-2 w-2 animate-blink rounded-full bg-ink" /> SCANNING</>],
    completed: ['lime', '✓ DONE'],
    failed: ['pink', '✕ FAILED'],
  }
  const [tone, label] = map[status]
  return (
    <Sticker tone={tone} rotate={-3} className="shrink-0">
      {label}
    </Sticker>
  )
}

function useElapsed(state: AuditState): string {
  const [now, setNow] = useState(() => Date.now())
  const running = state.status === 'running'
  useEffect(() => {
    if (!running) return
    const id = setInterval(() => setNow(Date.now()), 500)
    return () => clearInterval(id)
  }, [running])
  if (!state.startedAt) return ''
  const end = state.report ? Date.parse(state.report.completedAt) : now
  const s = Math.max(0, Math.floor((end - Date.parse(state.startedAt)) / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
