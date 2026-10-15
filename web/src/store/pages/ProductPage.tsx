import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { useDocumentTitle } from '../../shared/useDocumentTitle'
import { findProduct } from '../catalog'
import { BuyersNote, PriceBlock, SaleClock, StockNote } from '../components/ProductSignals'
import { deliveryDateLabel } from '../dates'
import { OfferModal } from '../components/OfferModal'
import { ProductArt } from '../components/ProductArt'
import { useStore } from '../useStore'
import { pricingOf, storePath } from '../variants'

export function ProductPage() {
  const { slug } = useParams()
  const product = findProduct(slug)
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const { setup, addProduct } = useStore()
  useDocumentTitle(product ? `${product.name} | BazaarNest` : 'BazaarNest')

  if (!product) {
    return (
      <p className="py-20 text-center text-gray-600">
        Product not found. <Link className="text-nest-600 underline" to={storePath(setup)}>Continue shopping</Link>
      </p>
    )
  }

  const colour = product.colours.find((c) => c.id === params.get('colour')) ?? product.colours[0]
  const { price, mrp } = pricingOf(product, setup)

  function addAndGo(to: '/cart' | '/checkout') {
    addProduct(product!, colour)
    navigate(storePath(setup, to))
  }

  return (
    <>
      <OfferModal />
      <nav className="mb-3 text-xs text-gray-500">
        <Link to={storePath(setup)}>Home</Link> › Electronics › Audio › <span className="text-gray-700">{product.brand}</span>
      </nav>
      <div className="grid gap-4 rounded-sm bg-white p-4 shadow-sm md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] md:p-6">
        <div>
          <div className="overflow-hidden rounded border border-gray-100">
            <ProductArt kind={product.kind} hex={colour.hex} className="aspect-square w-full" />
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button id="add-to-cart" type="button" onClick={() => addAndGo('/cart')} className="rounded-sm bg-saffron-500 py-3.5 text-sm font-bold text-white uppercase shadow-sm hover:bg-saffron-600">
              Add to cart
            </button>
            <button id="buy-now" type="button" onClick={() => addAndGo('/cart')} className="rounded-sm bg-nest-600 py-3.5 text-sm font-bold text-white uppercase shadow-sm hover:bg-nest-700">
              Buy now
            </button>
          </div>
        </div>

        <div>
          <div className="text-sm font-medium text-gray-500">{product.brand}</div>
          <h1 className="text-xl font-medium leading-snug">{product.name}</h1>
          <div className="mt-1 text-sm text-gray-600">{product.tagline}</div>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
            <span className="rounded bg-green-700 px-1.5 py-0.5 text-xs font-bold text-white">{product.rating.toFixed(1)} ★</span>
            <span className="text-gray-500">{product.ratingCount.toLocaleString('en-IN')} ratings</span>
          </div>
          <BuyersNote />

          <PriceBlock price={price} mrp={mrp} />
          <div>
            <SaleClock />
          </div>
          <StockNote />

          <div className="mt-5">
            <div className="text-sm font-medium text-gray-600">
              Colour: <span className="text-gray-900">{colour.name}</span>
            </div>
            <div className="mt-2 flex gap-2" role="radiogroup" aria-label="Colour">
              {product.colours.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  role="radio"
                  aria-checked={c.id === colour.id}
                  aria-label={c.name}
                  data-colour={c.id}
                  onClick={() => setParams({ colour: c.id })}
                  className={`h-14 w-14 rounded border-2 p-1 ${c.id === colour.id ? 'border-nest-600' : 'border-gray-200'}`}
                >
                  <ProductArt kind={product.kind} hex={c.hex} className="h-full w-full" />
                </button>
              ))}
            </div>
          </div>

          <div className="mt-5 grid gap-1 text-sm">
            <div><span className="inline-block w-24 text-gray-500">Delivery</span>Free delivery by <b>{deliveryDateLabel(5)}</b></div>
            <div><span className="inline-block w-24 text-gray-500">Seller</span>Sonique Retail · 4.6 ★</div>
            <div><span className="inline-block w-24 text-gray-500">Returns</span>7-day replacement</div>
          </div>

          <div className="mt-5">
            <div className="text-sm font-semibold">Highlights</div>
            <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-gray-700">
              {product.highlights.map((h) => <li key={h}>{h}</li>)}
            </ul>
          </div>
        </div>
      </div>
    </>
  )
}
