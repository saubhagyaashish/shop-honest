// The wait between "Scan it" and the audit page. Starting an audit is one request: on a warm server it answers in
// a few hundred milliseconds, after a quiet spell it first boots a server (about 10 s). The loader can't see what the
// server is doing, so it never claims a step is done: it loops through what starting involves until the server
// answers, and only then ticks everything off.

export const LAUNCH = {
  /** Scene 1 (a server booting) gives way to scene 2 (the agents assembling). */
  assembleAfterMs: 2200,
  /** Past this, say plainly that the server is waking up. */
  slowAfterMs: 7000,
  /** One boot line types in at a time, cycling. */
  lineEveryMs: 1100,
  /** Never shorter than this on screen, so a fast answer doesn't flash it. */
  minShownMs: 1100,
  /** The "ready" beat after the server answers, before the audit opens. */
  readyBeatMs: 700,
} as const

/** What starting an audit involves, in order. Shown cycling while waiting, all ticked once the server answers. */
export const BOOT_LINES = [
  'waking the server',
  'checking the address is a public site',
  'reserving a fresh browser · no cookies, not signed in',
  'briefing the agents',
] as const

export type WaitingPhase = 'booting' | 'assembling' | 'slow'

export function waitingPhase(elapsedMs: number): WaitingPhase {
  if (elapsedMs >= LAUNCH.slowAfterMs) return 'slow'
  if (elapsedMs >= LAUNCH.assembleAfterMs) return 'assembling'
  return 'booting'
}

/** The boot line typing in now (its index in BOOT_LINES). */
export function bootLine(elapsedMs: number): number {
  return Math.floor(Math.max(0, elapsedMs) / LAUNCH.lineEveryMs) % BOOT_LINES.length
}

/** How long to wait, once the server answered `answeredAtMs` after the click, before opening the audit. */
export function holdBeforeOpen(answeredAtMs: number): number {
  return Math.max(LAUNCH.readyBeatMs, LAUNCH.minShownMs - answeredAtMs)
}
