import type { ReactNode } from 'react'
import { Navigate, useNavigate } from 'react-router'
import { useDocumentTitle } from '../../shared/useDocumentTitle'
import { EXPRESS_DELIVERY_PRICE, formatINR, PLUS_MEMBERSHIP } from '../catalog'
import type { Delivery } from '../cart'
import { OrderSummary } from '../components/OrderSummary'
import { SignInWall } from '../components/SignInWall'
import { deliveryDateLabel } from '../dates'
import { useStore } from '../useStore'
import { storePath } from '../variants'

export function CheckoutPage() {
  const { setup, state } = useStore()
  const navigate = useNavigate()
  useDocumentTitle('Checkout | BazaarNest')

  if (state.lines.length === 0) return <Navigate to={storePath(setup, '/cart')} replace />
  if (setup.behaviour.signInWallAt === 'checkout') return <SignInWall />

  const toPayment = () => navigate(storePath(setup, '/payment'))

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="space-y-4">
        <Section n={1} title="Delivery address">
          <label className="flex cursor-pointer items-start gap-3 text-sm">
            <input type="radio" name="address" defaultChecked className="mt-1 accent-nest-600" />
            <span>
              <b>Priya Sharma</b> <span className="ml-1 rounded bg-gray-100 px-1.5 py-0.5 text-[11px] font-semibold text-gray-600">HOME</span> 98450 12345
              <span className="block text-gray-600">221B, 4th Cross, MG Road, Bengaluru, Karnataka 560001</span>
            </span>
          </label>
        </Section>
        <Section n={2} title="Membership">
          <PlusOptIn />
        </Section>
        <Section n={3} title="Delivery speed">
          {setup.behaviour.lopsidedDeliveryChoice ? <PushyDeliveryChoice onDone={toPayment} /> : <EvenDeliveryChoice onDone={toPayment} />}
        </Section>
      </div>
      <OrderSummary stage="checkout" />
    </div>
  )
}

function Section({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <section className="rounded-sm bg-white shadow-sm">
      <h2 className="flex items-center gap-3 bg-nest-600 px-5 py-2.5 text-sm font-semibold text-white uppercase">
        <span className="grid h-5 w-5 place-items-center rounded-sm bg-white text-xs text-nest-600">{n}</span>
        {title}
      </h2>
      <div className="px-5 py-4">{children}</div>
    </section>
  )
}

function PlusOptIn() {
  const { setup, plusOn, setPlus } = useStore()
  const finePrint = setup.behaviour.membershipTickedByDefault
  return (
    <label id="plus-optin" className="flex cursor-pointer items-start gap-3 text-sm">
      <input type="checkbox" className="mt-0.5 h-4 w-4 accent-nest-600" checked={plusOn} onChange={(e) => setPlus(e.target.checked)} />
      <span>
        <b>Add {PLUS_MEMBERSHIP.name}</b>: free express delivery and early access to sales
        {finePrint ? (
          <span className="block text-[10px] leading-tight text-gray-400">
            {formatINR(PLUS_MEMBERSHIP.monthly)}/month, billed from today. Auto-renews until cancelled via written request.
          </span>
        ) : (
          <span className="block text-gray-600">
            {formatINR(PLUS_MEMBERSHIP.monthly)}/month, auto-renews. Cancel anytime from My Account in one click.
          </span>
        )}
      </span>
    </label>
  )
}

function PushyDeliveryChoice({ onDone }: { onDone: () => void }) {
  const { setDelivery } = useStore()
  const choose = (d: Delivery) => {
    setDelivery(d)
    onDone()
  }
  return (
    <div id="delivery-choice" className="text-center">
      <div className="rounded-lg border-2 border-saffron-400 bg-saffron-100 p-5">
        <div className="text-lg font-bold">⚡ Get it tomorrow with Express</div>
        <div className="text-sm text-gray-700">Most customers choose Express delivery</div>
        <button
          id="express-upgrade"
          type="button"
          onClick={() => choose('express')}
          className="mt-4 w-full rounded-md bg-saffron-500 py-4 text-base font-extrabold text-white uppercase shadow hover:bg-saffron-600"
        >
          Upgrade to Express · {formatINR(EXPRESS_DELIVERY_PRICE)}
        </button>
      </div>
      <button id="standard-delivery-link" type="button" onClick={() => choose('standard')} className="mt-3 text-[11px] text-gray-400 hover:underline">
        continue with standard delivery
      </button>
    </div>
  )
}

function EvenDeliveryChoice({ onDone }: { onDone: () => void }) {
  const { state, setDelivery } = useStore()
  const options: { id: Delivery; label: string; detail: string; price: string }[] = [
    { id: 'standard', label: 'Standard delivery', detail: `By ${deliveryDateLabel(5)}`, price: 'FREE' },
    { id: 'express', label: 'Express delivery', detail: `By ${deliveryDateLabel(1)}`, price: formatINR(EXPRESS_DELIVERY_PRICE) },
  ]
  return (
    <div>
      <div id="delivery-choice" role="radiogroup" aria-label="Delivery speed" className="grid gap-3 sm:grid-cols-2">
        {options.map((o) => (
          <label key={o.id} className={`flex cursor-pointer items-start gap-3 rounded border p-3 text-sm ${state.delivery === o.id ? 'border-nest-600 bg-nest-50' : 'border-gray-200'}`}>
            <input type="radio" name="delivery" className="mt-0.5 accent-nest-600" checked={state.delivery === o.id} onChange={() => setDelivery(o.id)} />
            <span className="flex-1">
              <b>{o.label}</b>
              <span className="block text-gray-600">{o.detail}</span>
            </span>
            <span className="font-semibold">{o.price}</span>
          </label>
        ))}
      </div>
      <div className="mt-4 flex justify-end">
        <button id="continue-to-payment" type="button" onClick={onDone} className="rounded-sm bg-saffron-500 px-10 py-3 text-sm font-bold text-white uppercase shadow-sm hover:bg-saffron-600">
          Continue to payment
        </button>
      </div>
    </div>
  )
}
