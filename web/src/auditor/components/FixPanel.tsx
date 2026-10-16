import { Check, ClipboardCopy, LoaderCircle, RotateCcw, ShieldCheck, Wrench, X } from 'lucide-react'
import { animate, motion, useReducedMotion } from 'motion/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { AuditReport, FixItem, FixKind, FixProposal, Money } from '../../shared/contract'
import { PATTERNS } from '../../shared/patterns'
import { STEP_LABEL } from '../labels'
import { formatMoney, formatMoneyCompact } from '../money'
import { fixList } from '../fixList'
import { project } from '../projection'
import type { Projection } from '../projection'
import type { FixToApply } from '../source/AuditSource'
import { buttonClass } from '../ui/styles'

interface Props {
  report: AuditReport
  /** The Fixer's proposal for this audit. */
  load: () => Promise<FixProposal>
  onClose: () => void
  /** Audit a copy of the store with these fixes applied (opens that audit). */
  onVerify: (fixes: FixToApply[]) => Promise<void>
  /** Audit the page again and compare, once the site's developers have shipped the fixes. */
  onReaudit?: () => void
}

const GROUPS: { kind: FixKind; title: string; note: (verifiable: boolean) => string }[] = [
  {
    kind: 'setting',
    title: '✅ Can fix here',
    note: () => 'Each one is a change to this store’s own settings. Switch it on to apply it.',
  },
  {
    kind: 'code',
    title: '🛠 Needs your developers',
    note: (verifiable) =>
      verifiable
        ? 'No setting fixes these. The fix is described for the developers.'
        : 'ShopHonest never changes a real site. Switch a fix on to see what it changes once your developers ship it.',
  },
  {
    kind: 'review',
    title: '⚖️ Your call',
    note: () => 'Sent for human review: it may not break a rule, so it doesn’t count against the score yet.',
  },
]

