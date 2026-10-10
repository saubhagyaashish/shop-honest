import { MotionConfig } from 'motion/react'
import { Link, Outlet, ScrollRestoration } from 'react-router'
import { Logo } from './brand/Logo'
import { auditSource } from './source'
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
            <span className="hidden text-sm font-medium text-ink/60 lg:inline">dark-pattern audits under India’s CCPA guidelines</span>
            <div className="ml-auto flex items-center gap-3 print:hidden">
              {auditSource.mode === 'mock' && (
                <span title="Audits replay real captures of the sample stores. The live agent backend plugs into the same event stream.">
                  <Sticker tone="sun" rotate={2}>
                    <span className="h-2 w-2 animate-blink rounded-full bg-ink" /> demo mode
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
