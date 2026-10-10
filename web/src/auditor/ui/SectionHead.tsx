import type { ReactNode } from 'react'
import { Sticker } from './Sticker'

/** Section heading on the report: small kicker sticker, 26–28px title, optional note. */
export function SectionHead({ kicker, title, count, note, right }: { kicker: string; title: ReactNode; count?: number; note?: string; right?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <div>
        <Sticker tone="white" rotate={-2}>{kicker}</Sticker>
        <h2 className="mt-2 flex items-center gap-2.5 font-display text-[26px] leading-tight font-extrabold tracking-tight sm:text-[28px]">
          {title}
          {count !== undefined && <span className="sticker bg-ink !text-xs text-cream">{count}</span>}
        </h2>
        {note && <p className="mt-1 max-w-2xl text-[15px] text-ink/70">{note}</p>}
      </div>
      {right}
    </div>
  )
}
