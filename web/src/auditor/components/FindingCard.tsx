import { Maximize2 } from 'lucide-react'
import { motion } from 'motion/react'
import type { ReactNode } from 'react'
import type { Finding } from '../../shared/contract'
import { PATTERNS } from '../../shared/patterns'
import { STEP_LABEL } from '../labels'
import { PATTERN_ICON } from '../patternIcons'
import { REVIEW_THRESHOLD } from '../score'
import { AgentTag, ConfidenceMeter, SeverityBadge, StatusBadge } from './bits'
import { Polaroid } from './Evidence'

/** Full finding as it appears in the report. */
export function FindingCard({ finding, onOpenEvidence, footer }: { finding: Finding; onOpenEvidence: () => void; footer?: ReactNode }) {
  const pattern = PATTERNS[finding.patternId]
  const Icon = PATTERN_ICON[finding.patternId]
  const frames = finding.evidence.frames
  const review = finding.status === 'needs_review'
  return (
    <motion.article
      className="brutal grid overflow-hidden rounded-3xl bg-white break-inside-avoid md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]"
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-40px' }}
      transition={{ duration: 0.45, ease: [0.2, 0.8, 0.2, 1] }}
    >
      <button
        type="button"
        onClick={onOpenEvidence}
        className={`group dot-grid relative flex flex-col justify-center gap-6 border-b-2 border-ink p-6 text-left md:border-r-2 md:border-b-0 ${review ? 'bg-sun/25' : 'bg-pink/15'}`}
        aria-label="Open screenshot evidence"
      >
        {frames.map((f, i) => (
          <Polaroid key={i} frame={f} index={i} total={frames.length} />
        ))}
        <span className="sticker absolute right-3 bottom-3 bg-white !py-0.5 text-[11px] opacity-0 transition group-hover:opacity-100 group-focus-visible:opacity-100 print:hidden">
          <Maximize2 size={12} strokeWidth={2.8} aria-hidden="true" /> full screenshot{frames.length > 1 ? 's' : ''}
        </span>
      </button>

      <div className="flex flex-col p-6">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`grid h-8 w-8 place-items-center rounded-lg border-2 border-ink ${review ? 'bg-sun' : 'bg-pink'}`}>
            <Icon size={16} strokeWidth={2.6} aria-hidden="true" />
          </span>
          <span className="text-sm font-extrabold">{pattern.name}</span>
          <SeverityBadge severity={finding.severity} />
          <span className="ml-auto">
            <StatusBadge status={finding.status} />
          </span>
        </div>
        <h3 className="mt-3 font-display text-[22px] leading-tight font-extrabold tracking-tight">{finding.title}</h3>
        <p className="mt-2 text-[15px] leading-relaxed text-ink/75">{finding.explanation}</p>

        <ul className="mt-4 space-y-1.5 text-sm">
          {finding.evidence.observations.map((o) => (
            <li key={o} className="flex gap-2">
              <span className="mt-1 grid h-4 w-4 shrink-0 place-items-center rounded border-2 border-ink bg-lime text-[9px] font-black">✓</span>
              <span>{o}</span>
            </li>
          ))}
        </ul>

        <div className="mt-4 rounded-xl border-2 border-dashed border-ink bg-cream px-3 py-2.5 text-[13px]">
          <span className="font-extrabold">📜 Rule breached:</span> {finding.rule.source}, {finding.rule.clause}
        </div>

        <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-2 pt-4 text-xs font-medium text-ink/70">
          <span>
            Step: <b className="text-ink">{STEP_LABEL[finding.step]}</b>
          </span>
          <span className="flex items-center gap-1.5">
            Found by <AgentTag agent={finding.detectedBy} />
          </span>
          <span className="flex items-center gap-1.5">
            Confidence <ConfidenceMeter value={finding.confidence} threshold={REVIEW_THRESHOLD} />
          </span>
        </div>
        {footer}
      </div>
    </motion.article>
  )
}

/** Compact finding for the live feed. */
export function FindingFeedItem({ finding, fresh }: { finding: Finding; fresh: boolean }) {
  const review = finding.status === 'needs_review'
  const Icon = PATTERN_ICON[finding.patternId]
  return (
    <motion.li
      layout
      className={`flex gap-3 rounded-xl border-2 border-ink bg-white p-2.5 ${fresh ? 'shadow-brutal' : 'shadow-brutal-sm'}`}
      initial={{ opacity: 0, x: 40, rotate: 3 }}
      animate={{ opacity: 1, x: 0, rotate: 0 }}
      transition={{ type: 'spring', stiffness: 320, damping: 22 }}
    >
      <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg border-2 border-ink ${review ? 'bg-sun' : 'bg-pink'}`}>
        <Icon size={17} strokeWidth={2.6} aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-[11px] font-extrabold tracking-wide uppercase">{review ? 'Needs a human 🤔' : PATTERNS[finding.patternId].name}</span>
          <span className="ml-auto font-mono text-[11px] text-ink/50">{finding.confidence.toFixed(2)}</span>
        </div>
        <div className="mt-0.5 text-[13px] leading-snug font-semibold">{finding.title}</div>
      </div>
    </motion.li>
  )
}
