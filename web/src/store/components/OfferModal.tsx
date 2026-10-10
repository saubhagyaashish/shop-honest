import { useEffect, useState } from 'react'
import { useStore } from '../useStore'

/** First-order offer that appears shortly after the product page loads. */
export function OfferModal() {
  const { setup } = useStore()
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!setup.behaviour.guiltDeclinePopup) return
    const id = setTimeout(() => setOpen(true), 1200)
    return () => clearTimeout(id)
  }, [setup])

  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 px-4">
      <div id="offer-modal" role="dialog" aria-modal="true" aria-labelledby="offer-title" className="w-full max-w-sm overflow-hidden rounded-lg bg-white text-center shadow-2xl">
        <div className="bg-saffron-400 px-6 py-5 text-nest-900">
          <div className="text-xs font-bold tracking-widest uppercase">Wait! One-time offer</div>
          <h2 id="offer-title" className="mt-1 text-2xl font-extrabold">Extra 10% off</h2>
          <div className="text-sm">on your first order</div>
        </div>
        <div className="px-6 py-5">
          <input
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
            placeholder="Enter mobile number"
            inputMode="tel"
            aria-label="Mobile number"
          />
          <button
            id="offer-modal-accept"
            type="button"
            onClick={() => setOpen(false)}
            className="mt-3 w-full rounded bg-nest-600 py-2.5 text-sm font-bold text-white"
          >
            Unlock my 10% off
          </button>
          <button
            id="offer-modal-decline"
            type="button"
            onClick={() => setOpen(false)}
            className="mt-3 text-xs text-gray-500 underline"
          >
            No thanks, I prefer paying full price
          </button>
        </div>
      </div>
    </div>
  )
}
