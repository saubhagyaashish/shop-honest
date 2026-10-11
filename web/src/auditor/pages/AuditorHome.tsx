import { ArrowUpRight, Radio, Zap } from 'lucide-react'
import { motion } from 'motion/react'
import { useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { useNavigate } from 'react-router'
import type { PatternId } from '../../shared/contract'
import { PATTERNS } from '../../shared/patterns'
import { useDocumentTitle } from '../../shared/useDocumentTitle'
import { ANSWER_KEY } from '../../store/answerKey'
import { AGENTS, PIPELINE } from '../agents'
import { StoreIllustration } from '../components/StoreIllustration'
import { PATTERN_ICON } from '../patternIcons'
import { SAMPLES } from '../samples'
import type { Sample } from '../samples'
import { auditSource } from '../source'
import { Hero3D } from '../three/Hero3D'
import { AgentAvatar } from '../ui/AgentAvatar'
import { CountUp } from '../ui/CountUp'
import { Marquee } from '../ui/Marquee'
import { Squiggle } from '../ui/Squiggle'
import { Sticker } from '../ui/Sticker'
import { buttonClass, TONE_BG } from '../ui/styles'
import type { Tone } from '../ui/styles'

const TRICKS = ['fake timers', 'sneaky add-ons', 'drip pricing', 'guilt-trip popups', 'pre-ticked boxes', 'inflated MRP', 'frozen stock', 'tiny grey links']
const RECEIPTS = ['screenshot evidence', 'rule citations', 'confidence scores', 'human review queue', 'audit trail', 'trust score']

const CCPA_IDS = (Object.keys(PATTERNS) as PatternId[]).filter((id) => id !== 'misleading_price')
const IN_DEMO = new Set(ANSWER_KEY.a.map((f) => f.patternId))
const TILE_TONES: Tone[] = ['lime', 'pink', 'sun', 'lilac', 'mint', 'peach', 'blue']

function Reveal({ children, className = '', delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 28 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.55, delay, ease: [0.2, 0.8, 0.2, 1] }}
    >
      {children}
    </motion.div>
  )
}

/** Real stores the general navigator can audit (the API's allowlist). Fill the URL box; "Scan it" runs a live audit. */
const REAL_STORES = [
  {
    label: 'AutomationExercise · Blue Top',
    url: 'https://automationexercise.com/product_details/1',
    note: 'A real store built for automation practice; checkout needs a login, so the audit stops there.',
  },
  {
    label: 'Flipkart · boAt Airdopes (best effort)',
    url: 'https://www.flipkart.com/boat-airdopes-71-40-h-battery-enx-tech-low-latency-stream-ad-free-music-via-app-bluetooth/p/itm63134e79353d1',
    note: 'A real retailer. It may refuse automated browsers; the audit says so instead of getting around it.',
  },
]

