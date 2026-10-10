import { Check } from 'lucide-react'
import { motion } from 'motion/react'
import type { Finding, JourneyStep } from '../../shared/contract'
import { JOURNEY_STEPS } from '../../shared/contract'
import { STEP_ICON, STEP_LABEL } from '../labels'

interface Props {
  currentStep?: JourneyStep
  visited: JourneyStep[]
  findings: Finding[]
  done: boolean
}

export function JourneyTimeline({ currentStep, visited, findings, done }: Props) {
  return (
    <ol>
      {JOURNEY_STEPS.map((step, i) => {
        const isCurrent = step === currentStep && !done
        const isDone = visited.includes(step) && !isCurrent
        const hits = findings.filter((f) => f.step === step)
        const confirmed = hits.filter((f) => f.status === 'confirmed').length
        const review = hits.length - confirmed
        const Icon = isDone ? Check : STEP_ICON[step]
        return (
          <li key={step} className="relative flex gap-3 pb-5 last:pb-0">
            {i < JOURNEY_STEPS.length - 1 && (
              <span className={`absolute top-11 left-[19px] h-[calc(100%-40px)] border-l-2 ${isDone ? 'border-ink' : 'border-dashed border-ink/30'}`} />
            )}
            <span className="relative">
              {isCurrent && (
                <motion.span
                  className="absolute inset-0 rounded-xl bg-sun"
                  animate={{ scale: [1, 1.35, 1], opacity: [0.7, 0, 0.7] }}
                  transition={{ duration: 1.6, repeat: Infinity }}
                />
              )}
              <span
                className={`relative grid h-10 w-10 place-items-center rounded-xl border-2 ${
                  isCurrent ? 'border-ink bg-sun shadow-brutal-sm' : isDone ? 'border-ink bg-lime shadow-brutal-sm' : 'border-ink/25 bg-white text-ink/35'
                }`}
              >
                <Icon size={18} strokeWidth={2.6} aria-hidden="true" />
              </span>
            </span>
            <div className="min-w-0 pt-0.5">
              <div className={`text-sm font-bold ${isCurrent || isDone ? '' : 'text-ink/40'}`}>{STEP_LABEL[step]}</div>
              <div className="mt-1 flex flex-wrap gap-1">
                {confirmed > 0 && <span className="rounded-md border-2 border-ink bg-pink px-1.5 text-[11px] leading-4 font-bold">{confirmed} 🚩</span>}
                {review > 0 && <span className="rounded-md border-2 border-ink bg-sun px-1.5 text-[11px] leading-4 font-bold">{review} 🤔</span>}
                {isDone && hits.length === 0 && <span className="text-[11px] font-bold text-ink/50">clean ✓</span>}
                {isCurrent && <span className="text-[11px] font-bold text-ink/60">checking…</span>}
              </div>
            </div>
          </li>
        )
      })}
    </ol>
  )
}
