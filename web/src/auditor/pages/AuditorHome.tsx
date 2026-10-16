import { ArrowUp, ArrowUpRight, FlaskConical, Presentation, Radio, Sparkles, User, Zap } from 'lucide-react'
import { motion } from 'motion/react'
import { Fragment, useEffect, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router'
import type { AgentName, PatternId } from '../../shared/contract'
import { PATTERNS } from '../../shared/patterns'
import { useDocumentTitle } from '../../shared/useDocumentTitle'
import { ANSWER_KEY } from '../../store/answerKey'
import { AGENTS, PIPELINE } from '../agents'
import { StoreIllustration } from '../components/StoreIllustration'
import { PATTERN_ICON } from '../patternIcons'
import { SAMPLES } from '../samples'
import type { Sample } from '../samples'
import { REPO_URL } from '../links'
import { auditSource } from '../source'
import { Hero3D } from '../three/Hero3D'
import { AgentAvatar } from '../ui/AgentAvatar'
import { CountUp } from '../ui/CountUp'
import { Marquee } from '../ui/Marquee'
import { Squiggle } from '../ui/Squiggle'
import { GithubMark } from '../ui/GithubMark'
import { Sticker } from '../ui/Sticker'
import { buttonClass, TONE_BG } from '../ui/styles'
import type { Tone } from '../ui/styles'

const TRICKS = ['fake timers', 'sneaky add-ons', 'drip pricing', 'guilt-trip popups', 'pre-ticked boxes', 'inflated MRP', 'frozen stock', 'tiny grey links']
const RECEIPTS = ['screenshot evidence', 'rule citations', 'confidence scores', 'human review queue', 'audit trail', 'trust score']

const CCPA_IDS = (Object.keys(PATTERNS) as PatternId[]).filter((id) => id !== 'misleading_price')
const IN_DEMO = new Set(ANSWER_KEY.a.map((f) => f.patternId))
const TILE_TONES: Tone[] = ['lime', 'pink', 'sun', 'lilac', 'mint', 'peach', 'blue']
// The squad in the order it works, then the person who reviews and decides: two even rows of four.
const SQUAD_ROWS: (AgentName | 'you')[][] = [PIPELINE.slice(0, 4), [...PIPELINE.slice(4), 'you']]

const DECK_URL = `${REPO_URL}/blob/main/Zero%20Context%20-%20Shop%20Honest%20-%20AI%20Builder%20Cup.pptx`
const EVIDENCE_URL = `${REPO_URL}/blob/main/docs/evidence/README.md`
const TEAM: [string, string][] = [
  ['Saubhagya Ashish', 'https://www.linkedin.com/in/saubhagya-ashish'],
  ['Suvojit Konar', 'https://www.linkedin.com/in/suvojitkonar/'],
]

/** Back to the URL box at the top of the page, ready to paste into. */
function focusUrlBox() {
  const input = document.getElementById('target-url')
  if (!input) return
  const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  input.scrollIntoView({ behavior: still ? 'auto' : 'smooth', block: 'center' })
  input.focus({ preventScroll: true })
}

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

/** Real stores to try the general navigator on (any public site can be audited). Fill the URL box; "Scan it" runs a live audit. */
// Short chip names for the demo stores beside the URL box (the cards below carry the full story).
const DEMO_LABEL: Record<string, string> = {
  'store-a': 'Store A · rigged',
  'store-b': 'Store B · honest',
  'store-c': 'Store C · sign-in wall',
}

const REAL_STORES = [
  {
    label: 'AutomationExercise · Blue Top',
    url: 'https://automationexercise.com/product_details/1',
    note: 'A real store built for automation practice; checkout needs a login, so the audit stops there.',
  },
  {
    label: 'Tata 1mg · Vitamin C tablets',
    url: 'https://www.1mg.com/otc/new-celin-500-vitamin-c-tablet-otc32913',
    note: 'A real pharmacy: the agent reaches the cart and stops at its sign-in popup.',
  },
]

export function AuditorHome() {
  const navigate = useNavigate()
  const [url, setUrl] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [starting, setStarting] = useState(false)
  useDocumentTitle('Shop Honest · dark patterns, caught in 4K')
  // The header links to sections here ("/#squad"); React Router doesn't scroll to a hash by itself.
  const { hash } = useLocation()
  useEffect(() => {
    if (hash) document.getElementById(hash.slice(1))?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [hash])

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
              <Sticker key="a" tone="white" rotate={-3}><IndiaFlag /> For e-commerce platforms</Sticker>,
              <Sticker key="b" tone="lilac" rotate={2}>🛡️ compliance teams</Sticker>,
              <Sticker key="c" tone="mint" rotate={-1}>⚖️ regulators</Sticker>,
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
            Your store, audited the way your customers see it. Every dark pattern found, fixed and proven, before it costs you a CCPA fine.
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
              placeholder="paste your product page…"
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
          <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
            <span className="font-semibold text-ink/70">Our demo stores:</span>
            {SAMPLES.map((s) => (
              <button
                key={s.key}
                type="button"
                onClick={() => setUrl(window.location.origin + s.path)}
                title={s.description}
                className="inline-flex items-center gap-1.5 rounded-lg border-2 border-ink bg-white px-2.5 py-1 text-xs font-bold hover:bg-sun"
              >
                <span className={`h-2.5 w-2.5 rounded-full border-2 border-ink ${TONE_BG[s.tone]}`} aria-hidden="true" />
                {DEMO_LABEL[s.key] ?? s.name}
              </button>
            ))}
          </div>
          {auditSource.mode === 'live' && (
            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
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
              note="India’s CCPA named them in 2023. In 2025, 26 platforms declared themselves free of them; in 2026 the CCPA fined one of them. Hover a card to flip it; the demo store hides the ones marked “in demo”."
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
      <section id="squad" className="mx-auto max-w-[1240px] scroll-mt-24 px-4 py-16 sm:px-6">
        <Reveal>
          <SectionHeading
            kicker="how it works"
            title="Meet the squad 🫡"
            note="Seven agents and you, one audit. Each does one job and hands off to the next."
          />
        </Reveal>
        <div className="mt-10 space-y-5">
          {SQUAD_ROWS.map((row, r) => (
            <div key={r} className="relative grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              <SquadLine />
              {row.map((member, i) => (
                <Reveal key={member} delay={i * 0.08} className="relative">
                  <SquadCard member={member} n={r * 4 + i + 1} />
                </Reveal>
              ))}
            </div>
          ))}
        </div>
      </section>

      {/* Stats */}
      <section className="mx-auto max-w-[1240px] px-4 pb-16 sm:px-6">
        <Reveal>
          <div className="brutal rounded-3xl bg-ink p-8 text-cream">
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              <Stat value={9} suffix="/9" label="planted tricks caught on the rigged store" />
              <Stat value={0} label="false alarms on the honest store" />
              <Stat value={9} suffix="/9" label="fixes verified on a fixed copy of the store" />
              <Stat value={0.959} decimals={3} label="F1, zero-shot, on 2,356 public shopping texts" />
            </div>
            <a
              href={EVIDENCE_URL}
              target="_blank"
              rel="noreferrer"
              className="mt-6 inline-flex items-center gap-1 text-sm font-semibold text-lime underline decoration-2 underline-offset-4"
            >
              How we measured these <ArrowUpRight size={14} strokeWidth={2.6} aria-hidden="true" />
            </a>
          </div>
        </Reveal>
      </section>

      {/* Footer */}
      <footer className="overflow-hidden border-t-2 border-ink bg-white">
        <div className="mx-auto max-w-[1240px] px-4 pt-12 sm:px-6">
          <div className="flex flex-wrap items-end justify-between gap-5">
            <p className="font-display text-[28px] leading-[1.1] font-extrabold tracking-[-0.02em] sm:text-[40px]">
              Found, fixed and proven,
              <br />
              <span className="bg-lime px-1 [box-decoration-break:clone] sm:whitespace-nowrap">before it costs you a CCPA&nbsp;fine.</span>
            </p>
            <button type="button" onClick={focusUrlBox} className={buttonClass('pink', 'md')}>
              Audit a store <ArrowUp size={18} strokeWidth={2.6} aria-hidden="true" />
            </button>
          </div>
          <div className="pt-10 font-display text-[15vw] leading-[0.85] font-extrabold tracking-[-0.04em] whitespace-nowrap text-outline select-none lg:text-[185px]" aria-hidden="true">
            shop honest
          </div>
          <div className="flex flex-wrap items-center justify-between gap-x-8 gap-y-5 pt-9">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-[15px] font-semibold">
              <span className="sticker shine bg-lime !px-3.5 !py-1 !text-sm" style={{ rotate: '-2deg' }}>
                <Sparkles size={14} strokeWidth={2.6} aria-hidden="true" /> Team Zero Context
              </span>
              <span>
                {TEAM.map(([name, href], i) => (
                  <Fragment key={name}>
                    {i > 0 && ' and '}
                    <a href={href} target="_blank" rel="noreferrer" className="whitespace-nowrap underline underline-offset-2 hover:text-ink/70">
                      {name}
                    </a>
                  </Fragment>
                ))}
              </span>
            </div>
            <nav aria-label="Project links" className="flex flex-wrap gap-3">
              <a href={REPO_URL} target="_blank" rel="noreferrer" className={buttonClass('white', 'sm')}>
                <GithubMark /> GitHub
              </a>
              <a href={DECK_URL} target="_blank" rel="noreferrer" className={buttonClass('white', 'sm')}>
                <Presentation size={16} strokeWidth={2.6} aria-hidden="true" /> Slide deck
              </a>
              <a href={EVIDENCE_URL} target="_blank" rel="noreferrer" className={buttonClass('white', 'sm')}>
                <FlaskConical size={16} strokeWidth={2.6} aria-hidden="true" /> How we measured
              </a>
            </nav>
          </div>
          <div className="mt-9 flex flex-col gap-3 border-t-2 border-ink/10 pt-5 pb-8 sm:flex-row sm:items-start sm:gap-6">
            <Sticker className="self-start">Google Cloud AI Builder Cup 2026 · Retail &amp; Commerce</Sticker>
            <p className="max-w-3xl text-xs leading-relaxed text-ink/60">
              Findings cite the CCPA Guidelines for Prevention and Regulation of Dark Patterns, 2023, and the Consumer Protection Act, 2019. Reports support a compliance review; they are not legal advice.
              {auditSource.mode === 'mock' && ' This demo build replays real captures of the two sample stores through the same event stream the live agents will use.'}
            </p>
          </div>
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

function Stat({ value, label, suffix = '', decimals = 0 }: { value: number; label: string; suffix?: string; decimals?: number }) {
  return (
    <div>
      <CountUp value={value} suffix={suffix} decimals={decimals} className="font-display text-6xl font-extrabold text-lime" />
      <p className="mt-1 text-sm leading-snug text-cream/75">{label}</p>
    </div>
  )
}

/** The dashed line a row of the squad hands off along. */
function SquadLine() {
  return (
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
  )
}

/** One member of the squad: an agent, or you, who reviews what nobody can check and decides which fixes to apply. */
function SquadCard({ member, n }: { member: AgentName | 'you'; n: number }) {
  const you = member === 'you'
  const card = you
    ? { label: 'You', vibe: 'You make the call.', job: 'Claims nobody can check come to you, and you choose which fixes to apply.' }
    : AGENTS[member]
  return (
    <article className="brutal h-full rounded-2xl bg-white p-4">
      <div className="flex items-center justify-between">
        {you ? (
          <span className={`brutal-sm inline-grid h-16 w-16 shrink-0 place-items-center rounded-2xl ${TONE_BG.sun}`} title="You">
            <User size={30} strokeWidth={2.4} aria-hidden="true" />
          </span>
        ) : (
          <AgentAvatar agent={member} size="lg" />
        )}
        <span className="font-display text-3xl font-extrabold text-ink/15">0{n}</span>
      </div>
      <div className="mt-3 font-display text-lg font-extrabold">{card.label}</div>
      <p className="mt-1 text-[15px] leading-snug font-semibold">{card.vibe}</p>
      <p className="mt-2 text-[13px] leading-snug text-ink/60">{card.job}</p>
    </article>
  )
}
