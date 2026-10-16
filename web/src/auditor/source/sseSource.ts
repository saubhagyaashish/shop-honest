import type { AuditEvent, FixProposal } from '../../shared/contract'
import { ApiUnreachableError } from './AuditSource'
import type { AuditSource } from './AuditSource'

/** Consecutive stream errors, with no event in between, before we give up. */
const MAX_RETRIES = 3
/** Silence after which the stream is reopened from the last event (the server pings every 15 s, but JS can't see pings). */
const SILENCE_MS = 60_000
/** Watchdog reopens per audit before giving up. */
const MAX_REOPENS = 10
const LOST = 'Lost the connection to the audit stream.'
/** The failure an audit page shows for a link to an audit that doesn't exist. */
export const AUDIT_NOT_FOUND = 'We couldn’t find this audit. The link may be mistyped, or the audit no longer exists.'
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
 *   POST /api/audits/:id/fixes              → the Fixer's proposal for a finished audit
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
          body: JSON.stringify({
            targetUrl,
            mode: options?.live || options?.compareTo ? 'live' : 'auto',
            ...(options?.compareTo ? { compareTo: options.compareTo } : {}),
            ...(options?.applyFixes ? { applyFixes: options.applyFixes } : {}),
          }),
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
      let unsubscribed = false
      let received = false
      let failures = 0
      let lastId = ''
      let watchdog: ReturnType<typeof setTimeout> | undefined
      let reopened = 0

      const stop = () => {
        finished = true
        clearTimeout(watchdog)
        source.close()
      }
      // A stream that fails before its first event may be for an audit that doesn't exist: ask the API which.
      const lost = async () => {
        let error = LOST
        if (!received) {
          try {
            const res = await fetch(`${baseUrl}/api/audits/${encodeURIComponent(auditId)}`)
            if (res.status === 404) error = AUDIT_NOT_FOUND
          } catch {
            // unreachable: report the lost stream
          }
        }
        if (!unsubscribed) onEvent({ type: 'audit.failed', error })
      }
      const arm = () => {
        clearTimeout(watchdog)
        watchdog = setTimeout(() => {
          if (finished) return
          if (reopened >= MAX_REOPENS) {
            stop()
            onEvent({ type: 'audit.failed', error: LOST })
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
          received = true
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
            void lost()
          }
        }
      }

      open(url)
      return () => {
        unsubscribed = true
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

    async proposeFixes(auditId) {
      let res: Response
      try {
        res = await fetch(`${baseUrl}/api/audits/${encodeURIComponent(auditId)}/fixes`, { method: 'POST' })
      } catch {
        throw new ApiUnreachableError()
      }
      if (!res.ok) {
        if (!res.headers.get('content-type')?.includes('application/json')) throw new ApiUnreachableError()
        throw new Error(await errorMessage(res, 'Could not write the fixes'))
      }
      return (await res.json()) as FixProposal
    },
  }
}

async function errorMessage(res: Response, failed = 'Could not start the audit'): Promise<string> {
  try {
    const body = (await res.json()) as { error?: { message?: string } }
    if (body.error?.message) return body.error.message
  } catch {
    // not JSON; fall through
  }
  return `${failed} (${res.status}).`
}
