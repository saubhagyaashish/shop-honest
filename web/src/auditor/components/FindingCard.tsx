import { ChevronDown, Maximize2 } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import type { ReactNode } from 'react'
import type { Finding, Precedent, RuleCitation } from '../../shared/contract'
import { PATTERNS } from '../../shared/patterns'
import { STEP_LABEL } from '../labels'
import { PATTERN_ICON } from '../patternIcons'
import { REVIEW_THRESHOLD } from '../score'
import { AgentTag, ConfidenceMeter, SeverityBadge } from './bits'
import { Polaroid } from './Evidence'

const SEVERITY_BAR = { high: 'bg-pink', medium: 'bg-sun', low: 'bg-ink/20' } as const

interface FindingRowProps {
  finding: Finding
  open: boolean
  onToggle: () => void
  onOpenEvidence: () => void
  /** Citation for the selected region; falls back to the finding's primary rule. */
  citation?: RuleCitation
  regionName?: string
  precedents?: Precedent[]
  /** Money this finding costs the shopper, e.g. "+₹199". */
  impact?: string
  /** Shown on the row itself, e.g. reviewer buttons. */
  actions?: ReactNode
}

/** One finding as a compact, expandable row. */
export function FindingRow({ finding, open, onToggle, onOpenEvidence, citation, regionName, precedents = [], impact, actions }: FindingRowProps) {
  const rule = citation ?? finding.rule
  const Icon = PATTERN_ICON[finding.patternId]
  const review = finding.status === 'needs_review'
  return (
    <article id={`finding-${finding.id}`} className={`scroll-mt-36 overflow-hidden rounded-2xl border-2 border-ink bg-white break-inside-avoid ${open ? 'shadow-brutal' : 'shadow-brutal-sm'}`}>
      <div className="flex flex-col sm:flex-row sm:items-stretch">
        <button type="button" onClick={onToggle} aria-expanded={open} className="relative flex min-w-0 flex-1 items-center gap-3 py-3 pr-4 pl-6 text-left hover:bg-cream/60">
          <span className={`absolute inset-y-0 left-0 w-2 ${review ? 'bg-sun' : SEVERITY_BAR[finding.severity]}`} aria-hidden="true" />
          <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl border-2 border-ink ${review ? 'bg-sun' : 'bg-pink'}`}>
            <Icon size={18} strokeWidth={2.6} aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] font-extrabold tracking-wide uppercase">
              {PATTERNS[finding.patternId].name}
              <span className="text-ink/30">·</span>
              <span className="text-ink/60">{STEP_LABEL[finding.step]}</span>
              <SeverityBadge severity={finding.severity} />
            </span>
            <span className="mt-0.5 block text-[15px] leading-snug font-bold">{finding.title}</span>
            <span className="mt-0.5 block truncate text-[12px] text-ink/55">
              {regionName ? `${regionName}: ` : ''}
              {rule.clause}
            </span>
          </span>
          {impact && <span className="hidden shrink-0 rounded-lg border-2 border-ink bg-pink px-2 py-0.5 font-mono text-[13px] font-bold sm:inline">{impact}</span>}
          <ChevronDown size={20} strokeWidth={2.6} className={`shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
        </button>
        {actions && <div className="flex shrink-0 items-center gap-2 border-t-2 border-ink/10 px-4 py-2 sm:border-t-0 sm:border-l-2 sm:py-0">{actions}</div>}
      </div>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="detail"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.2, 0.8, 0.2, 1] }}
            className="overflow-hidden"
          >
            <FindingDetail finding={finding} rule={rule} regionName={regionName} precedents={precedents} onOpenEvidence={onOpenEvidence} />
          </motion.div>
        )}
      </AnimatePresence>
    </article>
  )
}

function FindingDetail({
  finding,
  rule,
  regionName,
  precedents,
  onOpenEvidence,
}: {
  finding: Finding
  rule: RuleCitation
  regionName?: string
  precedents: Precedent[]
  onOpenEvidence: () => void
}) {
  const frames = finding.evidence.frames
  const review = finding.status === 'needs_review'
  return (
    <div className="grid border-t-2 border-ink md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <button
        type="button"
        onClick={onOpenEvidence}
        className={`group dot-grid relative flex flex-col justify-center gap-5 border-b-2 border-ink p-5 text-left md:border-r-2 md:border-b-0 ${review ? 'bg-sun/25' : 'bg-pink/15'}`}
        aria-label="Open screenshot evidence"
      >
        {frames.map((f, i) => (
          <Polaroid key={i} frame={f} index={i} total={frames.length} />
        ))}
        <span className="sticker absolute right-3 bottom-3 bg-white !py-0.5 text-[11px] opacity-0 transition group-hover:opacity-100 group-focus-visible:opacity-100 print:hidden">
          <Maximize2 size={12} strokeWidth={2.8} aria-hidden="true" /> full screenshot{frames.length > 1 ? 's' : ''}
        </span>
      </button>

      <div className="flex flex-col p-5">
        <p className="text-[15px] leading-relaxed text-ink/80">{finding.explanation}</p>

        <ul className="mt-4 space-y-1.5 text-sm">
          {finding.evidence.observations.map((o) => (
            <li key={o} className="flex gap-2">
              <span className="mt-1 grid h-4 w-4 shrink-0 place-items-center rounded border-2 border-ink bg-lime text-[9px] font-black">✓</span>
              <span>{o}</span>
            </li>
          ))}
        </ul>

        <div className="mt-4 rounded-xl border-2 border-dashed border-ink bg-cream px-3 py-2.5 text-[13px]">
          <span className="font-extrabold">📜 Rule broken{regionName ? ` (${regionName})` : ''}:</span> {rule.source}, {rule.clause}
          {rule.verified === false && <span className="ml-1 text-[11px] font-semibold text-ink/50">(clause to confirm)</span>}
        </div>

        <div className="mt-3 rounded-xl border-2 border-ink bg-lime/40 px-3 py-2.5 text-[13px]">
          <span className="font-extrabold">🛠 Fix:</span> {finding.remediation}
        </div>

        {precedents.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {precedents.map((p) => (
              <a
                key={p.id}
                href={p.sourceUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 rounded-lg border-2 border-ink bg-pink px-2 py-0.5 text-[12px] font-bold"
                title={p.summary}
              >
                💸 Cost {p.company} {p.outcome.split(' (')[0]} · {p.regulator} ↗
              </a>
            ))}
          </div>
        )}

        <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-2 pt-4 text-xs font-medium text-ink/70">
          <span className="flex items-center gap-1.5">
            Found by <AgentTag agent={finding.detectedBy} />
          </span>
          <span className="flex items-center gap-1.5">
            Confidence <ConfidenceMeter value={finding.confidence} threshold={REVIEW_THRESHOLD} />
          </span>
        </div>
      </div>
    </div>
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
