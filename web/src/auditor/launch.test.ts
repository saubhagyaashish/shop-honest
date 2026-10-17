import { describe, expect, it } from 'vitest'
import { BOOT_LINES, bootLine, holdBeforeOpen, LAUNCH, waitingPhase } from './launch'

describe('waitingPhase', () => {
  it('boots a server first, then assembles the agents, then says the server is waking up', () => {
    expect(waitingPhase(0)).toBe('booting')
    expect(waitingPhase(LAUNCH.assembleAfterMs - 1)).toBe('booting')
    expect(waitingPhase(LAUNCH.assembleAfterMs)).toBe('assembling')
    expect(waitingPhase(LAUNCH.slowAfterMs - 1)).toBe('assembling')
    expect(waitingPhase(LAUNCH.slowAfterMs)).toBe('slow')
    expect(waitingPhase(60_000)).toBe('slow')
  })
})

describe('bootLine', () => {
  it('types one line at a time and cycles while the server hasn’t answered', () => {
    expect(bootLine(0)).toBe(0)
    expect(bootLine(LAUNCH.lineEveryMs)).toBe(1)
    expect(bootLine(LAUNCH.lineEveryMs * BOOT_LINES.length)).toBe(0)
    expect(bootLine(-50)).toBe(0)
  })
})

describe('holdBeforeOpen', () => {
  it('lets a warm answer show the loader long enough not to flash', () => {
    expect(holdBeforeOpen(100)).toBe(LAUNCH.minShownMs - 100)
  })

  it('always plays the ready beat, however long the wait was', () => {
    expect(holdBeforeOpen(LAUNCH.minShownMs)).toBe(LAUNCH.readyBeatMs)
    expect(holdBeforeOpen(11_000)).toBe(LAUNCH.readyBeatMs)
  })
})
