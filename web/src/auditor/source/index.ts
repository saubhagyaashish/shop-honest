import { createMockSource } from './mockSource'
import { createSseSource } from './sseSource'

export const auditSource = import.meta.env.VITE_AUDIT_SOURCE === 'live' ? createSseSource() : createMockSource()
