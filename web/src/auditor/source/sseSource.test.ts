import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AuditEvent } from '../../shared/contract'
import { AUDIT_NOT_FOUND, createSseSource } from './sseSource'

/** A stand-in EventSource the test drives by hand. */
class FakeEventSource {
  static CLOSED = 2
  static opened: FakeEventSource[] = []
  readyState = 1
  onmessage: ((m: { data: string; lastEventId: string }) => void) | null = null
  onerror: (() => void) | null = null
  url: string
  constructor(url: string) {
    this.url = url
    FakeEventSource.opened.push(this)
  }
  close() {
    this.readyState = FakeEventSource.CLOSED
  }
  send(id: number, event: AuditEvent) {
    this.onmessage?.({ data: JSON.stringify(event), lastEventId: String(id) })
  }
}

describe('sseSource stream watchdog', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    FakeEventSource.opened = []
    vi.stubGlobal('EventSource', FakeEventSource)
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('reopens a silent stream from the last event it received', () => {
    const events: AuditEvent[] = []
    createSseSource('', 'https://api.example').subscribe('aud_1', (e) => events.push(e))
    const first = FakeEventSource.opened[0]
    expect(first.url).toBe('https://api.example/api/audits/aud_1/events')
    first.send(7, { type: 'agent.log', agent: 'navigator', message: 'hi' })

    vi.advanceTimersByTime(59_000)
    expect(FakeEventSource.opened).toHaveLength(1)
    vi.advanceTimersByTime(2_000)
    expect(first.readyState).toBe(FakeEventSource.CLOSED)
    expect(FakeEventSource.opened.at(-1)?.url).toBe('https://api.example/api/audits/aud_1/events?after=7')

    FakeEventSource.opened.at(-1)?.send(8, { type: 'audit.failed', error: 'done' })
    vi.advanceTimersByTime(120_000)
    expect(FakeEventSource.opened).toHaveLength(2)
    expect(events.map((e) => e.type)).toEqual(['agent.log', 'audit.failed'])
  })

  it('gives up after repeated silence instead of waiting forever', () => {
    const events: AuditEvent[] = []
    createSseSource().subscribe('aud_2', (e) => events.push(e))
    vi.advanceTimersByTime(60_000 * 12)
    expect(events.at(-1)).toEqual({ type: 'audit.failed', error: 'Lost the connection to the audit stream.' })
    const opened = FakeEventSource.opened.length
    vi.advanceTimersByTime(60_000 * 5)
    expect(FakeEventSource.opened.length).toBe(opened)
  })

  it('says an audit doesn’t exist when its stream fails before any event and the API answers 404', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{"error":"not found"}', { status: 404 }))
    vi.stubGlobal('fetch', fetchMock)
    const events: AuditEvent[] = []
    createSseSource('https://api.example').subscribe('aud_missing', (e) => events.push(e))
    const stream = FakeEventSource.opened[0]
    stream.readyState = FakeEventSource.CLOSED
    stream.onerror?.()
    await vi.waitFor(() => expect(events).toHaveLength(1))
    expect(fetchMock).toHaveBeenCalledWith('https://api.example/api/audits/aud_missing')
    expect(events[0]).toEqual({ type: 'audit.failed', error: AUDIT_NOT_FOUND })
  })

  it('reports a lost stream, without asking the API, once events have arrived', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const events: AuditEvent[] = []
    createSseSource('https://api.example').subscribe('aud_3', (e) => events.push(e))
    const stream = FakeEventSource.opened[0]
    stream.send(1, { type: 'agent.log', agent: 'navigator', message: 'hi' })
    stream.readyState = FakeEventSource.CLOSED
    stream.onerror?.()
    await vi.waitFor(() => expect(events).toHaveLength(2))
    expect(fetchMock).not.toHaveBeenCalled()
    expect(events[1]).toEqual({ type: 'audit.failed', error: 'Lost the connection to the audit stream.' })
  })
})
