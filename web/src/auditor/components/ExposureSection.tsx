import { ArrowUpRight, Check } from 'lucide-react'
import { motion } from 'motion/react'
import type { Exposure, Finding, JurisdictionCode } from '../../shared/contract'
import { PATTERNS } from '../../shared/patterns'
import { PATTERN_ICON } from '../patternIcons'
import { Flag } from '../ui/Flag'
import { SectionHead } from '../ui/SectionHead'

/** "Where this could get you fined": the same findings, read against each region's law. */
export function ExposureSection({
  exposure,
  findings,
  jurisdiction,
  onJurisdiction,
}: {
  exposure: Exposure
  findings: Finding[]
  jurisdiction: JurisdictionCode
  onJurisdiction: (code: JurisdictionCode) => void
}) {
  const j = exposure.jurisdictions.find((x) => x.code === jurisdiction) ?? exposure.jurisdictions[0]
  const confirmed = findings.filter((f) => f.status === 'confirmed')
  const casesIn = (code: JurisdictionCode) =>
    exposure.jurisdictions.find((x) => x.code === code)!.precedents.filter((p) => p.patternIds.some((id) => findings.some((f) => f.patternId === id)))
  const relevant = casesIn(j.code)

  return (
    <section id="legal" className="scroll-mt-32">
      <SectionHead
        kicker="legal exposure ⚖️"
        title={confirmed.length ? 'Where this could get you fined' : `Checked against ${exposure.jurisdictions.length} regions’ laws`}
        note={
          confirmed.length
            ? `The same ${confirmed.length} findings, read against consumer law in ${exposure.jurisdictions.length} regions. Pick a region to see the rules and real fines.`
            : 'No rule was broken in any region.'
        }
      />

      <div role="tablist" aria-label="Region" className="-mx-4 mt-6 flex snap-x gap-3 overflow-x-auto px-4 pt-3 pb-2 lg:mx-0 lg:grid lg:grid-cols-7 lg:overflow-visible lg:px-0">
        {exposure.jurisdictions.map((x) => {
          const selected = x.code === j.code
          const n = casesIn(x.code).length
          return (
            <button
              key={x.code}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => onJurisdiction(x.code)}
              className={`relative flex w-[170px] shrink-0 snap-start flex-col rounded-2xl border-2 border-ink p-3 text-left transition-[transform,box-shadow,background-color] lg:w-auto ${
                selected ? 'bg-ink text-cream shadow-brutal' : 'bg-white shadow-brutal-sm hover:-translate-y-0.5 hover:shadow-brutal'
              }`}
            >
              {x.code === exposure.strictest && confirmed.length > 0 && (
                <span className="sticker absolute -top-3 right-2 bg-pink !px-2 !py-0 text-[10px] text-ink" style={{ rotate: '4deg' }}>
                  strictest
                </span>
              )}
              {x.upcoming && (
                <span className="sticker absolute -top-3 right-2 bg-sun !px-2 !py-0 text-[10px] text-ink" style={{ rotate: '-3deg' }}>
                  new law 2027
                </span>
              )}
              <Flag code={x.code} title={x.name} className="h-6 w-9" />
              <span className="mt-2 text-[15px] leading-tight font-extrabold">{x.name}</span>
              <span className={`mt-1 text-[12px] leading-snug font-semibold ${selected ? 'text-cream/80' : 'text-ink/70'}`}>{x.penaltyHeadline}</span>
              <span className={`mt-auto pt-2 text-[11px] font-bold ${selected ? 'text-lime' : 'text-ink/50'}`}>
                {n > 0 ? `${n} real case${n === 1 ? '' : 's'}` : 'no cases on file'}
              </span>
            </button>
          )
        })}
      </div>

      <motion.div
        key={j.code}
        className="brutal mt-5 grid gap-8 rounded-3xl bg-white p-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
      >
        <div>
          <div className="flex items-center gap-3">
            <Flag code={j.code} title={j.name} className="h-7 w-[42px]" />
            <div>
              <div className="font-display text-[22px] leading-tight font-extrabold">{j.name}</div>
              <div className="text-[13px] text-ink/60">{j.regulator}</div>
            </div>
          </div>
          <p className="mt-3 text-[13px] leading-snug text-ink/70">{j.law}</p>
          <p className="mt-2 rounded-xl border-2 border-ink bg-cream px-3 py-2 text-[13px] leading-snug">
            <b>Maximum penalty:</b> {j.maxPenalty}
          </p>
          {j.upcoming && (
            <p className="mt-2 rounded-xl border-2 border-ink bg-sun/40 px-3 py-2 text-[13px] leading-snug">
              <b>Coming {new Date(j.upcoming.effectiveFrom).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}:</b> {j.upcoming.summary}
            </p>
          )}

          <div className="mt-5 text-[11px] font-extrabold tracking-wider text-ink/60 uppercase">
            {confirmed.length ? `Rules your site breaks here (${confirmed.length})` : 'Rules checked'}
          </div>
          {confirmed.length ? (
            <ul className="mt-2 space-y-2">
              {confirmed.map((f) => {
                const c = j.citations[f.id]
                const Icon = PATTERN_ICON[f.patternId]
                return (
                  <li key={f.id} className="flex gap-2.5 text-[13px] leading-snug">
                    <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-md border-2 border-ink bg-pink">
                      <Icon size={13} strokeWidth={2.6} aria-hidden="true" />
                    </span>
                    <span>
                      <b>{PATTERNS[f.patternId].name}</b> · {c?.clause}
                      <span className="text-ink/50"> ({c?.source})</span>
                      {c?.verified === false && <span className="ml-1 text-[11px] font-semibold text-ink/50">clause to confirm</span>}
                    </span>
                  </li>
                )
              })}
            </ul>
          ) : (
            <p className="mt-2 flex items-center gap-2 text-[15px] font-bold">
              <Check size={18} strokeWidth={3} /> Nothing broken under {j.name} rules
            </p>
          )}
        </div>

        <div>
          <div className="text-[11px] font-extrabold tracking-wider text-ink/60 uppercase">Real fines for the same tricks</div>
          {relevant.length === 0 ? (
            <p className="mt-2 text-[14px] text-ink/60">
              {j.precedents.length === 0 ? `No public penalties on file for ${j.name} yet.` : 'No cases on file for the tricks in this audit.'}
            </p>
          ) : (
            <ul className="mt-2 space-y-3">
              {relevant.map((p) => (
                <li key={p.id} className="rounded-2xl border-2 border-ink bg-cream p-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                    <span className="font-display text-[17px] font-extrabold">{p.company}</span>
                    <span className="text-[12px] font-semibold text-ink/60">
                      {p.regulator} · {new Date(p.date).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}
                    </span>
                  </div>
                  <div className="mt-1.5 font-display text-[17px] leading-snug font-extrabold">
                    <span className="box-decoration-clone bg-pink px-1">{p.outcome}</span>
                  </div>
                  <p className="mt-1.5 text-[13px] leading-snug">{p.summary}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    {p.patternIds.map((id) => (
                      <span key={id} className="rounded-md border-2 border-ink bg-white px-1.5 text-[11px] font-bold">
                        {PATTERNS[id].name}
                      </span>
                    ))}
                    <a href={p.sourceUrl} target="_blank" rel="noreferrer" className="ml-auto inline-flex items-center gap-1 text-xs font-bold underline underline-offset-2">
                      {p.confidence === 'official' ? 'official source' : 'press report'} <ArrowUpRight size={12} strokeWidth={2.8} aria-hidden="true" />
                    </a>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </motion.div>
      <p className="mt-3 text-xs text-ink/55">{exposure.disclaimer}</p>
    </section>
  )
}
