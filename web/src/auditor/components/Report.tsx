import { motion } from 'motion/react'
import { useState } from 'react'
import type { ReactNode } from 'react'
import type { AuditReport, Finding, Severity } from '../../shared/contract'
import { STEP_LABEL } from '../labels'
import { Confetti } from '../ui/Confetti'
import { CountUp } from '../ui/CountUp'
import { Sticker } from '../ui/Sticker'
import { buttonClass, TONE_BG } from '../ui/styles'
import type { Tone } from '../ui/styles'
import type { LogEntry } from '../useAudit'
import { AgentLog } from './AgentLog'
import { EvidenceViewer } from './Evidence'
import { FindingCard } from './FindingCard'
import { TrustScore } from './TrustScore'

type Decision = 'approved' | 'dismissed'

const SEVERITY_ORDER: Severity[] = ['high', 'medium', 'low']

export function Report({ report, logs }: { report: AuditReport; logs: LogEntry[] }) {
  const [open, setOpen] = useState<Finding | null>(null)
  const [decisions, setDecisions] = useState<Record<string, Decision>>({})

  const confirmed = report.findings
    .filter((f) => f.status === 'confirmed')
    .sort((a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity) || b.confidence - a.confidence)
  const review = report.findings.filter((f) => f.status === 'needs_review')
  const clean = report.findings.length === 0
  const pending = review.filter((f) => !decisions[f.id]).length
  const durationS = Math.max(1, Math.round((Date.parse(report.completedAt) - Date.parse(report.startedAt)) / 1000))

  return (
    <div className="space-y-12">
      {/* Verdict */}
      <motion.section
        className="brutal relative grid gap-8 rounded-3xl bg-white p-6 md:grid-cols-[auto_minmax(0,1fr)] md:items-center md:p-10"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        {clean && <Confetti />}
        <TrustScore score={report.trustScore} />
        <div>
          <Sticker tone="sun" rotate={-2}>the verdict</Sticker>
          <p className="mt-3 font-display text-xl leading-snug font-bold sm:text-2xl">{report.summary}</p>
          <dl className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Violations" value={confirmed.length} tone={confirmed.length ? 'pink' : 'lime'} />
            <Stat label="For review" value={review.length} tone={review.length ? 'sun' : 'white'} />
            <Stat label="Steps walked" value={report.steps.length} tone="lilac" />
            <Stat label="Audit time" value={durationS} suffix="s" tone="white" />
          </dl>
        </div>
      </motion.section>

      {/* Journey filmstrip */}
      <section>
        <SectionTitle kicker="the walk">Journey walked</SectionTitle>
        <ol className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {report.steps.map((s, i) => {
            const hits = report.findings.filter((f) => f.step === s.step)
            const hitsConfirmed = hits.filter((f) => f.status === 'confirmed').length
            const hitsReview = hits.length - hitsConfirmed
            return (
              <motion.li
                key={s.step}
                className="brutal-sm overflow-hidden rounded-2xl bg-white"
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.06 }}
              >
                <div className="relative aspect-[16/11] overflow-hidden border-b-2 border-ink bg-cream">
                  <img src={s.screenshotUrl} alt={STEP_LABEL[s.step]} className="w-full" />
                  <span className="absolute top-2 left-2 grid h-7 w-7 place-items-center rounded-lg border-2 border-ink bg-white font-display text-sm font-extrabold">
                    {i + 1}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2 px-3 py-2 text-xs font-bold">
                  <span>{STEP_LABEL[s.step]}</span>
                  {hits.length > 0 ? (
                    <span className="flex gap-1">
                      {hitsConfirmed > 0 && <span className="rounded-md border-2 border-ink bg-pink px-1.5">{hitsConfirmed} 🚩</span>}
                      {hitsReview > 0 && <span className="rounded-md border-2 border-ink bg-sun px-1.5">{hitsReview} 🤔</span>}
                    </span>
                  ) : (
                    <span className="rounded-md border-2 border-ink bg-lime px-1.5">clean</span>
                  )}
                </div>
              </motion.li>
            )
          })}
        </ol>
      </section>

      {clean && (
        <section className="brutal relative overflow-hidden rounded-3xl bg-lime p-8 sm:p-10">
          <div className="font-display text-6xl font-extrabold tracking-tight sm:text-7xl">LEGIT. ✅</div>
          <p className="mt-2 font-display text-2xl font-bold">No dark patterns found.</p>
          <p className="mt-3 max-w-2xl text-[15px] leading-relaxed">
            Every urgency claim, price, cart line, consent box and fee was checked against what the shopper was shown, and all of it held up. The squad chat below shows each check the agents made.
          </p>
        </section>
      )}

      {confirmed.length > 0 && (
        <section>
          <SectionTitle kicker="the receipts 🧾" count={confirmed.length}>
            Confirmed violations
          </SectionTitle>
          <div className="mt-5 space-y-6">
            {confirmed.map((f) => (
              <FindingCard key={f.id} finding={f} onOpenEvidence={() => setOpen(f)} />
            ))}
          </div>
        </section>
      )}

      {review.length > 0 && (
        <section>
          <SectionTitle kicker="human review queue" count={review.length}>
            Your call 🤔
          </SectionTitle>
          <p className="mt-2 max-w-2xl text-[15px] text-ink/70">
            Below the confidence threshold, so the agents won’t assert these on their own. {pending > 0 ? `${pending} waiting on you.` : 'All reviewed. Nice.'}
          </p>
          <div className="mt-5 space-y-6">
            {review.map((f) => (
              <FindingCard
                key={f.id}
                finding={f}
                onOpenEvidence={() => setOpen(f)}
                footer={
                  <ReviewActions
                    decision={decisions[f.id]}
                    onDecide={(d) => setDecisions((all) => ({ ...all, [f.id]: d }))}
                    onUndo={() =>
                      setDecisions((all) => {
                        const next = { ...all }
                        delete next[f.id]
                        return next
                      })
                    }
                  />
                }
              />
            ))}
          </div>
        </section>
      )}

      <section className="break-before-page">
        <details className="group brutal rounded-3xl bg-white" open={clean}>
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-6 py-5">
            <span className="font-display text-xl font-extrabold">
              Squad chat 💬 <span className="ml-1 text-sm font-semibold text-ink/50">{logs.length} messages · full audit trail</span>
            </span>
            <span className="sticker bg-white transition group-open:rotate-180 print:hidden">▾</span>
          </summary>
          <div className="max-h-[560px] overflow-y-auto border-t-2 border-ink bg-cream px-6 py-5 print:max-h-none">
            <AgentLog logs={logs} follow={false} />
          </div>
        </details>
      </section>

      {open && <EvidenceViewer finding={open} onClose={() => setOpen(null)} />}
    </div>
  )
}