/** "Fix it": a fix for each finding, the report's numbers as fixes are switched on, and a way to prove them. */
export function FixPanel({ report, load, onClose, onVerify, onReaudit }: Props) {
  const [proposal, setProposal] = useState<FixProposal>()
  const [loadError, setLoadError] = useState<string>()
  const [attempt, setAttempt] = useState(0)
  const [on, setOn] = useState<ReadonlySet<string>>(new Set())
  const [verifying, setVerifying] = useState(false)
  const [verifyError, setVerifyError] = useState<string>()
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    let live = true
    load()
      .then((p) => live && setProposal(p))
      .catch((err: unknown) => live && setLoadError(err instanceof Error ? err.message : 'The Fixer couldn’t write fixes just now.'))
    return () => {
      live = false
    }
  }, [load, attempt])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [onClose])

  const now = useMemo(() => project(report, new Set()), [report])
  const next = useMemo(() => project(report, on), [report, on])
  const items = proposal?.items ?? []
  const chosen = items.filter((i) => on.has(i.findingId))
  const toApply: FixToApply[] = chosen.flatMap((i) =>
    i.changes.map((c) => ({ findingId: c.findingId, setting: c.setting, value: c.to, why: c.why })),
  )
  const canVerify = proposal?.canVerify ?? false

  const toggle = (id: string) =>
    setOn((prev) => {
      const out = new Set(prev)
      if (out.has(id)) out.delete(id)
      else out.add(id)
      return out
    })
  // Everything that's clearly a violation; the "Your call" ones stay the viewer's decision.
  const bulk = items.filter((i) => i.kind !== 'review' && (!canVerify || i.changes.length > 0))
  const allOn = bulk.length > 0 && bulk.every((i) => on.has(i.findingId))
  const switchAll = () =>
    setOn((prev) => {
      const out = new Set(prev)
      for (const i of bulk) {
        if (allOn) out.delete(i.findingId)
        else out.add(i.findingId)
      }
      return out
    })

  const verify = async () => {
    setVerifying(true)
    setVerifyError(undefined)
    try {
      await onVerify(toApply)
    } catch (err) {
      setVerifying(false)
      setVerifyError(err instanceof Error ? err.message : 'Could not start the check.')
    }
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(fixList(report, items, on))
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
    }
  }

  return (
    <motion.div className="fixed inset-0 z-50 bg-ink/60 backdrop-blur-[2px]" onClick={onClose} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <motion.aside
        role="dialog"
        aria-modal="true"
        aria-label="Fix it"
        className="absolute inset-y-0 right-0 flex w-full max-w-[600px] flex-col border-l-2 border-ink bg-cream"
        onClick={(e) => e.stopPropagation()}
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        transition={{ type: 'spring', stiffness: 320, damping: 34 }}
      >
        <header className="flex items-start justify-between gap-3 border-b-2 border-ink bg-white px-4 py-3.5 sm:px-5">
          <div className="min-w-0">
            <h2 className="flex items-center gap-2 font-display text-[22px] font-extrabold">
              <Wrench size={20} strokeWidth={2.6} aria-hidden="true" /> Fix it
            </h2>
            <p className="mt-0.5 text-[13px] leading-snug text-ink/65">
              {canVerify
                ? 'Fixes apply to a copy of this store in the auditor’s own browser. The live store is unchanged.'
                : 'What to change for each finding, and what each fix is worth.'}
            </p>
          </div>
          <button type="button" onClick={onClose} className={buttonClass('white', 'sm')} aria-label="Close">
            <X size={16} strokeWidth={2.6} aria-hidden="true" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <Meter now={now} next={next} touched={on.size > 0} />

          {!proposal && !loadError && (
            <div className="flex items-center gap-3 px-5 py-10 text-[15px] font-semibold text-ink/70">
              <LoaderCircle size={20} strokeWidth={2.6} className="animate-spin" aria-hidden="true" />
              The Fixer is reading your findings…
            </div>
          )}
          {loadError && (
            <div className="m-4 rounded-2xl border-2 border-ink bg-pink px-4 py-3 text-sm font-semibold sm:m-5">
              {loadError}{' '}
              <button
                type="button"
                className="underline"
                onClick={() => {
                  setLoadError(undefined)
                  setAttempt((n) => n + 1)
                }}
              >
                Try again
              </button>
            </div>
          )}

          {proposal && (
            <div className="space-y-6 px-4 py-5 sm:px-5">
              {bulk.length > 0 && (
                <button type="button" onClick={switchAll} className={buttonClass('white', 'sm')}>
                  {allOn ? 'Switch them all off' : canVerify ? `Apply all ${bulk.length} fixes` : `Plan all ${bulk.length} fixes`}
                </button>
              )}
              {GROUPS.map((group) => {
                const rows = items.filter((i) => i.kind === group.kind)
                if (!rows.length) return null
                return (
                  <section key={group.kind}>
                    <h3 className="font-display text-[17px] font-extrabold">
                      {group.title} <span className="text-ink/45">{rows.length}</span>
                    </h3>
                    <p className="mt-0.5 text-[13px] text-ink/60">{group.note(canVerify)}</p>
                    <ul className="brutal-sm mt-2.5 overflow-hidden rounded-2xl bg-white">
                      {rows.map((item) => (
                        <FixItemRow
                          key={item.findingId}
                          item={item}
                          on={on.has(item.findingId)}
                          // On a store we can fix, only a settings change can be applied; elsewhere every fix can be planned.
                          switchable={canVerify ? item.changes.length > 0 : true}
                          verb={item.changes.length > 0 && canVerify ? 'Apply' : 'Plan'}
                          onToggle={() => toggle(item.findingId)}
                        />
                      ))}
                    </ul>
                  </section>
                )
              })}
              {items.length === 0 && <p className="text-sm font-semibold">Nothing to fix: this audit found no dark patterns.</p>}
            </div>
          )}
        </div>

        {proposal && items.length > 0 && (
          <footer className="border-t-2 border-ink bg-white px-4 py-3.5 sm:px-5">
            {verifyError && <p className="mb-2 text-sm font-semibold text-[#d6336c]">{verifyError}</p>}
            {canVerify ? (
              <>
                <button
                  type="button"
                  onClick={verify}
                  disabled={!toApply.length || verifying}
                  className={buttonClass('lime', 'lg', 'w-full disabled:opacity-50')}
                >
                  {verifying ? <LoaderCircle size={18} strokeWidth={2.6} className="animate-spin" /> : <ShieldCheck size={18} strokeWidth={2.6} />}
                  {verifying
                    ? 'Starting the check…'
                    : toApply.length
                      ? `Verify ${chosen.length} fix${chosen.length === 1 ? '' : 'es'} on a copy of this store`
                      : 'Switch on a fix to verify it'}
                </button>
                <p className="mt-2 text-center text-[12px] text-ink/55">
                  The agents audit the fixed copy the same way, live, so these numbers are measured, not projected. About a minute.
                </p>
              </>
            ) : (
              <div className="flex flex-wrap gap-2.5">
                <button type="button" onClick={copy} className={buttonClass('lime', 'md', 'flex-1')}>
                  {copied ? <Check size={18} strokeWidth={2.6} /> : <ClipboardCopy size={18} strokeWidth={2.6} />}
                  {copied ? 'Copied' : on.size ? `Copy ${on.size} planned fix${on.size === 1 ? '' : 'es'}` : 'Copy the fix list'}
                </button>
                {onReaudit && (
                  <button type="button" onClick={onReaudit} className={buttonClass('white', 'md', 'flex-1')}>
                    <RotateCcw size={18} strokeWidth={2.6} /> Re-audit after you ship
                  </button>
                )}
              </div>
            )}
          </footer>
        )}
      </motion.aside>
    </motion.div>
  )
}

