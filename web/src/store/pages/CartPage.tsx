import { Link, useNavigate } from 'react-router'
import { useDocumentTitle } from '../../shared/useDocumentTitle'
import { findProduct, formatINR, PROTECTION_PLAN } from '../catalog'
import type { CartLine } from '../cart'
import { OrderSummary } from '../components/OrderSummary'
import { ProductArt } from '../components/ProductArt'
import { deliveryDateLabel } from '../dates'
import { useStore } from '../useStore'
import { storePath } from '../variants'

export function CartPage() {
  const { setup, state, removeLine, setProtection } = useStore()
  const navigate = useNavigate()
  useDocumentTitle('Shopping Cart | BazaarNest')

  if (state.lines.length === 0) {
    return (
      <div className="rounded-sm bg-white py-16 text-center shadow-sm">
        <div className="text-lg font-medium">Your cart is empty</div>
        <Link to={storePath(setup)} className="mt-4 inline-block rounded-sm bg-nest-600 px-6 py-2.5 text-sm font-semibold text-white">
          Shop now
        </Link>
      </div>
    )
  }

  const hasProtection = state.lines.some((l) => l.id === PROTECTION_PLAN.id)
  const offerProtection = !setup.behaviour.autoAddProtection

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
      <section className="rounded-sm bg-white shadow-sm">
        <h1 className="border-b border-gray-100 px-5 py-3 text-lg font-semibold">My Cart ({state.lines.length})</h1>
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3 text-sm">
          <span>Deliver to: <b>Priya Sharma, 560001</b></span>
          <span className="text-gray-500">Delivery by {deliveryDateLabel(5)}</span>
        </div>
        <ul>
          {state.lines.map((line) => (
            <CartItem key={line.id} line={line} onRemove={() => removeLine(line.id)} />
          ))}
        </ul>
        {offerProtection && (
          <label id="protection-offer" className="mx-5 my-4 flex cursor-pointer items-start gap-3 rounded border border-gray-200 p-3 text-sm">
            <input type="checkbox" className="mt-0.5 h-4 w-4 accent-nest-600" checked={hasProtection} onChange={(e) => setProtection(e.target.checked)} />
            <span>
              <b>Add {PROTECTION_PLAN.name}</b> for {formatINR(PROTECTION_PLAN.price)}
              <span className="block text-gray-500">Optional. Covers accidental drops and liquid damage for 12 months.</span>
            </span>
          </label>
        )}
        <div className="flex justify-end border-t border-gray-100 px-5 py-3 shadow-[0_-2px_6px_rgba(0,0,0,0.04)]">
          <button id="to-checkout" type="button" onClick={() => navigate(storePath(setup, '/checkout'))} className="rounded-sm bg-saffron-500 px-10 py-3.5 text-sm font-bold text-white uppercase shadow-sm hover:bg-saffron-600">
            Place order
          </button>
        </div>
      </section>
      <OrderSummary stage="cart" />
    </div>
  )
}

function CartItem({ line, onRemove }: { line: CartLine; onRemove: () => void }) {
  const product = findProduct(line.slug)
  return (
    <li id={`line-${line.id}`} className="flex gap-4 border-b border-gray-100 px-5 py-4">
      <div className="h-20 w-20 shrink-0 overflow-hidden rounded border border-gray-100">
        {product && line.colour ? (
          <ProductArt kind={product.kind} hex={line.colour.hex} className="h-full w-full" />
        ) : (
          <div className="grid h-full w-full place-items-center bg-nest-50 text-nest-600">
            <svg viewBox="0 0 24 24" className="h-9 w-9 fill-current" aria-hidden="true">
              <path d="M12 2 4 5v6c0 5 3.4 9.7 8 11 4.6-1.3 8-6 8-11V5l-8-3Zm-1.2 14.2-3.5-3.5 1.4-1.4 2.1 2.1 4.9-4.9 1.4 1.4-6.3 6.3Z" />
            </svg>
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1 text-sm">
        <div className="font-medium">{line.name}</div>
        {line.colour && <div className="text-gray-500">{line.colour.name}</div>}
        {line.kind === 'addon' && <div className="text-gray-500">12 months · Sold by BazaarNest Care</div>}
        <div className="mt-1 flex items-baseline gap-2">
          {line.mrp > line.unitPrice && <s className="text-xs text-gray-500">{formatINR(line.mrp)}</s>}
          <span className="font-semibold">{formatINR(line.unitPrice)}</span>
          {line.qty > 1 && <span className="text-gray-500">× {line.qty}</span>}
        </div>
        <button type="button" onClick={onRemove} className="mt-2 text-xs font-semibold text-gray-700 uppercase hover:text-nest-600">
          Remove
        </button>
      </div>
    </li>
  )
}
