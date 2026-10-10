import type { AuditEvent } from '../../shared/contract'
import type { AuditSource } from './AuditSource'

/** Consecutive stream errors, with no event in between, before we give up. */
const MAX_RETRIES = 3

/**
 * Talks to the backend (docs/API.md):
 *   POST /api/audits {targetUrl}            → {auditId}
 *   GET  /api/audits/:id/events             → text/event-stream of AuditEvent JSON, resumable
 *   POST /api/audits/:id/fast-forward       → replays only: skip the remaining delays
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
      if (!res.ok) throw new Error(await errorMessage(res))
      const { auditId } = (await res.json()) as { auditId: string }
      return auditId
    },

    subscribe(auditId, onEvent) {
      // EventSource reconnects by itself and sends Last-Event-ID; the server
      // resumes from there, so a blip doesn't lose or duplicate events.
      const source = new EventSource(`${baseUrl}/api/audits/${encodeURIComponent(auditId)}/events`)
      let finished = false
      let failures = 0
      source.onmessage = (message) => {
        failures = 0
        const event = JSON.parse(message.data as string) as AuditEvent
        if (event.type === 'audit.completed' || event.type === 'audit.failed') {
          finished = true
          source.close()
        }
        onEvent(event)
      }
      source.onerror = () => {
        if (finished) return
        failures += 1
        if (source.readyState === EventSource.CLOSED || failures >= MAX_RETRIES) {
          finished = true
          source.close()
          onEvent({ type: 'audit.failed', error: 'Lost the connection to the audit stream.' })
        }
      }
      return () => source.close()
    },

    skipAhead(auditId) {
      void fetch(`${baseUrl}/api/audits/${encodeURIComponent(auditId)}/fast-forward`, { method: 'POST' })
    },
  }
}

async function errorMessage(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: { message?: string } }
    if (body.error?.message) return body.error.message
  } catch {
    // not JSON; fall through
  }
  return `Could not start the audit (${res.status}).`
}
