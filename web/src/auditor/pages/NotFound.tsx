import { Search } from 'lucide-react'
import { Link } from 'react-router'
import { useDocumentTitle } from '../../shared/useDocumentTitle'
import { Sticker } from '../ui/Sticker'
import { buttonClass } from '../ui/styles'

/** Any address the site doesn't have, inside the auditor's own header and style. */
export function NotFound() {
  useDocumentTitle('Page not found · Shop Honest')
  return (
    <main className="mx-auto grid min-h-[70vh] max-w-[1240px] place-items-center px-4 py-16 sm:px-6">
      <div className="brutal max-w-xl rounded-3xl bg-white p-8 text-center sm:p-10">
        <Sticker tone="sun" rotate={-4} className="!px-4 !py-1.5 font-display !text-xl">
          404 🤷
        </Sticker>
        <h1 className="mt-4 font-display text-[34px] leading-tight font-extrabold">This page isn’t here.</h1>
        <p className="mt-2 text-[15px] text-ink/70">The address may be mistyped, or the page has moved. Audits start from the front page.</p>
        <Link to="/" className={buttonClass('lime', 'md', 'mt-6')}>
          <Search size={18} strokeWidth={2.6} aria-hidden="true" /> Audit a store
        </Link>
      </div>
    </main>
  )
}
