import { createMockSource } from './mockSource'
import { createSseSource } from './sseSource'
import { withDemoFallback } from './withDemoFallback'

export const auditSource =
  import.meta.env.VITE_AUDIT_SOURCE === 'live'
    ? withDemoFallback(createSseSource('', import.meta.env.VITE_STREAM_BASE ?? ''), createMockSource())
    : createMockSource()
