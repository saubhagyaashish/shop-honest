import { MotionConfig } from 'motion/react'
import { Link, Outlet, ScrollRestoration } from 'react-router'
import { Logo } from './brand/Logo'
import { REPO_URL } from './links'
import { auditSource } from './source'
import { GithubMark } from './ui/GithubMark'
import { Sticker } from './ui/Sticker'

export function AuditorLayout() {
  return (
    <MotionConfig reducedMotion="user">
      <div className="dot-grid min-h-screen overflow-x-clip bg-cream font-sans text-ink print:bg-white">
        <header className="sticky top-0 z-30 border-b-2 border-ink bg-cream/90 backdrop-blur print:static">
          <div className="mx-auto flex h-16 max-w-[1440px] items-center gap-4 px-4 sm:px-6">
            <Link to="/" aria-label="Shop Honest home">
              <Logo />
            </Link>
            <span className="hidden text-sm font-medium text-ink/60 xl:inline">dark-pattern audits under India’s CCPA guidelines</span>
            <nav aria-label="Site" className="ml-auto flex items-center gap-1 text-sm font-bold print:hidden">
              <Link to={{ pathname: '/', hash: '#samples' }} className="hidden rounded-lg px-3 py-1.5 hover:bg-ink/5 md:inline">
                Try a sample
              </Link>
              <Link to={{ pathname: '/', hash: '#squad' }} className="hidden rounded-lg px-3 py-1.5 hover:bg-ink/5 md:inline">
                How it works
              </Link>
              <a href={REPO_URL} target="_blank" rel="noreferrer" aria-label="Shop Honest on GitHub" className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 hover:bg-ink/5">
                <GithubMark size={18} /> <span className="hidden md:inline">GitHub</span>
              </a>
            </nav>
            <div className="flex items-center gap-3 print:hidden">
              {auditSource.mode === 'mock' ? (
                <span title="Audits replay real captures of the sample stores. The live agent backend plugs into the same event stream.">
                  <Sticker tone="sun" rotate={2}>
                    <span className="h-2 w-2 animate-blink rounded-full bg-ink" /> demo mode
                  </Sticker>
                </span>
              ) : (
                <span title="Audits run on Cloud Run with Gemini on Vertex AI.">
                  <Sticker tone="lime" rotate={2}>
                    <span className="h-2 w-2 animate-blink rounded-full bg-ink" />
                    <span>
                      live<span className="hidden sm:inline"> on Google Cloud</span>
                    </span>
                  </Sticker>
                </span>
              )}
            </div>
          </div>
        </header>
        <Outlet />
        <ScrollRestoration />
      </div>
    </MotionConfig>
  )
}
