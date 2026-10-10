import { motion } from 'motion/react'

/** Hand-drawn underline that draws itself in. */
export function Squiggle({ className = '', color = '#ff5ca8', delay = 0.4 }: { className?: string; color?: string; delay?: number }) {
  return (
    <svg viewBox="0 0 300 24" preserveAspectRatio="none" className={className} aria-hidden="true">
      <motion.path
        d="M4 16 C 40 4, 70 22, 108 12 S 178 4, 214 14 S 270 20, 296 8"
        fill="none"
        stroke={color}
        strokeWidth="7"
        strokeLinecap="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.9, delay, ease: 'easeInOut' }}
      />
    </svg>
  )
}