function Stat({ label, value, tone, suffix = '' }: { label: string; value: number; tone: Tone; suffix?: string }) {
  return (
    <div className={`brutal-sm rounded-2xl px-3.5 py-3 ${TONE_BG[tone]}`}>
      <dt className="text-[11px] font-extrabold tracking-wider uppercase opacity-70">{label}</dt>
      <dd className="mt-0.5 font-display text-4xl font-extrabold">
        <CountUp value={value} suffix={suffix} />
      </dd>
    </div>
  )
}

function SectionTitle({ children, kicker, count }: { children: ReactNode; kicker: string; count?: number }) {
  return (
    <div>
      <Sticker tone="white" rotate={-2}>{kicker}</Sticker>
      <h2 className="mt-2 flex items-center gap-3 font-display text-3xl font-extrabold tracking-tight sm:text-4xl">
        {children}
        {count !== undefined && <span className="sticker bg-ink !text-sm text-cream">{count}</span>}
      </h2>
    </div>
  )
}

function ReviewActions({ decision, onDecide, onUndo }: { decision?: Decision; onDecide: (d: Decision) => void; onUndo: () => void }) {
  if (decision) {
    return (
      <div className="mt-5 flex items-center gap-3">
        <Sticker tone={decision === 'approved' ? 'pink' : 'white'} rotate={-2}>
          {decision === 'approved' ? '🚩 Confirmed by reviewer' : '👋 Dismissed by reviewer'}
        </Sticker>
        <button type="button" onClick={onUndo} className="text-xs font-bold underline print:hidden">
          Undo
        </button>
      </div>
    )
  }
  return (
    <div className="mt-5 flex flex-wrap gap-3 print:hidden">
      <button type="button" onClick={() => onDecide('approved')} className={buttonClass('pink', 'sm')}>
        Confirm 🚩
      </button>
      <button type="button" onClick={() => onDecide('dismissed')} className={buttonClass('white', 'sm')}>
        Dismiss 👋
      </button>
    </div>
  )
}
