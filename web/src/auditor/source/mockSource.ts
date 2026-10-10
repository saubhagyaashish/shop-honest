import type { AuditEvent } from '../../shared/contract'
import { sampleForUrl } from '../samples'
import { buildMockAudit } from '../mock/scripts'
import type { ScriptedEvent } from '../mock/scripts'
import type { StoreId } from '../../store/catalog'
import { UnsupportedTargetError } from './AuditSource'
import type { AuditSource } from './AuditSource'

interface Run {
  events: ScriptedEvent[]
  next: number
  timer?: ReturnType<typeof setTimeout>
  deliver: (e: AuditEvent) => void
}

function storeFromAuditId(auditId: string): StoreId | undefined {
  const m = /^mock-([ab])-/.exec(auditId)
  return m ? (m[1] as StoreId) : undefined
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
          'This demo build replays audits of the two sample stores. Auditing any URL arrives with the agent backend.',
        )
      }
      return `mock-${sample.storeId}-${Date.now().toString(36)}`
    },

    subscribe(auditId, onEvent) {
      const storeId = storeFromAuditId(auditId)
      if (!storeId) {
        onEvent({ type: 'audit.failed', error: `Unknown audit "${auditId}".` })
        return () => {}
      }
      const startedAt = new Date().toISOString()
      const run: Run = {
        events: buildMockAudit(storeId, auditId, window.location.origin),
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
