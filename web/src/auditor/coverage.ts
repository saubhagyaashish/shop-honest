import type { JourneyStep, StepCapture } from '../shared/contract'
import { JOURNEY_STEPS } from '../shared/contract'

export interface Coverage {
  total: number
  audited: JourneyStep[]
  blocked?: { step: JourneyStep; reason: string }
  /** Steps after the block that the agent never saw. */
  notReached: JourneyStep[]
  complete: boolean
}

/** How much of the journey the audit actually covered. */
export function coverageOf(steps: StepCapture[]): Coverage {
  const audited = JOURNEY_STEPS.filter((s) => steps.some((c) => c.step === s && (c.status ?? 'audited') === 'audited'))
  const b = steps.find((c) => c.status === 'blocked')
  const blocked = b ? { step: b.step, reason: b.blockedReason ?? 'Could not continue' } : undefined
  const notReached = JOURNEY_STEPS.filter((s) => !audited.includes(s) && s !== blocked?.step)
  return { total: JOURNEY_STEPS.length, audited, blocked, notReached, complete: audited.length === JOURNEY_STEPS.length }
}