export function AuditorHome() {
  const navigate = useNavigate()
  const [url, setUrl] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [starting, setStarting] = useState(false)
  useDocumentTitle('Shop Honest · dark patterns, caught in 4K')

  async function run(target: string, live = false) {
    setError(null)
    setStarting(true)
    try {
      const auditId = await auditSource.start(target, { live })
      navigate(`/audit/${auditId}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start the audit.')
      setStarting(false)
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (url.trim()) void run(url.trim())
  }

  return (
    <main>
      {/* Hero */}
      <section className="mx-auto grid max-w-[1240px] items-center gap-8 px-4 pt-10 pb-14 sm:px-6 lg:grid-cols-[1.05fr_1fr] lg:pt-16">
        <div>
          <motion.div
            className="flex flex-wrap gap-2.5"
            initial="hidden"
            animate="show"
            variants={{ show: { transition: { staggerChildren: 0.08 } } }}
          >
            {[
              <Sticker key="a" tone="white" rotate={-3}><IndiaFlag /> CCPA-ready</Sticker>,
              <Sticker key="b" tone="lilac" rotate={2}>🤖 multi-agent AI</Sticker>,
              <Sticker key="c" tone="mint" rotate={-1}>🧾 receipts included</Sticker>,
            ].map((s) => (
              <motion.span key={s.key} variants={{ hidden: { opacity: 0, y: 10, scale: 0.8 }, show: { opacity: 1, y: 0, scale: 1 } }}>
                {s}
              </motion.span>
            ))}
          </motion.div>

          <motion.h1
            className="mt-6 font-display text-[52px] leading-[0.92] font-extrabold tracking-[-0.03em] sm:text-[76px] lg:text-[88px]"
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: [0.2, 0.8, 0.2, 1] }}
          >
            Dark patterns?
            <br />
            Caught in{' '}
            <span className="relative inline-block">
              <span className="relative z-10 inline-block -rotate-2 rounded-2xl border-[3px] border-ink bg-lime px-3 shadow-brutal">4K.</span>
              <Squiggle className="absolute -bottom-5 left-0 h-6 w-full" />
            </span>
          </motion.h1>

          <motion.p
            className="mt-8 max-w-xl text-lg leading-relaxed text-ink/75"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.25 }}
          >
            Shop Honest sends AI agents shopping. They walk product → cart → checkout → payment like a real customer and hand you the receipts: a screenshot, the rule broken and a confidence score for every trick.
          </motion.p>

          <motion.form
            onSubmit={onSubmit}
            className="mt-7 flex max-w-xl flex-col gap-3 sm:flex-row"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35 }}
          >
            <label className="sr-only" htmlFor="target-url">Product URL</label>
            <input
              id="target-url"
              type="url"
              inputMode="url"
              required
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="paste a product URL…"
              className="brutal h-14 w-full rounded-2xl bg-white px-5 font-mono text-sm outline-none placeholder:text-ink/40 focus:shadow-brutal-lg sm:flex-1"
            />
            <button type="submit" disabled={starting} className={buttonClass('lime', 'lg')}>
              Scan it <Zap size={18} strokeWidth={2.6} aria-hidden="true" />
            </button>
          </motion.form>
          {error && <p className="brutal-sm mt-4 max-w-xl rounded-xl bg-sun px-4 py-2.5 text-sm font-medium">{error}</p>}
          <a href="#samples" className="mt-4 inline-block text-sm font-semibold underline decoration-pink decoration-[3px] underline-offset-4">
            No URL handy? Audit a sample store ↓
          </a>
          {auditSource.mode === 'live' && (
            <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
              <span className="font-semibold text-ink/70">Or a real store, logged out:</span>
              {REAL_STORES.map((s) => (
                <button
                  key={s.url}
                  type="button"
                  onClick={() => setUrl(s.url)}
                  title={s.note}
                  className="rounded-lg border-2 border-ink bg-white px-2.5 py-1 text-xs font-bold hover:bg-sun"
                >
                  {s.label}
                </button>
              ))}
            </div>
          )}
        </div>

        <motion.div
          className="relative mx-auto aspect-[52/44] w-full max-w-[600px]"
          initial={{ opacity: 0, scale: 0.92 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.7, delay: 0.15, ease: [0.2, 0.8, 0.2, 1] }}
        >
          <div className="absolute inset-[8%] rounded-full border-[3px] border-ink bg-lilac shadow-brutal-lg" aria-hidden="true" />
          <div className="absolute inset-[8%] rounded-full bg-[radial-gradient(rgb(17_17_17/0.18)_1.2px,transparent_1.4px)] [background-size:14px_14px]" aria-hidden="true" />
          <div className="absolute inset-0">
            <Hero3D />
          </div>
        </motion.div>
      </section>

      {/* Ticker bands */}
      <div className="relative py-6" aria-label="Tricks Shop Honest catches">
        <Marquee items={TRICKS} tone="lime" className="relative z-10 -rotate-2" />
        <Marquee items={RECEIPTS} tone="pink" reverse className="mt-4 rotate-1" />
      </div>

      {/* Samples */}
      <section id="samples" className="mx-auto max-w-[1240px] scroll-mt-24 px-4 py-16 sm:px-6">
        <Reveal>
          <SectionHeading kicker="try it now" title="Pick a store to audit 👇" note="Same product, same journey. One is rigged, one is honest, one hides checkout behind a sign-in." />
        </Reveal>
        <div className="mt-10 grid gap-8 md:grid-cols-2 lg:grid-cols-3">
          {SAMPLES.map((s, i) => (
            <Reveal key={s.key} delay={i * 0.1}>
              <SampleCard
                sample={s}
                index={i}
                disabled={starting}
                onRun={() => run(window.location.origin + s.path)}
                onRunLive={auditSource.mode === 'live' ? () => run(window.location.origin + s.path, true) : undefined}
              />
            </Reveal>
          ))}
        </div>
      </section>

      {/* The 13 */}
      <section className="border-y-2 border-ink bg-white py-16">
        <div className="mx-auto max-w-[1240px] px-4 sm:px-6">
          <Reveal>
            <SectionHeading
              kicker="the rulebook"
              title="The 13 banned patterns"
              note="India’s CCPA named them in 2023 and told platforms to self-audit. Hover a card to flip it. The demo store hides the ones marked “in demo”."
            />
          </Reveal>
          <div className="mt-10 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-7">
            {[...CCPA_IDS, 'misleading_price' as const].map((id, i) => (
              <Reveal key={id} delay={(i % 7) * 0.04}>
                <PatternTile id={id} index={i} />
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Squad */}
      <section className="mx-auto max-w-[1240px] px-4 py-16 sm:px-6">
        <Reveal>
          <SectionHeading kicker="how it works" title="Meet the squad 🫡" note="Six specialist agents, one audit. Each does one job and hands off to the next." />
        </Reveal>
        <div className="relative mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-6">
          <motion.svg
            className="pointer-events-none absolute top-12 left-[6%] hidden h-6 w-[88%] lg:block"
            viewBox="0 0 1000 24"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <motion.path
              d="M0 12 H1000"
              stroke="#111"
              strokeWidth="3"
              strokeDasharray="10 10"
              fill="none"
              initial={{ pathLength: 0 }}
              whileInView={{ pathLength: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 1.4, ease: 'easeInOut' }}
            />
          </motion.svg>
          {PIPELINE.map((agent, i) => (
            <Reveal key={agent} delay={i * 0.08} className="relative">
              <article className="brutal h-full rounded-2xl bg-white p-4">
                <div className="flex items-center justify-between">
                  <AgentAvatar agent={agent} size="lg" />
                  <span className="font-display text-3xl font-extrabold text-ink/15">0{i + 1}</span>
                </div>
                <div className="mt-3 font-display text-lg font-extrabold">{AGENTS[agent].label}</div>
                <p className="mt-1 text-[15px] leading-snug font-semibold">{AGENTS[agent].vibe}</p>
                <p className="mt-2 text-[13px] leading-snug text-ink/60">{AGENTS[agent].job}</p>
              </article>
            </Reveal>
          ))}
        </div>
      </section>

      {/* Stats */}
      <section className="mx-auto max-w-[1240px] px-4 pb-16 sm:px-6">
        <Reveal>
          <div className="brutal grid gap-6 rounded-3xl bg-ink p-8 text-cream sm:grid-cols-2 lg:grid-cols-4">
            <Stat value={13} label="banned patterns covered by the rulebook" />
            <Stat value={5} label="journey steps walked, like a real shopper" />
            <Stat value={100} suffix="%" label="of findings ship with a screenshot + rule" />
            <Stat value={0} label="accusations without receipts" />
          </div>
        </Reveal>
      </section>

      {/* Footer */}
      <footer className="overflow-hidden border-t-2 border-ink bg-white">
        <div className="mx-auto max-w-[1240px] px-4 pt-10 sm:px-6">
          <div className="font-display text-[15vw] leading-[0.85] font-extrabold tracking-[-0.04em] whitespace-nowrap text-outline select-none lg:text-[185px]" aria-hidden="true">
            shop honest
          </div>
          <p className="max-w-3xl py-8 text-xs leading-relaxed text-ink/60">
            Findings cite the CCPA Guidelines for Prevention and Regulation of Dark Patterns, 2023, and the Consumer Protection Act, 2019. Reports support a compliance review; they are not legal advice.
            {auditSource.mode === 'mock' && ' This demo build replays real captures of the two sample stores through the same event stream the live agents will use.'}{' '}
            Built for the Google Cloud AI Builder Cup 2026.
          </p>
        </div>
      </footer>
    </main>
  )
}

function IndiaFlag() {
  return (
    <svg viewBox="0 0 18 12" className="h-3 w-[18px] rounded-[2px] border border-ink" aria-label="India">
      <rect width="18" height="4" fill="#ff9933" />
      <rect y="4" width="18" height="4" fill="#ffffff" />
      <rect y="8" width="18" height="4" fill="#138808" />
      <circle cx="9" cy="6" r="1.4" fill="none" stroke="#000080" strokeWidth="0.6" />
    </svg>
  )
}

function SectionHeading({ kicker, title, note }: { kicker: string; title: string; note?: string }) {
  return (
    <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
      <div>
        <Sticker tone="sun" rotate={-2}>{kicker}</Sticker>
        <h2 className="mt-3 font-display text-4xl font-extrabold tracking-tight sm:text-5xl">{title}</h2>
      </div>
      {note && <p className="max-w-md text-[15px] leading-relaxed text-ink/70">{note}</p>}
    </div>
  )
}

const CARD_BG = { pink: 'bg-pink', lime: 'bg-lime', sun: 'bg-sun' } as Partial<Record<Tone, string>>

function SampleCard({
  sample,
  index,
  onRun,
  onRunLive,
  disabled,
}: {
  sample: Sample
  index: number
  onRun: () => void
  onRunLive?: () => void
  disabled: boolean
}) {
  const tilt = index % 2 === 0 ? -0.8 : 0.8
  return (
    <motion.article
      className="brutal relative flex h-full flex-col rounded-3xl bg-white"
      whileHover={{ y: -6, rotate: tilt }}
      transition={{ type: 'spring', stiffness: 300, damping: 18 }}
    >
      <div className={`rounded-t-[22px] border-b-2 border-ink p-6 ${CARD_BG[sample.tone] ?? 'bg-cream'}`}>
        <StoreIllustration rigged={sample.storeId === 'a'} locked={sample.key === 'store-c'} />
      </div>
      <span className="absolute -top-4 right-6">
        <Sticker tone={sample.tone} rotate={tilt * -7} className="!px-4 !py-1.5 !text-sm">
          {sample.badge}
        </Sticker>
      </span>
      <div className="flex flex-1 flex-col p-6">
        <h3 className="font-display text-2xl font-extrabold tracking-tight">{sample.name}</h3>
        <p className="mt-1.5 text-[15px] leading-relaxed text-ink/70">{sample.description}</p>
        <ul className="mt-4 flex flex-wrap gap-2">
          {sample.expectations.map((e) => (
            <li key={e} className="rounded-lg border-2 border-ink bg-cream px-2 py-0.5 text-xs font-semibold">
              {e}
            </li>
          ))}
        </ul>
        <div className="mt-auto flex flex-wrap items-center gap-3 pt-6">
          <button type="button" disabled={disabled} onClick={onRun} className={buttonClass('ink', 'md')}>
            Scan it <Zap size={16} strokeWidth={2.6} aria-hidden="true" />
          </button>
          {onRunLive && (
            <button type="button" disabled={disabled} onClick={onRunLive} className={buttonClass('lime', 'md')} title="A fresh audit by the agents, not a recording">
              Run live <Radio size={16} strokeWidth={2.6} aria-hidden="true" />
            </button>
          )}
          <a href={sample.path} target="_blank" rel="noreferrer" className={buttonClass('white', 'md')}>
            Peek store <ArrowUpRight size={16} strokeWidth={2.6} aria-hidden="true" />
          </a>
        </div>
      </div>
    </motion.article>
  )
}

function PatternTile({ id, index }: { id: PatternId; index: number }) {
  const p = PATTERNS[id]
  const Icon = PATTERN_ICON[id]
  const bonus = id === 'misleading_price'
  const tone = bonus ? 'white' : TILE_TONES[index % TILE_TONES.length]
  return (
    <div className="flip-card aspect-[4/5] w-full" tabIndex={0} aria-label={`${p.name}: ${p.description}`}>
      <div className="flip-card-inner relative h-full w-full">
        <div className={`flip-card-face brutal absolute inset-0 flex flex-col rounded-2xl p-3.5 ${TONE_BG[tone]} ${bonus ? 'border-dashed' : ''}`}>
          <div className="flex items-start justify-between">
            <span className="font-display text-sm font-extrabold opacity-60">{bonus ? '+1' : String(index + 1).padStart(2, '0')}</span>
            {IN_DEMO.has(id) && <span className="rounded-md border-2 border-ink bg-white px-1.5 text-[10px] font-extrabold text-ink uppercase">in demo</span>}
          </div>
          <span className="mt-auto mb-3 grid h-12 w-12 place-items-center rounded-xl border-2 border-ink bg-white text-ink">
            <Icon size={24} strokeWidth={2.4} aria-hidden="true" />
          </span>
          <div className="font-display text-[17px] leading-tight font-extrabold">{p.name}</div>
          {bonus && <div className="mt-0.5 text-[11px] font-semibold opacity-70">Consumer Protection Act</div>}
        </div>
        <div className="flip-card-face flip-card-back brutal absolute inset-0 flex flex-col rounded-2xl bg-ink p-3.5 text-cream">
          <div className="font-display text-sm font-extrabold text-lime">{p.name}</div>
          <p className="mt-2 text-[13px] leading-snug">{p.description}</p>
          <div className="mt-auto text-[10px] font-semibold text-cream/60">{p.rule.clause}</div>
        </div>
      </div>
    </div>
  )
}

function Stat({ value, label, suffix = '' }: { value: number; label: string; suffix?: string }) {
  return (
    <div>
      <CountUp value={value} suffix={suffix} className="font-display text-6xl font-extrabold text-lime" />
      <p className="mt-1 text-sm leading-snug text-cream/75">{label}</p>
    </div>
  )
}
