import type { AuditEvent } from '../../shared/contract'
import { ApiUnreachableError } from './AuditSource'
import type { AuditSource } from './AuditSource'

/** Consecutive stream errors, with no event in between, before we give up. */
const MAX_RETRIES = 3
/** Silence after which the stream is reopened from the last event (the server pings every 15 s, but JS can't see pings). */
const SILENCE_MS = 60_000
/** Watchdog reopens per audit before giving up. */
const MAX_REOPENS = 10
/** Audits this tab started as live runs (kept across a refresh). */
const LIVE_KEY = 'shophonest-live-audits'

function liveAudits(): string[] {
  try {
    return JSON.parse(sessionStorage.getItem(LIVE_KEY) ?? '[]') as string[]
  } catch {
    return []
  }
}

function rememberLive(auditId: string) {
  try {
    sessionStorage.setItem(LIVE_KEY, JSON.stringify([...liveAudits().slice(-20), auditId]))
  } catch {
    // storage unavailable: the Skip button just stays visible
  }
}

/**
 * Talks to the backend (docs/API.md):
 *   POST /api/audits {targetUrl}            → {auditId}
 *   GET  /api/audits/:id/events             → text/event-stream of AuditEvent JSON, resumable
 *   POST /api/audits/:id/fast-forward       → replays only: skip the remaining delays
 */
/**
 * `streamBase` can point the event stream at a different origin than the rest of the API:
 * Firebase Hosting buffers streamed responses, so in production the stream goes straight to
 * Cloud Run (ADR-0010) while everything else stays same-origin.
 */
export function createSseSource(baseUrl = '', streamBase = baseUrl): AuditSource {
  return {
    mode: 'live',

    async start(targetUrl, options) {
      let res: Response
      try {
        res = await fetch(`${baseUrl}/api/audits`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ targetUrl, mode: options?.live ? 'live' : 'auto' }),
        })
      } catch {
        throw new ApiUnreachableError()
      }
      if (!res.ok) {
        // Our API always answers errors in JSON; anything else (a 404 or 502 page) means no backend answered.
        if (!res.headers.get('content-type')?.includes('application/json')) throw new ApiUnreachableError()
        throw new Error(await errorMessage(res))
      }
      const { auditId, mode } = (await res.json()) as { auditId: string; mode: 'replay' | 'live' }
      if (mode === 'live') rememberLive(auditId)
      return auditId
    },

    subscribe(auditId, onEvent) {
      // EventSource reconnects by itself after an error and sends Last-Event-ID; the server
      // resumes from there, so a blip doesn't lose or duplicate events. A connection that
      // silently stops delivering raises no error, so a watchdog reopens the stream from
      // the last event seen when nothing has arrived for a while.
      const url = `${streamBase}/api/audits/${encodeURIComponent(auditId)}/events`
      let source: EventSource
      let finished = false
      let failures = 0
      let lastId = ''
      let watchdog: ReturnType<typeof setTimeout> | undefined
      let reopened = 0

      const stop = () => {
        finished = true
        clearTimeout(watchdog)
        source.close()
      }
      const arm = () => {
        clearTimeout(watchdog)
        watchdog = setTimeout(() => {
          if (finished) return
          if (reopened >= MAX_REOPENS) {
            stop()
            onEvent({ type: 'audit.failed', error: 'Lost the connection to the audit stream.' })
            return
          }
          reopened += 1
          source.close()
          open(lastId ? `${url}?after=${encodeURIComponent(lastId)}` : url)
        }, SILENCE_MS)
      }
      const open = (from: string) => {
        source = new EventSource(from)
        arm()
        source.onmessage = (message) => {
          failures = 0
          if (message.lastEventId) lastId = message.lastEventId
          arm()
          const event = JSON.parse(message.data as string) as AuditEvent
          if (event.type === 'audit.completed' || event.type === 'audit.failed') stop()
          onEvent(event)
        }
        source.onerror = () => {
          if (finished) return
          failures += 1
          if (source.readyState === EventSource.CLOSED || failures >= MAX_RETRIES) {
            stop()
            onEvent({ type: 'audit.failed', error: 'Lost the connection to the audit stream.' })
          }
        }
      }

      open(url)
      return () => {
        finished = true
        clearTimeout(watchdog)
        source.close()
      }
    },

    skipAhead(auditId) {
      void fetch(`${baseUrl}/api/audits/${encodeURIComponent(auditId)}/fast-forward`, { method: 'POST' })
    },

    canSkipAhead(auditId) {
      return !liveAudits().includes(auditId)
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
