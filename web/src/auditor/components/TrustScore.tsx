import { motion } from 'motion/react'
import { BAND_LABEL, BAND_VIBE, scoreBand } from '../score'
import type { ScoreBand, Verdict } from '../score'
import { CountUp } from '../ui/CountUp'
import { Sticker } from '../ui/Sticker'
import type { Tone } from '../ui/styles'

const BAND_STROKE: Record<ScoreBand, string> = { trustworthy: '#c6f432', concerns: '#ffd23f', deceptive: '#ff5ca8' }
const BAND_TONE: Record<ScoreBand, Tone> = { trustworthy: 'lime', concerns: 'sun', deceptive: 'pink' }
// A verdict that says less than the band ("NEEDS A HUMAN") colours the arc too, so a high score with claims waiting isn't green.
const VERDICT_STROKE: Partial<Record<Verdict['tone'], string>> = { sun: BAND_STROKE.concerns, pink: BAND_STROKE.deceptive }
const ARC = 'M24 112 A88 88 0 0 1 200 112'

/**
 * Chunky half-ring gauge, 0–100, with the verdict sticker. `null`: nothing could be checked, so no score. `verdict`
 * replaces the band's sticker and label when the score alone would say more than the audit saw (see verdictOf).
 */
export function TrustScore({ score, size = 'md', verdict }: { score: number | null; size?: 'sm' | 'md'; verdict?: Verdict }) {
  const band = scoreBand(score ?? 0)
  const vibe = verdict?.vibe ?? BAND_VIBE[band]
  const label = verdict?.label ?? BAND_LABEL[band]
  const sm = size === 'sm'
  const stroke = (verdict && VERDICT_STROKE[verdict.tone]) ?? BAND_STROKE[band]
  return (
    <div className="flex flex-col items-center">
      <div className={`relative ${sm ? 'w-48' : 'w-60'}`}>
        <svg
          viewBox="0 0 224 128"
          className="w-full"
          role="img"
          aria-label={score === null ? 'Not rated: nothing could be checked' : `Trust score ${score} out of 100: ${label}`}
        >
          <path d={ARC} fill="none" stroke="#111" strokeWidth="30" strokeLinecap="round" />
          <path d={ARC} fill="none" stroke="#fff8ec" strokeWidth="22" strokeLinecap="round" />
          {score !== null && score > 0 && (
            <motion.path
              d={ARC}
              fill="none"
              stroke={stroke}
              strokeWidth="22"
              strokeLinecap="round"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: score / 100 }}
              transition={{ duration: 1.1, ease: [0.2, 0.8, 0.2, 1] }}
            />
          )}
        </svg>
        <div className="absolute inset-x-0 bottom-0 text-center">
          {score === null ? (
            <div className={`font-display leading-none font-extrabold text-ink/40 ${sm ? 'text-5xl' : 'text-6xl'}`}>–</div>
          ) : (
            <CountUp value={score} className={`font-display leading-none font-extrabold ${sm ? 'text-5xl' : 'text-6xl'}`} />
          )}
          <div className="text-xs font-bold text-ink/50">{score === null ? 'not rated' : 'out of 100'}</div>
        </div>
      </div>
      <motion.div
        className={sm ? 'mt-3' : 'mt-4'}
        initial={{ scale: 2, rotate: -20, opacity: 0 }}
        animate={{ scale: 1, rotate: 0, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 260, damping: 14, delay: 0.9 }}
      >
        <Sticker
          tone={score === null ? 'white' : (verdict?.tone ?? BAND_TONE[band])}
          rotate={-5}
          className={`font-display ${sm ? '!px-4 !py-1.5 !text-xl' : '!px-5 !py-2 !text-2xl'}`}
        >
          {score === null ? 'NOT CHECKED 🤷' : vibe}
        </Sticker>
      </motion.div>
      <div className={`${sm ? 'mt-2' : 'mt-3'} text-xs font-bold tracking-wider text-ink/60 uppercase`}>
        {score === null ? 'Couldn’t check' : label}
      </div>
    </div>
  )
}
