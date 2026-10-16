import { ArrowRight, Check, X } from 'lucide-react'
import type { Comparison, FixChange, FixOutcome, Money, Verification } from '../../shared/contract'
import { STEP_LABEL } from '../labels'
import { formatMoney } from '../money'
import { SectionHead } from '../ui/SectionHead'

/**
 * This audit against an earlier one of the same page: a re-audit ("Re-audit this page"), or a copy of the store with
 * fixes applied ("Verify these fixes", when `applied` is set).
 */
export function ComparisonSection({ comparison, applied }: { comparison: Comparison; applied?: FixChange[] }) {
  const when = new Date(comparison.previousCompletedAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })
  const fixed = new Set(applied?.map((c) => c.findingId))
  const settings = new Set(applied?.map((c) => c.setting)).size
  const gone = (ids: (id: string) => boolean) => comparison.results.filter((r) => ids(r.findingId) && r.outcome === 'resolved').length
  // Verified fixes first, then the findings no fix was applied to.
  const rows = applied ? [...comparison.results].sort((a, b) => Number(fixed.has(b.findingId)) - Number(fixed.has(a.findingId))) : comparison.results
  return (
    <section id="compared" className="scroll-mt-32">
      {applied ? (
        <SectionHead
          kicker="fixed and verified ✓"
          title={`${gone((id) => fixed.has(id))} of ${fixed.size} fixes verified`}
          note={`This audit ran on a copy of the store with ${settings} setting${settings === 1 ? '' : 's'} changed, in the auditor’s own browser only; the live store is unchanged. Compared with the audit of ${when}: a fix counts as verified when the same finding no longer turns up.`}
        />
      ) : (
        <SectionHead
          kicker="re-audit 🔁"
          title={`${gone(() => true)} of ${comparison.results.length} earlier findings are gone`}
          note={`The same page, audited again and compared with the audit of ${when}. A finding counts as gone when the same check, or a model's finding of the same kind of dark pattern at the same step, no longer turns up.`}
        />
      )}
      <BeforeAfter v={comparison} />
      <ol className="brutal mt-4 overflow-hidden rounded-3xl bg-white">
        {rows.map((r) => (
          <ComparisonRow
            key={r.findingId}
            title={r.title}
            step={r.step}
            changes={applied?.filter((c) => c.findingId === r.findingId) ?? []}
            outcome={r.outcome}
            note={applied && !fixed.has(r.findingId) ? 'No fix applied to this one.' : undefined}
          />
        ))}
      </ol>
      {comparison.newFindings.length > 0 && (
        <div className="mt-3 rounded-2xl border-2 border-ink bg-sun px-4 py-3 text-[14px]">
          <b>New this time:</b> {comparison.newFindings.map((n) => `${n.title} (${STEP_LABEL[n.step]})`).join(' · ')}
        </div>
      )}
    </section>
  )
}

/** The earlier audit against the later one, as three before → after cards. */
function BeforeAfter({ v }: { v: Verification }) {
  const still = v.results.filter((r) => r.outcome === 'still_present').length + v.newFindings.length
  return (
    <div className="mt-5 grid gap-3 sm:grid-cols-3">
      <Card label="Trust score" before={String(v.trustBefore)} after={String(v.trustAfter)} better={v.trustAfter > v.trustBefore} />
      {v.payableBefore && v.payableAfter && (
        <Card
          label="What the shopper pays"
          before={money(v.payableBefore)}
          after={money(v.payableAfter)}
          better={v.payableAfter.amount < v.payableBefore.amount}
        />
      )}
      <Card label="Dark patterns found" before={String(v.results.length)} after={String(still)} better={still < v.results.length} />
    </div>
  )
}

function Card({ label, before, after, better }: { label: string; before: string; after: string; better: boolean }) {
  return (
    <div className={`rounded-2xl border-2 border-ink p-4 shadow-brutal-sm ${better ? 'bg-lime' : 'bg-white'}`}>
      <div className="text-[12px] font-extrabold tracking-wide text-ink/60 uppercase">{label}</div>
      <div className="mt-1 flex items-center gap-2 font-display text-[26px] leading-none font-extrabold">
        <span className="text-ink/45 line-through decoration-2">{before}</span>
        <ArrowRight size={20} strokeWidth={3} aria-label="to" />
        <span>{after}</span>
      </div>
    </div>
  )
}

/** One finding of the earlier audit: the change made for it (if any) and whether the later audit still found it. */
function ComparisonRow({
  title,
  step,
  changes,
  outcome,
  note,
}: {
  title: string
  step: keyof typeof STEP_LABEL
  changes: FixChange[]
  outcome: FixOutcome
  note?: string
}) {
  return (
    <li className="flex flex-col gap-2 border-t-2 border-ink/10 px-4 py-3 first:border-t-0 sm:flex-row sm:items-start sm:gap-4 sm:px-5">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 text-[15px] leading-snug font-bold">
          <span>{title}</span>
          <span className="text-[12px] font-bold text-ink/45">{STEP_LABEL[step]}</span>
        </div>
        {changes.length > 0 && (
          <ul className="mt-1 space-y-1">
            {changes.map((c) => (
              <li key={c.setting} className="text-[13px] leading-snug text-ink/70">
                <code className="mr-1.5 inline-block rounded-md border border-ink/20 bg-ink/5 px-1.5 py-0.5 font-mono text-[12px] [overflow-wrap:anywhere] text-ink/80">
                  {c.setting}: {c.from} → {c.to}
                </code>
                {c.why}
              </li>
            ))}
          </ul>
        )}
        {note && <p className="mt-1 text-[13px] text-ink/55">{note}</p>}
      </div>
      <span
        className={`inline-flex shrink-0 items-center gap-1 self-start rounded-lg border-2 border-ink px-2.5 py-0.5 text-[13px] font-bold ${
          outcome === 'resolved' ? 'bg-lime' : 'bg-pink'
        }`}
      >
        {outcome === 'resolved' ? <Check size={14} strokeWidth={3} /> : <X size={14} strokeWidth={3} />}
        {outcome === 'resolved' ? 'Gone' : 'Still there'}
      </span>
    </li>
  )
}

function money(m: Money): string {
  return formatMoney(m)
}
