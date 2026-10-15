import { useMemo } from 'react'
import { Link, Outlet, ScrollRestoration, useParams } from 'react-router'
import { applySettings, readPatch } from './settings'
import { StoreProvider } from './StoreContext'
import { useStore } from './useStore'
import { storeForKey, storePath } from './variants'

export function StoreLayout() {
  const { storeKey } = useParams()
  // A settings patch from the auditor's own browser turns this into a fixed copy (settings.ts); shoppers never have one.
  const setup = useMemo(() => {
    const base = storeForKey(storeKey)
    return base && applySettings(base, readPatch())
  }, [storeKey])
  if (!setup) {
    return (
      <div className="grid min-h-screen place-items-center font-store text-gray-600">
        <p>
          Store not found. <Link className="text-nest-600 underline" to="/">Back to the auditor</Link>
        </p>
      </div>
    )
  }
  return (
    <StoreProvider key={setup.id} setup={setup}>
      <div className="flex min-h-screen flex-col bg-[#f1f3f6] font-store text-[15px] text-gray-900">
        <StoreHeader />
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-4">
          <Outlet />
        </main>
        <StoreFooter />
        <ScrollRestoration />
      </div>
    </StoreProvider>
  )
}

const CATEGORIES = ['Electronics', 'Audio', 'Wearables', 'Mobiles', 'Home', 'Fashion', 'Beauty', 'Toys', 'Grocery']

function StoreHeader() {
  const { setup, state } = useStore()
  const count = state.lines.reduce((n, l) => n + l.qty, 0)
  return (
    <header className="bg-nest-600 text-white shadow-sm">
      <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-2.5 sm:gap-6">
        <Link to={storePath(setup)} className="flex shrink-0 items-baseline gap-0.5 text-xl font-extrabold italic tracking-tight">
          Bazaar<span className="text-saffron-400">Nest</span>
        </Link>
        <div className="hidden flex-1 items-center rounded-sm bg-white px-3 py-2 text-sm text-gray-400 sm:flex">
          <svg viewBox="0 0 20 20" className="mr-2 h-4 w-4 fill-current" aria-hidden="true">
            <path d="M8.5 3a5.5 5.5 0 0 1 4.38 8.83l3.65 3.64-1.06 1.06-3.64-3.65A5.5 5.5 0 1 1 8.5 3Zm0 1.5a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z" />
          </svg>
          Search for products, brands and more
        </div>
        <nav className="ml-auto flex items-center gap-5 text-sm font-medium">
          <span className="hidden sm:inline">Hi, Priya</span>
          <Link to={storePath(setup, '/cart')} className="flex items-center gap-1.5">
            <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current" aria-hidden="true">
              <path d="M7 18a2 2 0 1 0 0 4 2 2 0 0 0 0-4Zm10 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4ZM3 3h2l2.7 11.1A2 2 0 0 0 9.6 16H18v-2H9.6l-.3-1H18a2 2 0 0 0 1.9-1.4L22 6H6.2L5.6 3.5A2 2 0 0 0 3.7 2H3v1Z" />
            </svg>
            Cart
            {count > 0 && (
              <span className="rounded-full bg-saffron-400 px-1.5 text-xs font-bold text-nest-900">{count}</span>
            )}
          </Link>
        </nav>
      </div>
      <div className="bg-white text-gray-700 shadow-sm">
        <div className="mx-auto flex max-w-6xl gap-6 overflow-x-auto px-4 py-2 text-[13px] font-medium">
          {CATEGORIES.map((c) => (
            <span key={c} className="shrink-0">{c}</span>
          ))}
        </div>
      </div>
    </header>
  )
}

function StoreFooter() {
  return (
    <footer className="mt-8 bg-nest-900 text-xs text-nest-100">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-4">
        <span>© 2026 BazaarNest. Demo storefront, not a real shop. No orders are placed and no payments are taken.</span>
        <span>Help · Returns · Terms · Privacy</span>
      </div>
    </footer>
  )
}
