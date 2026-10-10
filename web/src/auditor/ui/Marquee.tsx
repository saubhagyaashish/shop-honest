import { TONE_BG } from './styles'
import type { Tone } from './styles'

/** Endless ticker band. Content is duplicated once so the loop is seamless. */
export function Marquee({ items, tone = 'lime', reverse = false, className = '' }: { items: string[]; tone?: Tone; reverse?: boolean; className?: string }) {
  const row = (hidden: boolean) => (
    <div className="flex shrink-0 items-center" aria-hidden={hidden || undefined}>
      {items.map((item, i) => (
        <span key={i} className="flex items-center gap-6 px-3 font-display text-xl font-extrabold tracking-tight whitespace-nowrap uppercase sm:text-2xl">
          {item}
          <span aria-hidden="true">✦</span>
        </span>
      ))}
    </div>
  )
  return (
    <div className={`overflow-hidden border-y-2 border-ink py-3 ${TONE_BG[tone]} ${className}`}>
      <div className={`flex w-max ${reverse ? 'animate-marquee-reverse' : 'animate-marquee'}`}>
        {row(false)}
        {row(true)}
      </div>
    </div>
  )
}
