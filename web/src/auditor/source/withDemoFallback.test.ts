import { describe, expect, it, vi } from 'vitest'
import type { AuditEvent } from '../../shared/contract'
import { ApiUnreachableError } from './AuditSource'
import type { AuditSource } from './AuditSource'
import { isDemoAudit, withDemoFallback } from './withDemoFallback'

// Tests run in Node: the sample-store matcher compares against the page's origin.
const ORIGIN = 'https://shop-honest-ai.web.app'
vi.stubGlobal('window', { location: { origin: ORIGIN } })
const SAMPLE = `${ORIGIN}/demo/store-a/p/sonicbuds-pro`

function fake(id: string, startError?: Error): AuditSource & { subscribed: string[] } {
  const subscribed: string[] = []
  return {
    mode: 'mock',
    subscribed,
    start: vi.fn(async () => {
      if (startError) throw startError
      return id
    }),
    subscribe(auditId: string, onEvent: (e: AuditEvent) => void) {
      subscribed.push(auditId)
      onEvent({ type: 'audit.failed', error: 'test' })
      return () => {}
    },
    skipAhead: vi.fn(),
  }
}

describe('withDemoFallback', () => {
  it('uses the live API when it answers', async () => {
    const source = withDemoFallback(fake('aud_1'), fake('mock-store-a-1'))
    expect(await source.start(SAMPLE)).toBe('aud_1')
  })

  it('replays the demo when the API is unreachable and the target is a sample store', async () => {
    const demo = fake('mock-store-a-1')
    const source = withDemoFallback(fake('aud_1', new ApiUnreachableError()), demo)
    const id = await source.start(SAMPLE)
    expect(id).toBe('mock-store-a-1')
    source.subscribe(id, () => {})
    expect(demo.subscribed).toEqual(['mock-store-a-1'])
    expect(isDemoAudit(id)).toBe(true)
  })

  it('never falls back for Run live, other sites, or refusals from the API', async () => {
    const unreachable = withDemoFallback(fake('aud_1', new ApiUnreachableError()), fake('mock-store-a-1'))
    await expect(unreachable.start(SAMPLE, { live: true })).rejects.toBeInstanceOf(ApiUnreachableError)
    await expect(unreachable.start('https://example.com/p/1')).rejects.toBeInstanceOf(ApiUnreachableError)
    const refusing = withDemoFallback(fake('aud_1', new Error('You’ve started 3 live audits this hour.')), fake('mock-store-a-1'))
    await expect(refusing.start(SAMPLE)).rejects.toThrow('3 live audits')
  })
})
