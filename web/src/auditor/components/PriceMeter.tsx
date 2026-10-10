import { animate, motion, useReducedMotion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import { STEP_LABEL } from '../labels'
import { formatMoney, percentUp } from '../money'
import type { PricePoint } from '../useAudit'

/** Live running total: what the shopper was shown versus what they're now being asked to pay. */
export function PriceMeter({ trail }: { trail: PricePoint[] }) {
  if (trail.length === 0) {
    return (
      <div className="brutal rounded-2xl bg-white px-4 py-3">
        <div className="text-[11px] font-extrabold tracking-wider uppercase">Price check 💸</div>
        <p className="mt-1 text-xs font-medium text-ink/60">Reading the price…</p>
      </div>
    )
  }
  const shown = trail[0].total
  const now = trail[trail.length - 1].total
  const delta = now.amount - shown.amount
  const drifted = delta > 0
  return (
    <div className={`brutal rounded-2xl px-4 py-3 transition-colors ${drifted ? 'bg-pink' : 'bg-lime'}`}>
      <div className="text-[11px] font-extrabold tracking-wider uppercase">Price check 💸</div>
      <div className="mt-1 flex items-baseline gap-2">
        <AnimatedAmount value={now.amount} currency={now.currency} />
      </div>
      <div className="text-xs font-bold">
        {drifted ? (
          <>
            +{formatMoney({ amount: delta, currency: now.currency })} · +{percentUp(shown.amount, now.amount)}% vs shown
          </>
        ) : (
          <>matches the price shown ✓</>
        )}
      </div>
      <ol className="mt-2 space-y-0.5 border-t-2 border-ink/20 pt-2 text-[11px] font-semibold">
        {trail.map((p, i) => {
          const step = p.total.amount - (i > 0 ? trail[i - 1].total.amount : p.total.amount)
          return (
            <motion.li key={`${p.step}-${i}`} className="flex justify-between gap-2" initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }}>
              <span>{STEP_LABEL[p.step]}</span>
              <span className="font-mono tabular-nums">
                {formatMoney(p.total)}
                {step > 0 && <span className="ml-1">(+{formatMoney({ amount: step, currency: p.total.currency })})</span>}
              </span>
            </motion.li>
          )
        })}
      </ol>
    </div>
  )
}

function AnimatedAmount({ value, currency }: { value: number; currency: PricePoint['total']['currency'] }) {
  const reduced = useReducedMotion()
  const [shown, setShown] = useState(value)
  const from = useRef(value)
  useEffect(() => {
    const controls = animate(from.current, value, {
      duration: reduced ? 0 : 0.8,
      ease: [0.2, 0.8, 0.2, 1],
      onUpdate: (v) => setShown(Math.round(v)),
    })
    from.current = value
    return () => controls.stop()
  }, [value, reduced])
  return <span className="font-display text-4xl leading-tight font-extrabold tabular-nums">{formatMoney({ amount: shown, currency })}</span>
}
