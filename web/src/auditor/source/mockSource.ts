import type { AuditEvent, JourneyStep } from '../../shared/contract'
import { JOURNEY_STEPS } from '../../shared/contract'
import { sampleForUrl } from '../samples'
import { buildMockAuditForStore } from '../mock/scripts'
import type { ScriptedEvent } from '../mock/scripts'
import { storeForKey } from '../../store/variants'
import type { StoreSetup } from '../../store/variants'
import { UnsupportedTargetError } from './AuditSource'
import type { AuditSource } from './AuditSource'

interface Run {
  events: ScriptedEvent[]
  next: number
  timer?: ReturnType<typeof setTimeout>
  deliver: (e: AuditEvent) => void
}

function storeFromAuditId(auditId: string): StoreSetup | undefined {
  const m = /^mock-(store-[a-z])-/.exec(auditId)
  return m ? storeForKey(m[1]) : undefined
}

/** Set VITE_MOCK_BLOCK_AT=checkout (or cart, payment…) to replay audits that hit a sign-in wall. */
function simulatedWall(): JourneyStep | undefined {
  const step = import.meta.env.VITE_MOCK_BLOCK_AT as string | undefined
  return JOURNEY_STEPS.find((s) => s === step)
}

/** Replays scripted audits of the demo stores with realistic pacing. */
export function createMockSource(): AuditSource {
  const runs = new Map<string, Run>()

  function stamp(event: AuditEvent, startedAt: string): AuditEvent {
    if (event.type === 'audit.started') return { ...event, startedAt }
    if (event.type === 'audit.completed') {
      return { ...event, report: { ...event.report, startedAt, completedAt: new Date().toISOString() } }
    }
    return event
  }

  return {
    mode: 'mock',

    async start(targetUrl) {
      const sample = sampleForUrl(targetUrl)
      if (!sample) {
        throw new UnsupportedTargetError(
          'This demo build replays audits of the sample stores. Auditing any URL arrives with the agent backend.',
        )
      }
      return `mock-${sample.key}-${Date.now().toString(36)}`
    },

    subscribe(auditId, onEvent) {
      const store = storeFromAuditId(auditId)
      if (!store) {
        onEvent({ type: 'audit.failed', error: `Unknown audit "${auditId}".` })
        return () => {}
      }
      const startedAt = new Date().toISOString()
      const run: Run = {
        events: buildMockAuditForStore(store, auditId, window.location.origin, { blockAt: simulatedWall() }),
        next: 0,
        deliver: (e) => onEvent(stamp(e, startedAt)),
      }
      runs.set(auditId, run)

      const tick = () => {
        const item = run.events[run.next]
        if (!item) return
        run.timer = setTimeout(() => {
          run.next += 1
          run.deliver(item.event)
          tick()
        }, item.delayMs)
      }
      tick()

      return () => {
        clearTimeout(run.timer)
        if (runs.get(auditId) === run) runs.delete(auditId)
      }
    },

    skipAhead(auditId) {
      const run = runs.get(auditId)
      if (!run) return
      clearTimeout(run.timer)
      while (run.next < run.events.length) {
        run.deliver(run.events[run.next].event)
        run.next += 1
      }
    },
  }
}
