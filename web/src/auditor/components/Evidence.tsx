import { X } from 'lucide-react'
import { motion } from 'motion/react'
import { useEffect } from 'react'
import type { BBox, EvidenceFrame, Finding } from '../../shared/contract'
import { PATTERNS } from '../../shared/patterns'
import { buttonClass } from '../ui/styles'
import { SeverityBadge } from './bits'

function Highlight({ bbox }: { bbox: BBox }) {
  return (
    <div
      className="pointer-events-none absolute rounded-md border-[3px] border-pink bg-pink/15"
      style={{ left: `${bbox.x * 100}%`, top: `${bbox.y * 100}%`, width: `${bbox.w * 100}%`, height: `${bbox.h * 100}%` }}
    />
  )
}

/** Full screenshot with the cited element outlined. */
export function EvidenceImage({ frame }: { frame: EvidenceFrame }) {
  return (
    <div className="relative">
      <img src={frame.screenshotUrl} alt={frame.caption} className="block w-full" />
      {frame.bbox && <Highlight bbox={frame.bbox} />}
    </div>
  )
}

/**
 * Screenshot cropped and zoomed around the cited element. Uses translate
 * percentages (relative to the image itself), so no image dimensions needed.
 */
export function EvidenceCrop({ frame, className = 'aspect-[16/10]' }: { frame: EvidenceFrame; className?: string }) {
  const b = frame.bbox ?? { x: 0, y: 0, w: 1, h: 1 }
  const regionW = Math.min(1, Math.max(0.4, b.w * 1.45))
  const cx = Math.min(1 - regionW / 2, Math.max(regionW / 2, b.x + b.w / 2))
  const cy = b.y + b.h / 2
  return (
    <div className={`relative overflow-hidden bg-cream ${className}`}>
      <div className="absolute top-1/2 left-1/2" style={{ width: `${100 / regionW}%`, transform: `translate(-${cx * 100}%, -${cy * 100}%)` }}>
        <EvidenceImage frame={frame} />
      </div>
    </div>
  )
}

/** Evidence crop as a taped polaroid. */
export function Polaroid({ frame, index, total }: { frame: EvidenceFrame; index: number; total: number }) {
  const tilt = total > 1 ? (index % 2 === 0 ? -1.6 : 1.4) : -1.2
  return (
    <figure className="relative border-2 border-ink bg-white p-2 pb-1.5 shadow-brutal-sm" style={{ rotate: `${tilt}deg` }}>
      <span className="absolute -top-3 left-1/2 h-5 w-20 -translate-x-1/2 -rotate-3 border-2 border-ink/70 bg-sun/80" aria-hidden="true" />
      <EvidenceCrop frame={frame} className={`border-2 border-ink ${total > 1 ? 'aspect-[2/1]' : 'aspect-[16/10]'}`} />
      <figcaption className="px-0.5 pt-1.5 font-display text-[13px] font-bold">
        {total > 1 && <span className="mr-1 text-pink">#{index + 1}</span>}
        {frame.caption}
      </figcaption>
    </figure>
  )
}

export function EvidenceViewer({ finding, onClose }: { finding: Finding; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [onClose])

  const frames = finding.evidence.frames
  return (
    <motion.div
      className="fixed inset-0 z-50 overflow-y-auto bg-ink/70 p-4 backdrop-blur-sm sm:p-8"
      onClick={onClose}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
    >
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label={finding.title}
        className="brutal mx-auto max-w-6xl rounded-3xl bg-white"
        onClick={(e) => e.stopPropagation()}
        initial={{ y: 30, scale: 0.97 }}
        animate={{ y: 0, scale: 1 }}
        transition={{ type: 'spring', stiffness: 300, damping: 26 }}
      >
        <div className="flex items-start justify-between gap-4 border-b-2 border-ink px-6 py-4">
          <div>
            <div className="flex flex-wrap items-center gap-2 text-xs font-bold">
              <SeverityBadge severity={finding.severity} />
              {PATTERNS[finding.patternId].name} · {finding.rule.clause}
            </div>
            <h2 className="mt-1.5 font-display text-xl font-extrabold">{finding.title}</h2>
          </div>
          <button type="button" onClick={onClose} className={buttonClass('white', 'sm')} aria-label="Close">
            Close <X size={16} strokeWidth={2.6} aria-hidden="true" />
          </button>
        </div>
        <div className={`grid gap-6 bg-cream p-6 ${frames.length > 1 ? 'lg:grid-cols-2' : ''}`}>
          {frames.map((f, i) => (
            <figure key={i}>
              <div className="overflow-hidden rounded-xl border-2 border-ink">
                <EvidenceImage frame={f} />
              </div>
              <figcaption className="mt-2 font-display text-sm font-bold">
                {frames.length > 1 && <span className="mr-1.5 text-pink">#{i + 1}</span>}
                {f.caption}
              </figcaption>
            </figure>
          ))}
        </div>
        <div className="rounded-b-3xl border-t-2 border-ink px-6 py-3 font-mono text-xs break-all text-ink/60">{finding.pageUrl}</div>
      </motion.div>
    </motion.div>
  )
}
