import { motion, AnimatePresence } from 'motion/react'
import { useEffect, useRef } from 'react'
import type { AgentName, Finding } from '../../shared/contract'
import { PATTERNS } from '../../shared/patterns'
import { AGENTS } from '../agents'
import { TONE_BG } from '../ui/styles'

interface Props {
  url?: string
  screenshotUrl?: string
  findings: Finding[]
  latestFindingId?: string
  busy: boolean
  /** Shown over the page when the agent was stopped, e.g. "Sign-in required". */
  blockedReason?: string
}

/** The agent's browser: latest screenshot, a scan sweep, and a stamp on every catch. */
export function LiveBrowser({ url, screenshotUrl, findings, latestFindingId, busy, blockedReason }: Props) {
  const scroller = useRef<HTMLDivElement>(null)
  const image = useRef<HTMLImageElement>(null)

  const marks = findings.flatMap((f) =>
    f.evidence.frames.filter((fr) => fr.screenshotUrl === screenshotUrl && fr.bbox).map((fr) => ({ finding: f, bbox: fr.bbox! })),
  )
  const latestMark = marks.find((m) => m.finding.id === latestFindingId)

  useEffect(() => {
    const el = scroller.current
    const img = image.current
    if (!el || !img || !latestMark) return
    el.scrollTo({ top: Math.max(0, latestMark.bbox.y * img.clientHeight - el.clientHeight / 3), behavior: 'smooth' })
  }, [latestMark])

  useEffect(() => {
    scroller.current?.scrollTo({ top: 0 })
  }, [screenshotUrl])

  const cursorAgent: AgentName = latestMark?.finding.detectedBy ?? 'navigator'
  const cursorAt = latestMark
    ? { left: `${(latestMark.bbox.x + latestMark.bbox.w * 0.85) * 100}%`, top: `${(latestMark.bbox.y + latestMark.bbox.h * 0.75) * 100}%` }
    : { left: '62%', top: '9%' }

  return (
    <div className="brutal flex max-h-full min-h-0 flex-col overflow-hidden rounded-2xl bg-white">
      <div className="flex items-center gap-3 border-b-2 border-ink bg-cream px-3 py-2.5">
        <div className="flex gap-1.5" aria-hidden="true">
          <span className="h-3 w-3 rounded-full border-2 border-ink bg-pink" />
          <span className="h-3 w-3 rounded-full border-2 border-ink bg-sun" />
          <span className="h-3 w-3 rounded-full border-2 border-ink bg-lime" />
        </div>
        <div className="flex min-w-0 flex-1 items-center rounded-lg border-2 border-ink bg-white px-2.5 py-1 font-mono text-xs">
          <span className="truncate">{url ?? 'about:blank'}</span>
        </div>
        {busy && (
          <span className="sticker hidden bg-lime !py-0.5 text-[11px] sm:inline-flex">
            <span className="h-2 w-2 animate-blink rounded-full bg-ink" /> agent browsing
          </span>
        )}
      </div>
      <div ref={scroller} className="dot-grid relative min-h-0 overflow-y-auto bg-cream">
        {screenshotUrl ? (
          <div className="relative">
            <motion.img
              ref={image}
              key={screenshotUrl}
              src={screenshotUrl}
              alt="What the agent sees"
              className="block w-full"
              initial={{ opacity: 0.2, filter: 'blur(4px)' }}
              animate={{ opacity: 1, filter: 'blur(0px)' }}
              transition={{ duration: 0.4 }}
            />
            {busy && (
              <div
                key={`scan-${screenshotUrl}`}
                className="pointer-events-none absolute inset-x-0 h-20 animate-scan bg-gradient-to-b from-transparent via-lime/55 to-transparent"
                aria-hidden="true"
              >
                <div className="absolute inset-x-0 top-1/2 h-[3px] bg-lime shadow-[0_0_12px_#c6f432]" />
              </div>
            )}
            {marks.map(({ finding, bbox }) => {
              const review = finding.status === 'needs_review'
              return (
                <div
                  key={finding.id}
                  className={`pointer-events-none absolute rounded-md border-[3px] ${review ? 'border-sun bg-sun/15' : 'border-pink bg-pink/15'} ${finding.id === latestFindingId ? 'animate-flash' : ''}`}
                  style={{ left: `${bbox.x * 100}%`, top: `${bbox.y * 100}%`, width: `${bbox.w * 100}%`, height: `${bbox.h * 100}%` }}
                >
                  <motion.span
                    className={`sticker absolute -top-7 left-0 !py-0 text-[11px] ${review ? 'bg-sun' : 'bg-pink'}`}
                    initial={{ scale: 2.4, rotate: -16, opacity: 0 }}
                    animate={{ scale: 1, rotate: -4, opacity: 1 }}
                    transition={{ type: 'spring', stiffness: 420, damping: 16 }}
                  >
                    {review ? 'HMM 🤔' : 'CAUGHT 🚩'} · {PATTERNS[finding.patternId].name}
                  </motion.span>
                </div>
              )
            })}
            {blockedReason && (
              <div className="absolute inset-0 grid place-items-center bg-ink/35 backdrop-blur-[2px]">
                <motion.div
                  className="brutal rounded-2xl bg-sun px-5 py-4 text-center"
                  initial={{ scale: 0.6, rotate: -8, opacity: 0 }}
                  animate={{ scale: 1, rotate: -2, opacity: 1 }}
                  transition={{ type: 'spring', stiffness: 300, damping: 16 }}
                >
                  <div className="font-display text-xl font-extrabold">🔒 {blockedReason}</div>
                  <div className="mt-1 text-[13px] font-semibold">The agent stopped here. Later steps are not audited.</div>
                </motion.div>
              </div>
            )}
            <AnimatePresence>
              {busy && !blockedReason && (
                <motion.div
                  className="pointer-events-none absolute z-10"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1, ...cursorAt }}
                  exit={{ opacity: 0 }}
                  transition={{ type: 'spring', stiffness: 90, damping: 16 }}
                  aria-hidden="true"
                >
                  <svg viewBox="0 0 24 24" className="h-7 w-7 drop-shadow-[2px_2px_0_#111]">
                    <path d="M3 2l17 8-7.5 2.2L10 20 3 2Z" fill="#111" stroke="#fff" strokeWidth="1.6" strokeLinejoin="round" />
                  </svg>
                  <span className={`sticker ml-5 -mt-1 !py-0 text-[11px] ${TONE_BG[AGENTS[cursorAgent].tone]}`}>{AGENTS[cursorAgent].label}</span>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ) : (
          <div className="grid min-h-72 place-items-center p-8 text-center">
            <div>
              <motion.div className="mx-auto h-12 w-12 rounded-full border-4 border-ink border-t-lime" animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }} />
              <p className="mt-4 font-display text-lg font-extrabold">{busy ? 'Opening the page…' : 'Waiting for the agent…'}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
