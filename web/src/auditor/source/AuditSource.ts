import type { AuditEvent } from '../../shared/contract'

export interface AuditSource {
  readonly mode: 'mock' | 'live'
  /** Starts an audit of the URL and returns its id. */
  start(targetUrl: string): Promise<string>
  /** Streams the audit's events from the beginning. Returns an unsubscribe function. */
  subscribe(auditId: string, onEvent: (event: AuditEvent) => void): () => void
  /** Mock only: deliver the remaining events at once. */
  skipAhead?(auditId: string): void
}

export class UnsupportedTargetError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'UnsupportedTargetError'
  }
}
