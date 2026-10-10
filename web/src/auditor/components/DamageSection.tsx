import { motion } from 'motion/react'
import { useState } from 'react'
import type { PriceDrift, PriceDriftLine } from '../../shared/contract'
import { STEP_LABEL } from '../labels'
import { formatMoney, formatMoneyCompact, percentUp } from '../money'
import { SectionHead } from '../ui/SectionHead'

const ORDERS_DEFAULT = 10_000

function reason(l: PriceDriftLine): string {
  switch (l.kind) {
    case 'sneaked_item':
      return 'added to the cart without asking'
    case 'subscription':
      return l.recurring ? `pre-ticked · repeats ${l.recurring}` : 'pre-ticked at checkout'
    case 'fee':
      return `first shown at ${STEP_LABEL[l.firstSeen]}`
    case 'upgrade':
      return `upsold at ${STEP_LABEL[l.firstSeen]}`
  }
}

/** "The damage": what the shopper was shown versus the bill they actually get. */
export function DamageSection({
  drift,
  onJumpToFinding,
  stoppedAfter,
}: {
  drift: PriceDrift
  onJumpToFinding: (findingId: string) => void
  /** Last step reached when the walk was cut short (e.g. by a sign-in wall). */
  stoppedAfter?: string
}) {
  const [orders, setOrders] = useState(ORDERS_DEFAULT)
  const currency = drift.payable.currency
  const extra = drift.payable.amount - drift.advertised.amount
  const pct = percentUp(drift.advertised.amount, drift.payable.amount)
  const recurring = drift.lines.filter((l) => l.recurring)
  const fakeSaving = drift.claimedSaving && drift.genuineSaving && drift.claimedSaving.amount > drift.genuineSaving.amount

  return (
    <section id="money" className="scroll-mt-32">
      <SectionHead
        kicker="the damage 💸"
        title={extra > 0 ? 'The bill shoppers actually get' : 'The bill matches the price'}
        note={
          extra > 0
            ? `The product page said ${formatMoney(drift.advertised)}. By ${stoppedAfter ?? 'payment'} it was ${formatMoney(drift.payable)}.${stoppedAfter ? ' Later steps could not be audited.' : ''}`
            : undefined
        }
      />

      <div className="mt-12 grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        {/* The receipt */}
        <div className="receipt-outline relative mx-auto w-full max-w-[480px]">
          <div className="receipt-edge" />
          <div className="bg-white px-6 pt-3 pb-5 font-mono text-[13px]">
            <div className="text-center">
              <div className="font-sans text-[11px] font-extrabold tracking-[0.2em] uppercase">Checkout receipt</div>
              <div className="text-[11px] text-ink/50">as the agent saw it, step by step</div>
            </div>
            <div className="my-3 border-t-2 border-dashed border-ink/30" />
            <div className="flex justify-between gap-4 font-medium">
              <span>Price you saw</span>
              <span>{formatMoney(drift.advertised)}</span>
            </div>
            {drift.lines.map((l) => (
              <div key={l.label} className="mt-2.5">
                <div className="flex justify-between gap-4 font-bold text-[#d6336c]">
                  <span>+ {l.label}</span>
                  <span className="shrink-0">
                    {formatMoney(l.amount)}
                    {l.recurring === 'monthly' && <span className="text-[11px]">/mo</span>}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-[11px] text-ink/55">
                  <span className="italic">{reason(l)}</span>
                  {l.findingId && (
                    <button type="button" onClick={() => onJumpToFinding(l.findingId!)} className="font-sans font-bold text-ink underline decoration-pink decoration-2 underline-offset-2 print:hidden">
                      evidence ↓
                    </button>
                  )}
                </div>
              </div>
            ))}
            <div className="my-3 border-t-2 border-dashed border-ink/30" />
            <div className="flex items-baseline justify-between gap-4">
              <span className="font-sans text-xs font-extrabold tracking-wider uppercase">{stoppedAfter ? `Total by ${stoppedAfter}` : 'Total charged'}</span>
              <span className="font-display text-3xl font-extrabold">{formatMoney(drift.payable)}</span>
            </div>
            {extra > 0 && (
              <div className="mt-1 text-right text-xs font-bold text-[#d6336c]">
                {formatMoney({ amount: extra, currency })} more than shown
              </div>
            )}
          </div>
          <div className="receipt-edge receipt-edge-bottom" />

          <motion.div
            className={`pointer-events-none absolute -top-9 -right-2 rounded-lg border-[3px] bg-white px-3 py-1.5 text-center font-display leading-none font-extrabold tracking-wide uppercase sm:-right-12 ${
              extra > 0 ? 'border-[#d6336c] text-[#d6336c]' : 'border-green-700 text-green-700'
            }`}
            initial={{ scale: 2.4, rotate: -24, opacity: 0 }}
            whileInView={{ scale: 1, rotate: -12, opacity: 0.9 }}
            viewport={{ once: true, amount: 0.6 }}
            transition={{ type: 'spring', stiffness: 260, damping: 13, delay: 0.25 }}
          >
            {extra > 0 ? (
              <>
                <div className="text-lg">Overcharged</div>
                <div className="text-3xl">+{pct}%</div>
              </>
            ) : (
              <div className="text-xl">Paid as shown ✓</div>
            )}
          </motion.div>
        </div>

        <div className="flex flex-col gap-5">
          {drift.claimedSaving && drift.genuineSaving && (
            <div className={`brutal rounded-3xl p-6 ${fakeSaving ? 'bg-sun' : 'bg-lime'}`}>
              <div className="text-[11px] font-extrabold tracking-wider uppercase">The “you save” claim</div>
              {fakeSaving ? (
                <>
                  <p className="mt-2 font-display text-[22px] leading-snug font-extrabold">
                    They said you save <s className="decoration-[3px]">{formatMoney(drift.claimedSaving)}</s>. You really save {formatMoney(drift.genuineSaving)}.
                  </p>
                  <p className="mt-2 text-[13px] font-semibold">
                    {formatMoney({ amount: drift.claimedSaving.amount - drift.genuineSaving.amount, currency })} of the “discount” comes from an MRP raised just before the sale.{' '}
                    {drift.savingFindingId && (
                      <button type="button" onClick={() => onJumpToFinding(drift.savingFindingId!)} className="font-bold underline underline-offset-2 print:hidden">
                        evidence ↓
                      </button>
                    )}
                  </p>
                </>
              ) : (
                <p className="mt-2 font-display text-[22px] leading-snug font-extrabold">Genuine discount of {formatMoney(drift.genuineSaving)} ✓</p>
              )}
            </div>
          )}

          {extra > 0 ? (
            <div className="brutal rounded-3xl bg-ink p-6 text-cream">
              <div className="text-[11px] font-extrabold tracking-wider text-lime uppercase">At scale</div>
              <div className="mt-2 font-display text-[40px] leading-none font-extrabold text-lime">{formatMoneyCompact({ amount: extra * orders, currency })}</div>
              <div className="mt-1 text-[15px] font-semibold">
                overcharged every month · {formatMoneyCompact({ amount: extra * orders * 12, currency })} a year
              </div>
              <label htmlFor="orders-per-month" className="mt-4 block text-[13px] text-cream/75">
                at <b className="text-cream">{orders.toLocaleString('en-IN')}</b> orders a month
              </label>
              <input
                id="orders-per-month"
                type="range"
                min={1000}
                max={100000}
                step={1000}
                value={orders}
                onChange={(e) => setOrders(Number(e.target.value))}
                className="mt-2 w-full accent-lime print:hidden"
              />
              {recurring.length > 0 && (
                <p className="mt-3 text-[13px] text-cream/75">
                  Plus {recurring.map((l) => `${formatMoney(l.amount)} a ${l.recurring === 'monthly' ? 'month' : 'year'}`).join(', ')} that keeps billing after the order.
                </p>
              )}
              <p className="mt-3 text-[11px] text-cream/50">Order volume is your assumption; the overcharge per order is measured.</p>
            </div>
          ) : (
            <div className="brutal rounded-3xl bg-lime p-6">
              <div className="text-[11px] font-extrabold tracking-wider uppercase">No surprise charges</div>
              <p className="mt-2 font-display text-[22px] leading-snug font-extrabold">Every fee was on the product page. Nothing was added along the way.</p>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
