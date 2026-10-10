import type { AuditEvent } from '../../shared/contract'
import type { AuditSource } from './AuditSource'

/**
 * Talks to the agent backend:
 *   POST /api/audits {targetUrl} → {auditId}
 *   GET  /api/audits/:id/events  → text/event-stream of AuditEvent JSON
 */
export function createSseSource(baseUrl = ''): AuditSource {
  return {
    mode: 'live',

    async start(targetUrl) {
      const res = await fetch(`${baseUrl}/api/audits`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetUrl }),
      })
      if (!res.ok) throw new Error(`Could not start the audit (${res.status}).`)
      const { auditId } = (await res.json()) as { auditId: string }
      return auditId
    },

    subscribe(auditId, onEvent) {
      const source = new EventSource(`${baseUrl}/api/audits/${encodeURIComponent(auditId)}/events`)
      let finished = false
      source.onmessage = (message) => {
        const event = JSON.parse(message.data as string) as AuditEvent
        if (event.type === 'audit.completed' || event.type === 'audit.failed') {
          finished = true
          source.close()
        }
        onEvent(event)
      }
      source.onerror = () => {
        if (finished) return
        finished = true
        source.close()
        onEvent({ type: 'audit.failed', error: 'Lost the connection to the audit stream.' })
      }
      return () => source.close()
    },
  }
}
