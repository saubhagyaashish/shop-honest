import { motion, useReducedMotion } from 'motion/react'
import { useState } from 'react'

const COLORS = ['#c6f432', '#ff5ca8', '#3b5bff', '#ffd23f', '#4ade9a', '#c4b5fd']

interface Piece {
  x: number
  y: number
  rotate: number
  color: string
  shape: 'rect' | 'circle'
  delay: number
}

function makePieces(count: number): Piece[] {
  return Array.from({ length: count }, (_, i) => {
    const angle = (i / count) * Math.PI * 2 + Math.random() * 0.4
    const dist = 140 + Math.random() * 220
    return {
      x: Math.cos(angle) * dist,
      y: Math.sin(angle) * dist * 0.7 - 60,
      rotate: Math.random() * 540 - 270,
      color: COLORS[i % COLORS.length],
      shape: i % 3 === 0 ? 'circle' : 'rect',
      delay: Math.random() * 0.15,
    }
  })
}

/** One-shot burst from the centre of its (relative) parent. */
export function Confetti({ count = 42 }: { count?: number }) {
  const reduced = useReducedMotion()
  const [pieces] = useState(() => makePieces(count))
  if (reduced) return null
  return (
    <div className="pointer-events-none absolute inset-0 overflow-visible print:hidden" aria-hidden="true">
      {pieces.map((p, i) => (
        <motion.span
          key={i}
          className={`absolute top-1/2 left-1/2 block border-2 border-ink ${p.shape === 'circle' ? 'h-3 w-3 rounded-full' : 'h-2.5 w-4 rounded-[2px]'}`}
          style={{ backgroundColor: p.color }}
          initial={{ x: 0, y: 0, rotate: 0, opacity: 1, scale: 0.4 }}
          animate={{ x: p.x, y: [0, p.y, p.y + 160], rotate: p.rotate, opacity: [1, 1, 0], scale: 1 }}
          transition={{ duration: 1.8, delay: p.delay, ease: 'easeOut', times: [0, 0.45, 1] }}
        />
      ))}
    </div>
  )
}