/** The four numbers, as they are and as they'd be with the fixes switched on. */
function Meter({ now, next, touched }: { now: Projection; next: Projection; touched: boolean }) {
  const money = (m: Money | undefined, compact = false) => (m ? (compact ? formatMoneyCompact(m) : formatMoney(m)) : '–')
  return (
    <div className="sticky top-0 z-10 border-b-2 border-ink bg-cream px-4 pt-3 pb-3.5 sm:px-5">
      <div className="mb-2 flex items-center gap-2 text-[11px] font-extrabold tracking-wider uppercase">
        <span className={`rounded-md border-2 border-ink px-1.5 py-0.5 ${touched ? 'bg-sun' : 'bg-white'}`}>
          {touched ? 'Projected' : 'Now'}
        </span>
        <span className="text-ink/50">{touched ? 'from this audit’s evidence, until verified' : 'switch on fixes to see what they change'}</span>
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        <Tile label="Trust score" from={now.trust} to={next.trust} better={next.trust > now.trust} format={(n) => String(Math.round(n))} />
        <Tile
          label="Hidden extras"
          from={now.hiddenExtras?.amount}
          to={next.hiddenExtras?.amount}
          better={(next.hiddenExtras?.amount ?? 0) < (now.hiddenExtras?.amount ?? 0)}
          format={(n) => (n > 0 ? `+${money({ amount: n, currency: now.hiddenExtras!.currency })}` : money({ amount: 0, currency: now.hiddenExtras!.currency }))}
        />
        <Tile
          label="Fine ceiling"
          from={now.fineCeiling?.amount ?? now.rulesBroken}
          to={next.fineCeiling?.amount ?? next.rulesBroken}
          better={next.rulesBroken < now.rulesBroken}
          format={(n) => (now.fineCeiling ? (n > 0 ? `up to ${money({ amount: n, currency: now.fineCeiling.currency }, true)}` : money({ amount: 0, currency: now.fineCeiling.currency })) : `${Math.round(n)} rules`)}
          sub={
            now.fineCeiling
              ? `${next.rulesBroken} rule${next.rulesBroken === 1 ? '' : 's'} broken × ${money(now.perContravention, true)} max each (CPA s 21)`
              : undefined
          }
        />
        <Tile
          label="CCPA patterns found"
          from={now.ccpaFound}
          to={next.ccpaFound}
          better={next.ccpaFound < now.ccpaFound}
          format={(n) => `${Math.round(n)} of 13`}
          sub="the 13 in Annexure 1 of the guidelines"
        />
      </div>
    </div>
  )
}

