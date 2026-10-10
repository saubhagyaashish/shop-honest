import type { ReactNode } from 'react'
import { TONE_BG } from './styles'
import type { Tone } from './styles'

export function Sticker({ tone = 'white', rotate = 0, className = '', children }: { tone?: Tone; rotate?: number; className?: string; children: ReactNode }) {
  return (
    <span className={`sticker ${TONE_BG[tone]} ${className}`} style={rotate ? { rotate: `${rotate}deg` } : undefined}>
      {children}
    </span>
  )
}
