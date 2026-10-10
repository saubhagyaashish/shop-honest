import type { AuditEvent } from '../../shared/contract'

export interface AuditSource {
  readonly mode: 'mock' | 'live'
  /** Starts an audit of the URL and returns its id. `live` forces a fresh run instead of a recording. */
  start(targetUrl: string, options?: { live?: boolean }): Promise<string>
  /** Streams the audit's events from the beginning. Returns an unsubscribe function. */
  subscribe(auditId: string, onEvent: (event: AuditEvent) => void): () => void
  /** Deliver the remaining events at once (mock and replayed audits). */
  skipAhead?(auditId: string): void
  /** False when the audit is a live run, which can't be skipped ahead. Absent means it always can. */
  canSkipAhead?(auditId: string): boolean
}

export class UnsupportedTargetError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'UnsupportedTargetError'
  }
}