function Tile({
  label,
  from,
  to,
  better,
  format,
  sub,
}: {
  label: string
  from: number | undefined
  to: number | undefined
  better: boolean
  format: (n: number) => string
  sub?: string
}) {
  const changed = from !== undefined && to !== undefined && from !== to
  return (
    <div className={`rounded-xl border-2 border-ink px-3 py-2 shadow-brutal-sm transition-colors ${better ? 'bg-lime' : 'bg-white'}`}>
      <div className="text-[11px] font-extrabold tracking-wide text-ink/60 uppercase">{label}</div>
      {to === undefined ? (
        <div className="mt-0.5 font-display text-[20px] font-extrabold">–</div>
      ) : (
        <div className="mt-0.5 flex flex-wrap items-baseline gap-x-1.5 font-display leading-tight font-extrabold">
          {changed && <span className="text-[13px] text-ink/45 line-through decoration-2">{format(from)}</span>}
          <Tween value={to} format={format} className="text-[20px]" />
        </div>
      )}
      {sub && <div className="mt-0.5 text-[11px] leading-snug text-ink/55">{sub}</div>}
    </div>
  )
}

/** A number that glides to its new value. */
function Tween({ value, format, className = '' }: { value: number; format: (n: number) => string; className?: string }) {
  const reduced = useReducedMotion()
  const [shown, setShown] = useState(value)
  const from = useRef(value)
  useEffect(() => {
    const controls = animate(from.current, value, {
      duration: reduced ? 0 : 0.6,
      ease: [0.2, 0.8, 0.2, 1],
      onUpdate: (v) => {
        from.current = v
        setShown(v)
      },
    })
    return () => controls.stop()
  }, [value, reduced])
  return <span className={`tabular-nums ${className}`}>{format(shown)}</span>
}

function FixItemRow({
  item,
  on,
  switchable,
  verb,
  onToggle,
}: {
  item: FixItem
  on: boolean
  switchable: boolean
  verb: 'Apply' | 'Plan'
  onToggle: () => void
}) {
  return (
    <li className={`flex gap-3 border-t-2 border-ink/10 px-3.5 py-3 first:border-t-0 sm:px-4 ${on ? 'bg-lime/25' : ''}`}>
      <div className="min-w-0 flex-1">
        <div className="text-[15px] leading-snug font-bold">{item.title}</div>
        <div className="mt-0.5 text-[12px] font-semibold text-ink/50">
          {PATTERNS[item.patternId].name} · {STEP_LABEL[item.step]}
        </div>
        {item.changes.length > 0 ? (
          <ul className="mt-1.5 space-y-1">
            {item.changes.map((c) => (
              <li key={c.setting} className="text-[13px] leading-snug text-ink/75">
                <code className="mr-1.5 inline-block rounded-md border border-ink/20 bg-ink/5 px-1.5 py-0.5 font-mono text-[12px] [overflow-wrap:anywhere] text-ink/85">
                  {c.setting}: {c.from} → {c.to}
                </code>
                {c.why}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-1.5 text-[13px] leading-snug text-ink/75">{item.suggestion}</p>
        )}
      </div>
      {switchable && <Switch on={on} label={`${verb}: ${item.title}`} verb={verb} onToggle={onToggle} />}
    </li>
  )
}

function Switch({ on, label, verb, onToggle }: { on: boolean; label: string; verb: string; onToggle: () => void }): ReactNode {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} onClick={onToggle} className="flex shrink-0 flex-col items-center gap-1 self-start">
      <span className={`relative h-7 w-12 rounded-full border-2 border-ink transition-colors ${on ? 'bg-lime' : 'bg-white'}`}>
        <motion.span
          className="absolute top-0.5 h-5 w-5 rounded-full border-2 border-ink bg-ink"
          animate={{ left: on ? 22 : 2 }}
          transition={{ type: 'spring', stiffness: 500, damping: 32 }}
        />
      </span>
      <span className="text-[11px] font-extrabold tracking-wide uppercase">{verb}</span>
    </button>
  )
}
