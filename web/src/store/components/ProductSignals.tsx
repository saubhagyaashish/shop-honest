import { useEffect, useState } from 'react'
import { discountPercent, formatINR } from '../catalog'
import { useStore } from '../useStore'

export function PriceBlock({ price, mrp }: { price: number; mrp: number }) {
  const { setup } = useStore()
  return (
    <div id="price-block" className="mt-3">
      <div className="text-sm font-semibold text-green-700">Festive Sale price</div>
      <div className="flex flex-wrap items-baseline gap-3">
        <span className="text-[28px] font-semibold">{formatINR(price)}</span>
        <span className="mrp text-base text-gray-500">
          MRP <s>{formatINR(mrp)}</s>
        </span>
        <span className="text-base font-semibold text-green-700">{discountPercent(price, mrp)}% off</span>
      </div>
      <div className="text-xs text-gray-500">Inclusive of all taxes</div>
      {setup.upfrontPlatformFee > 0 && (
        <div className="mt-1 text-xs text-gray-600">
          + {formatINR(setup.upfrontPlatformFee)} platform fee per order. No other charges at checkout.
        </div>
      )}
    </div>
  )
}

const TIMER_START_SECONDS = 10 * 60

export function SaleClock() {
  const { setup } = useStore()
  return setup.behaviour.resettingTimer ? <RestartingCountdown /> : <FixedDeadline />
}

function RestartingCountdown() {
  // Starts from 10:00 on every mount, i.e. every page load.
  const [remaining, setRemaining] = useState(TIMER_START_SECONDS)
  useEffect(() => {
    const id = setInterval(() => setRemaining((r) => Math.max(0, r - 1)), 1000)
    return () => clearInterval(id)
  }, [])
  const mm = String(Math.floor(remaining / 60)).padStart(2, '0')
  const ss = String(remaining % 60).padStart(2, '0')
  return (
    <div id="deal-timer" className="mt-3 inline-flex items-center gap-2 rounded bg-red-50 px-3 py-1.5 text-sm font-semibold text-red-700">
      <svg viewBox="0 0 20 20" className="h-4 w-4 fill-current" aria-hidden="true">
        <path d="M10 2a8 8 0 1 1 0 16 8 8 0 0 1 0-16Zm-.75 3.5v5.06l3.72 2.23.78-1.28-3-1.8V5.5h-1.5Z" />
      </svg>
      Deal ends in <span className="font-mono tabular-nums">{mm}:{ss}</span>
    </div>
  )
}

/** End of the coming Sunday, 11:59 PM IST: the same answer on every reload. */
function upcomingSundayIST(now: Date): Date {
  const ist = new Date(now.getTime() + (330 + now.getTimezoneOffset()) * 60_000)
  const deadline = new Date(ist)
  deadline.setDate(ist.getDate() + ((7 - ist.getDay()) % 7))
  deadline.setHours(23, 59, 0, 0)
  return deadline
}

function FixedDeadline() {
  const [deadline] = useState(() => upcomingSundayIST(new Date()))
  const label = deadline.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })
  return (
    <div id="sale-deadline" className="mt-3 inline-flex items-center gap-2 rounded bg-nest-50 px-3 py-1.5 text-sm font-medium text-nest-700">
      Festive Sale ends {label}, 11:59 PM IST
    </div>
  )
}

export function StockNote() {
  const { setup } = useStore()
  return setup.behaviour.frozenStock ? (
    <div id="stock-note" className="mt-2 text-sm font-semibold text-red-600">
      Hurry, only 2 left in stock!
    </div>
  ) : (
    <div id="stock-note" className="mt-2 text-sm font-medium text-green-700">
      In stock
    </div>
  )
}

export function BuyersNote() {
  const { setup } = useStore()
  if (!setup.behaviour.buyersClaim) return null
  return (
    <div id="buyers-note" className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-saffron-100 px-2.5 py-1 text-xs font-semibold text-saffron-600">
      🔥 120+ bought in the last 24 hours
    </div>
  )
}
