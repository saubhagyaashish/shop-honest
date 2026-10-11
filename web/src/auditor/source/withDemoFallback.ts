import { sampleForUrl } from '../samples'
import { ApiUnreachableError } from './AuditSource'
import type { AuditSource } from './AuditSource'

/** Demo audits have ids like mock-store-a-…; the API's look like aud_…. */
export function isDemoAudit(auditId: string): boolean {
  return auditId.startsWith('mock-')
}

/**
 * The live API, with the built-in demo replay as a safety net: if the API can't be
 * reached at all, "Scan it" on a sample store replays the demo instead of failing.
 * Refusals from the API (rate limits, unsupported sites) still surface as errors,
 * and "Run live" never falls back: showing a recording there would mislead.
 */
export function withDemoFallback(live: AuditSource, demo: AuditSource): AuditSource {
  const pick = (auditId: string) => (isDemoAudit(auditId) ? demo : live)
  return {
    mode: 'live',
    async start(targetUrl, options) {
      try {
        return await live.start(targetUrl, options)
      } catch (err) {
        if (err instanceof ApiUnreachableError && !options?.live && sampleForUrl(targetUrl)) return demo.start(targetUrl)
        throw err
      }
    },
    subscribe: (auditId, onEvent) => pick(auditId).subscribe(auditId, onEvent),
    skipAhead: (auditId) => pick(auditId).skipAhead?.(auditId),
    canSkipAhead: (auditId) => pick(auditId).canSkipAhead?.(auditId) ?? Boolean(pick(auditId).skipAhead),
  }
}
