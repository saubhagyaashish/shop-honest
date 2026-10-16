import type { AuditEvent, FixProposal } from '../../shared/contract'

/** A fix from a proposal to apply to a copy of the store before auditing it ("Verify these fixes"). */
export interface FixToApply {
  findingId: string
  setting: string
  /** The new value, as the proposal shows it ("off", "₹1,599"). */
  value: string
  why: string
}

export interface StartOptions {
  /** A fresh run instead of a recording. */
  live?: boolean
  /** Re-audit the page live and compare the result with this earlier audit of it. */
  compareTo?: string
  /** With compareTo: apply these fixes from that audit's proposal to a copy of the store, then audit the copy. */
  applyFixes?: FixToApply[]
}

export interface AuditSource {
  readonly mode: 'mock' | 'live'
  /** Starts an audit of the URL and returns its id. */
  start(targetUrl: string, options?: StartOptions): Promise<string>
  /** Streams the audit's events from the beginning. Returns an unsubscribe function. */
  subscribe(auditId: string, onEvent: (event: AuditEvent) => void): () => void
  /** Deliver the remaining events at once (mock and replayed audits). */
  skipAhead?(auditId: string): void
  /** False when the audit is a live run, which can't be skipped ahead. Absent means it always can. */
  canSkipAhead?(auditId: string): boolean
  /** The Fixer's proposal for a finished audit ("Fix it"). Absent without a backend. */
  proposeFixes?(auditId: string): Promise<FixProposal>
}

/** The API couldn't be reached at all (network down, or no backend behind the site), as opposed to refusing. */
export class ApiUnreachableError extends Error {
  constructor(message = 'The audit service can’t be reached right now.') {
    super(message)
    this.name = 'ApiUnreachableError'
  }
}

export class UnsupportedTargetError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'UnsupportedTargetError'
  }
}
