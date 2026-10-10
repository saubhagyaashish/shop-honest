import { useState } from 'react'
import { useDocumentTitle } from '../../shared/useDocumentTitle'

/** The wall a logged-out shopper hits at checkout in some stores. There's no way past it. */
export function SignInWall() {
  const [tried, setTried] = useState(false)
  useDocumentTitle('Sign in | BazaarNest')
  return (
    <div className="mx-auto grid max-w-3xl overflow-hidden rounded-sm bg-white shadow-sm md:grid-cols-[2fr_3fr]">
      <div className="bg-nest-600 p-8 text-white">
        <h1 className="text-2xl font-semibold">Login</h1>
        <p className="mt-3 text-sm text-nest-100">Get access to your Orders, Wishlist and Recommendations, and complete your checkout.</p>
      </div>
      <form
        className="p-8"
        onSubmit={(e) => {
          e.preventDefault()
          setTried(true)
        }}
      >
        <h2 className="text-base font-semibold">Sign in to continue</h2>
        <label className="mt-5 block text-xs font-medium text-gray-500" htmlFor="login-id">
          Email or mobile number
        </label>
        <input id="login-id" type="text" autoComplete="username" className="mt-1 w-full border-b border-gray-300 py-2 text-sm outline-none focus:border-nest-600" />
        <label className="mt-4 block text-xs font-medium text-gray-500" htmlFor="login-password">
          Password
        </label>
        <input id="login-password" type="password" autoComplete="current-password" className="mt-1 w-full border-b border-gray-300 py-2 text-sm outline-none focus:border-nest-600" />
        <button type="submit" className="mt-6 w-full rounded-sm bg-saffron-500 py-3 text-sm font-bold text-white uppercase shadow-sm hover:bg-saffron-600">
          Sign in
        </button>
        {tried && <p className="mt-3 text-sm text-red-600">We couldn’t sign you in. This is a demo store; there are no accounts.</p>}
        <p className="mt-6 text-center text-sm text-nest-600">New to BazaarNest? Create an account</p>
      </form>
    </div>
  )
}
