import { useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router'
import { useDocumentTitle } from '../../shared/useDocumentTitle'
import { computeTotals } from '../cart'
import { formatINR } from '../catalog'
import { OrderSummary } from '../components/OrderSummary'
import { useStore } from '../useStore'
import { storePath } from '../variants'

const METHODS = [
  { id: 'upi', label: 'UPI', detail: 'Pay by any UPI app' },
  { id: 'card', label: 'Credit / Debit card', detail: 'Visa, Mastercard, RuPay' },
  { id: 'netbanking', label: 'Net banking', detail: 'All major banks' },
  { id: 'cod', label: 'Cash on delivery', detail: 'Pay when it arrives' },
]

export function PaymentPage() {
  const { setup, state, plusOn, clear } = useStore()
  const navigate = useNavigate()
  const [method, setMethod] = useState('upi')
  useDocumentTitle('Payment | BazaarNest')

  if (state.lines.length === 0) return <Navigate to={storePath(setup, '/cart')} replace />

  const total = computeTotals(setup, state, plusOn, 'payment').total

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
      <section className="h-fit rounded-sm bg-white shadow-sm">
        <h1 className="flex items-center gap-3 bg-nest-600 px-5 py-2.5 text-sm font-semibold text-white uppercase">
          <span className="grid h-5 w-5 place-items-center rounded-sm bg-white text-xs text-nest-600">4</span>
          Payment options
        </h1>
        <div role="radiogroup" aria-label="Payment method">
          {METHODS.map((m) => (
            <label key={m.id} className="flex cursor-pointer items-center gap-3 border-b border-gray-100 px-5 py-4 text-sm">
              <input type="radio" name="method" checked={method === m.id} onChange={() => setMethod(m.id)} className="accent-nest-600" />
              <span>
                <b>{m.label}</b>
                <span className="block text-gray-500">{m.detail}</span>
              </span>
            </label>
          ))}
        </div>
        <div className="flex items-center justify-between gap-4 px-5 py-4">
          <Link to={storePath(setup, '/checkout')} className="text-sm text-nest-600">‹ Back</Link>
          <button
            id="pay-now"
            type="button"
            onClick={() => {
              clear()
              navigate(storePath(setup, '/order-placed'))
            }}
            className="rounded-sm bg-saffron-500 px-10 py-3 text-sm font-bold text-white uppercase shadow-sm hover:bg-saffron-600"
          >
            Pay {formatINR(total)}
          </button>
        </div>
      </section>
      <OrderSummary stage="payment" />
    </div>
  )
}

export function OrderPlacedPage() {
  const { setup } = useStore()
  useDocumentTitle('Order placed | BazaarNest')
  return (
    <div className="rounded-sm bg-white py-16 text-center shadow-sm">
      <div className="text-lg font-semibold">This is a demo store</div>
      <p className="mt-1 text-sm text-gray-600">No order was placed and no payment was taken.</p>
      <Link to={storePath(setup)} className="mt-4 inline-block rounded-sm bg-nest-600 px-6 py-2.5 text-sm font-semibold text-white">
        Back to store
      </Link>
    </div>
  )
}
