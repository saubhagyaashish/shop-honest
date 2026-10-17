import { ArrowLeft, Check, RotateCcw } from 'lucide-react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import type { AgentName } from '../../shared/contract'
import { AGENTS, PIPELINE } from '../agents'
import { BOOT_LINES, bootLine, waitingPhase } from '../launch'
import { AgentAvatar } from '../ui/AgentAvatar'
import { Sticker } from '../ui/Sticker'
import { buttonClass } from '../ui/styles'

export type LaunchState = { kind: 'waiting' } | { kind: 'ready' } | { kind: 'error'; message: string }

/** How long each agent's one-liner stays up while the squad waits. */
const VIBE_EVERY_MS = 1400

/**
 * The wait between "Scan it" and the audit page (launch.ts): a bot powering up a server, then the agents assembling,
 * looping until the server answers. Nothing is ticked off before it has: the boot lines only cycle while waiting.
 */
export function LaunchSequence({
  target,
  startedAt,
  state,
  onRetry,
  onClose,
}: {
  target: string
  /** performance.now() when the shopper clicked. */
  startedAt: number
  state: LaunchState
  onRetry: () => void
  onClose: () => void
}) {
  const still = !!useReducedMotion()
  const [elapsed, setElapsed] = useState(0)
  const retry = useRef<HTMLButtonElement>(null)
  const card = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (state.kind !== 'waiting') return
    const tick = setInterval(() => setElapsed(performance.now() - startedAt), 250)
    return () => clearInterval(tick)
  }, [state.kind, startedAt])

  useEffect(() => {
    if (state.kind === 'error') retry.current?.focus()
    else card.current?.focus()
  }, [state.kind])

  useEffect(() => {
    if (state.kind !== 'error') return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [state.kind, onClose])

  const phase = state.kind === 'waiting' ? waitingPhase(elapsed) : state.kind
  const scene = phase === 'booting' ? 'boot' : phase === 'error' ? 'error' : 'squad'
  const typing = bootLine(elapsed)
  const current = PIPELINE[Math.floor(elapsed / VIBE_EVERY_MS) % PIPELINE.length]
  const seconds = Math.floor(elapsed / 1000)

  const sticker =
    state.kind === 'ready' ? (
      <Sticker tone="lime" rotate={-4}>LET’S GO 🚀</Sticker>
    ) : state.kind === 'error' ? (
      <Sticker tone="sun" rotate={-3}>HOLD UP ✋</Sticker>
    ) : (
      <Sticker tone="pink" rotate={-3}>LAUNCHING 🚀</Sticker>
    )
  const title = state.kind === 'ready' ? 'Agents ready' : state.kind === 'error' ? 'Couldn’t start the audit' : 'Starting your audit'
  const status =
    state.kind === 'error'
      ? state.message
      : state.kind === 'ready'
        ? 'Ready. Opening the audit.'
        : phase === 'slow'
          ? 'The server is waking up. This takes about 10 seconds.'
          : 'Starting the audit…'

  return (
    <motion.div
      className="fixed inset-0 z-50 overflow-y-auto bg-ink/60 backdrop-blur-[2px]"
      onClick={state.kind === 'error' ? onClose : undefined}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
    >
      {/* Flex, not grid: a grid track would grow to the long URL instead of truncating it on a phone. */}
      <div className="flex min-h-full items-center justify-center p-4">
        <motion.div
          ref={card}
          role="dialog"
          aria-modal="true"
          aria-labelledby="launch-title"
          tabIndex={-1}
          className="brutal relative w-full max-w-[560px] rounded-3xl bg-cream p-5 outline-none sm:p-6"
          onClick={(e) => e.stopPropagation()}
          initial={still ? false : { y: 24, scale: 0.96, opacity: 0 }}
          animate={{ y: 0, scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 360, damping: 28 }}
        >
          <div className="flex items-center justify-between gap-3">
            <motion.span key={state.kind} initial={still ? false : { scale: 1.6, rotate: -14, opacity: 0 }} animate={{ scale: 1, rotate: 0, opacity: 1 }}>
              {sticker}
            </motion.span>
            {state.kind === 'waiting' && (
              <span className="font-mono text-xs font-semibold text-ink/55 tabular-nums" aria-hidden="true">
                {seconds} s
              </span>
            )}
          </div>
          <h2 id="launch-title" className="mt-3 font-display text-[26px] leading-tight font-extrabold">
            {title}
          </h2>
          <p className="mt-0.5 truncate font-mono text-xs text-ink/60" title={target}>
            {target.replace(/^https?:\/\//, '')}
          </p>

          {/* The stage: a server booting, then the squad (jumping once ready), or a puzzled bot. */}
          <div className="mt-5 grid h-[132px] place-items-center rounded-2xl border-2 border-ink bg-white dot-grid">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={scene}
                initial={still ? false : { opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={still ? undefined : { opacity: 0, y: -10 }}
                transition={{ duration: 0.25 }}
              >
                {scene === 'boot' && <Booting still={still} />}
                {scene === 'squad' && <Squad still={still} ready={state.kind === 'ready'} current={current} />}
                {scene === 'error' && <Puzzled still={still} />}
              </motion.div>
            </AnimatePresence>
          </div>

          {scene === 'squad' && state.kind === 'waiting' && (
            <p className="mt-2 h-5 text-center text-sm font-semibold text-ink/70">
              <span className="font-extrabold">{AGENTS[current].label}:</span> {AGENTS[current].vibe}
            </p>
          )}

          {/* What starting involves. While waiting the lines only cycle; they're ticked once the server has answered. */}
          {state.kind !== 'error' && (
            <ol className="mt-4 space-y-1 rounded-2xl bg-ink px-4 py-3 font-mono text-[12.5px] text-cream" aria-hidden="true">
              {BOOT_LINES.map((line, i) => {
                const done = state.kind === 'ready'
                const live = !done && (still || i === typing)
                return (
                  <li key={line} className={`flex items-center gap-2 transition-opacity ${done || live ? 'opacity-100' : 'opacity-35'}`}>
                    {done ? <Check size={13} strokeWidth={3} className="shrink-0 text-mint" /> : <span className="w-[13px] shrink-0 text-lime">›</span>}
                    <span className="truncate">{line}</span>
                    {live && !still && <span className="h-3.5 w-[7px] shrink-0 bg-lime [animation:blink_1s_steps(2,start)_infinite]" />}
                  </li>
                )
              })}
            </ol>
          )}

          {phase === 'slow' && (
            <p className="brutal-sm mt-3 rounded-xl bg-sun px-3.5 py-2 text-[13px] font-semibold">
              First audit after a quiet spell: the server is waking up, about 10 s.
            </p>
          )}

          {state.kind === 'error' && (
            <>
              <p className="brutal-sm mt-4 rounded-xl bg-sun px-4 py-2.5 text-sm font-medium">{state.message}</p>
              <div className="mt-4 flex flex-wrap gap-3">
                <button ref={retry} type="button" onClick={onRetry} className={buttonClass('lime', 'md')}>
                  <RotateCcw size={16} strokeWidth={2.6} aria-hidden="true" /> Try again
                </button>
                <button type="button" onClick={onClose} className={buttonClass('white', 'md')}>
                  <ArrowLeft size={16} strokeWidth={2.6} aria-hidden="true" /> Back
                </button>
              </div>
            </>
          )}

          <p className="sr-only" aria-live="polite">
            {status}
          </p>
        </motion.div>
      </div>
    </motion.div>
  )
}

/** The Navigator plugged into a little server rack, power running down the cable, lights blinking. */
function Booting({ still }: { still: boolean }) {
  return (
    <div className="flex items-center gap-1">
      <motion.span animate={still ? undefined : { rotate: [-6, 6, -6] }} transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut' }}>
        <AgentAvatar agent="navigator" size="lg" />
      </motion.span>
      <span className="relative mx-1 block w-14 border-t-2 border-dashed border-ink" aria-hidden="true">
        {!still && (
          <motion.span
            className="absolute -top-[6px] -left-1 h-2.5 w-2.5 rounded-full border-2 border-ink bg-lime"
            animate={{ x: [0, 52] }}
            transition={{ duration: 0.9, repeat: Infinity, ease: 'easeIn' }}
          />
        )}
      </span>
      <ServerRack still={still} />
    </div>
  )
}

const LEDS = ['bg-lime', 'bg-sun', 'bg-pink']

function ServerRack({ still }: { still: boolean }) {
  return (
    <div className="brutal-sm w-28 rounded-xl bg-ink p-1.5" aria-hidden="true">
      {[0, 1, 2].map((row) => (
        <div key={row} className="mb-1 flex items-center gap-1.5 rounded-md border-2 border-ink bg-cream px-1.5 py-1 last:mb-0">
          {LEDS.map((led, i) => (
            <motion.span
              key={led}
              className={`h-2 w-2 rounded-full border border-ink ${led}`}
              animate={still ? undefined : { opacity: [1, 0.15, 1] }}
              transition={{ duration: 0.9, repeat: Infinity, delay: (row * LEDS.length + i) * 0.13 }}
            />
          ))}
          <span className="ml-auto h-1.5 w-7 rounded-full bg-ink/25" />
        </div>
      ))}
    </div>
  )
}

/** The agents popping in one by one; the one whose line is showing stands up. Once ready, they all jump. */
function Squad({ still, ready, current }: { still: boolean; ready: boolean; current: AgentName }) {
  return (
    <div className="flex flex-wrap justify-center gap-2 px-3">
      {PIPELINE.map((agent, i) => (
        <motion.span
          key={agent}
          initial={still ? false : { scale: 0, opacity: 0 }}
          animate={
            ready && !still
              ? { scale: 1, opacity: 1, y: [0, -16, 0] }
              : { scale: !ready && agent === current && !still ? 1.15 : 1, opacity: 1, y: !ready && agent === current && !still ? -4 : 0 }
          }
          transition={
            ready
              ? { duration: 0.45, delay: i * 0.05 }
              : { type: 'spring', stiffness: 420, damping: 18, delay: still ? 0 : i * 0.12 }
          }
        >
          <AgentAvatar agent={agent} size="md" />
        </motion.span>
      ))}
    </div>
  )
}

/** Something stopped the start: the Navigator, puzzled. */
function Puzzled({ still }: { still: boolean }) {
  return (
    <div className="relative">
      <AgentAvatar agent="navigator" size="lg" />
      <motion.span
        className="absolute -top-4 -right-5"
        animate={still ? undefined : { rotate: [-8, 8, -8] }}
        transition={{ duration: 1, repeat: Infinity, ease: 'easeInOut' }}
      >
        <Sticker tone="sun">?</Sticker>
      </motion.span>
    </div>
  )
}
