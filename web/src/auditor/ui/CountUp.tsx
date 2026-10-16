import { animate, useInView, useReducedMotion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'

/** Counts from 0 to `value` the first time it scrolls into view, with `decimals` places (0.959). */
export function CountUp({
  value,
  duration = 1.1,
  suffix = '',
  decimals = 0,
  className = '',
}: {
  value: number
  duration?: number
  suffix?: string
  decimals?: number
  className?: string
}) {
  const ref = useRef<HTMLSpanElement>(null)
  const inView = useInView(ref, { once: true })
  const reduced = useReducedMotion()
  const [shown, setShown] = useState(0)

  useEffect(() => {
    if (!inView) return
    const controls = animate(0, value, {
      duration: reduced ? 0 : duration,
      ease: [0.2, 0.8, 0.2, 1],
      onUpdate: (v) => setShown(Number(v.toFixed(decimals))),
    })
    return () => controls.stop()
  }, [inView, value, duration, reduced, decimals])

  return (
    <span ref={ref} className={`tabular-nums ${className}`}>
      {shown.toFixed(decimals)}
      {suffix}
    </span>
  )
}
