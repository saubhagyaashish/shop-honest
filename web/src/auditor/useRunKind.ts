import { useEffect, useState } from 'react'
import { auditSource } from './source'
import { isDemoAudit } from './source/withDemoFallback'

export type RunKind = 'live run' | 'recorded run' | 'demo replay'

/** Is this audit a fresh live run, a replay of a recorded real run, or the built-in demo? (ADR-0004: say so plainly.) */
export function useRunKind(auditId: string | undefined): RunKind | null {
  const demo = auditId !== undefined && (auditSource.mode !== 'live' || isDemoAudit(auditId))
  const [fetched, setFetched] = useState<{ id: string; kind: RunKind } | null>(null)

  useEffect(() => {
    if (!auditId || demo) return
    let cancelled = false
    fetch(`/api/audits/${encodeURIComponent(auditId)}`)
      .then((res) => (res.ok ? (res.json() as Promise<{ mode?: string }>) : null))
      .then((body) => {
        if (!cancelled && body?.mode) setFetched({ id: auditId, kind: body.mode === 'live' ? 'live run' : 'recorded run' })
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [auditId, demo])

  if (!auditId) return null
  if (demo) return 'demo replay'
  return fetched?.id === auditId ? fetched.kind : null
}
