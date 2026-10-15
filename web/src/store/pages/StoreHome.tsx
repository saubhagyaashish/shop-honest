import { Link } from 'react-router'
import { useDocumentTitle } from '../../shared/useDocumentTitle'
import { discountPercent, formatINR, PRODUCTS } from '../catalog'
import { ProductArt } from '../components/ProductArt'
import { useStore } from '../useStore'
import { pricingOf, storePath } from '../variants'

export function StoreHome() {
  const { setup } = useStore()
  useDocumentTitle('BazaarNest | Festive Sale')
  return (
    <>
      <section className="rounded-sm bg-gradient-to-r from-nest-700 to-nest-500 px-6 py-8 text-white shadow-sm">
        <div className="text-xs font-bold tracking-widest text-saffron-400 uppercase">Festive Sale is live</div>
        <h1 className="mt-1 text-3xl font-extrabold">Top deals on audio & wearables</h1>
        <p className="mt-1 text-sm text-nest-100">Free delivery on every order · 7-day replacement</p>
      </section>
      <section className="mt-4 rounded-sm bg-white p-4 shadow-sm">
        <h2 className="text-lg font-semibold">Best of Electronics</h2>
        <div className="mt-3 grid grid-cols-2 gap-4 md:grid-cols-4">
          {PRODUCTS.map((p) => {
            const { price, mrp } = pricingOf(p, setup)
            return (
              <Link key={p.slug} to={storePath(setup, `/p/${p.slug}`)} className="group rounded border border-transparent p-2 hover:border-gray-200 hover:shadow">
                <ProductArt kind={p.kind} hex={p.colours[0].hex} className="aspect-square w-full" />
                <div className="mt-2 line-clamp-2 text-sm group-hover:text-nest-600">{p.name}</div>
                <div className="mt-1 flex flex-wrap items-baseline gap-2 text-sm">
                  <span className="font-semibold">{formatINR(price)}</span>
                  <s className="text-xs text-gray-500">{formatINR(mrp)}</s>
                  <span className="text-xs font-semibold text-green-700">{discountPercent(price, mrp)}% off</span>
                </div>
              </Link>
            )
          })}
        </div>
      </section>
    </>
  )
}
