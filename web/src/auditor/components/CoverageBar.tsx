import { Check, Lock } from 'lucide-react'
import type { StepCapture } from '../../shared/contract'
import { JOURNEY_STEPS } from '../../shared/contract'
import { coverageOf } from '../coverage'
import { STEP_LABEL } from '../labels'

/** How much of the journey was audited: five step pips and one plain sentence. */
export function CoverageBar({ steps }: { steps: StepCapture[] }) {
  const c = coverageOf(steps)
  return (
    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5" aria-label={label(c)}>
      <span className="flex gap-1" aria-hidden="true">
        {JOURNEY_STEPS.map((s) => {
          const ok = c.audited.includes(s)
          const blocked = c.blocked?.step === s
          return (
            <span
              key={s}
              title={`${STEP_LABEL[s]}: ${ok ? 'audited' : blocked ? c.blocked!.reason : 'not reached'}`}
              className={`grid h-5 w-6 place-items-center rounded-md border-2 ${
                ok ? 'border-ink bg-lime' : blocked ? 'border-ink bg-sun' : 'border-dashed border-ink/30 bg-white'
              }`}
            >
              {ok && <Check size={11} strokeWidth={3.5} />}
              {blocked && <Lock size={10} strokeWidth={3} />}
            </span>
          )
        })}
      </span>
      {c.complete ? (
        <span className="text-[12px] font-bold">
          Full journey audited · {c.total} of {c.total} steps
        </span>
      ) : (
        <span className="rounded-md border-2 border-ink bg-sun px-1.5 py-px text-[12px] font-bold">
          Partial audit · {c.audited.length} of {c.total} steps
          {c.blocked && ` · stopped at ${STEP_LABEL[c.blocked.step]}: ${c.blocked.reason.toLowerCase()}`}
        </span>
      )}
    </div>
  )
}

function label(c: ReturnType<typeof coverageOf>): string {
  return c.complete
    ? `Full journey audited, ${c.total} of ${c.total} steps`
    : `Partial audit, ${c.audited.length} of ${c.total} steps${c.blocked ? `, stopped at ${STEP_LABEL[c.blocked.step]}: ${c.blocked.reason}` : ''}`
}
