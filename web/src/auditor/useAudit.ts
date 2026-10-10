import { useEffect, useReducer } from 'react'
import type { AgentName, AuditEvent, AuditReport, Finding, JourneyStep, Money, StepCapture } from '../shared/contract'
import { auditSource } from './source'

export interface LogEntry {
  id: number
  at: number
  agent: AgentName
  message: string
}

export interface PricePoint {
  step: JourneyStep
  label: string
  total: Money
}

export interface AuditState {
  status: 'connecting' | 'running' | 'completed' | 'failed'
  targetUrl?: string
  startedAt?: string
  currentStep?: JourneyStep
  stepsVisited: JourneyStep[]
  /** What the agent's browser is showing right now. */
  browser?: { url: string; screenshotUrl?: string }
  captures: StepCapture[]
  findings: Finding[]
  logs: LogEntry[]
  /** Running totals the agent read along the journey. */
  priceTrail: PricePoint[]
  /** Where the agent was stopped, e.g. by a sign-in wall. */
  blocked?: { step: JourneyStep; reason: string }
  report?: AuditReport
  error?: string
  /** Bumps on every new finding so views can flash it. */
  latestFindingId?: string
}

const INITIAL: AuditState = { status: 'connecting', stepsVisited: [], captures: [], findings: [], logs: [], priceTrail: [] }

type Action = { type: 'reset' } | { type: 'event'; event: AuditEvent }

function reduce(state: AuditState, action: Action): AuditState {
  if (action.type === 'reset') return INITIAL
  const e = action.event
  switch (e.type) {
    case 'audit.started':
      return { ...state, status: 'running', targetUrl: e.targetUrl, startedAt: e.startedAt, browser: { url: e.targetUrl } }
    case 'step.started':
      return {
        ...state,
        currentStep: e.step,
        stepsVisited: state.stepsVisited.includes(e.step) ? state.stepsVisited : [...state.stepsVisited, e.step],
        browser: { url: e.url, screenshotUrl: state.browser?.screenshotUrl },
      }
    case 'step.captured':
      return {
        ...state,
        browser: { url: e.url, screenshotUrl: e.screenshotUrl },
        captures: [...state.captures, { step: e.step, url: e.url, screenshotUrl: e.screenshotUrl }],
      }
    case 'agent.log':
      return {
        ...state,
        logs: [...state.logs, { id: state.logs.length, at: Date.now(), agent: e.agent, message: e.message }],
      }
    case 'step.blocked':
      return {
        ...state,
        blocked: { step: e.step, reason: e.reason },
        browser: { url: e.url, screenshotUrl: e.screenshotUrl ?? state.browser?.screenshotUrl },
      }
    case 'price.observed':
      return { ...state, priceTrail: [...state.priceTrail, { step: e.step, label: e.label, total: e.total }] }
    case 'finding':
      return { ...state, findings: [...state.findings, e.finding], latestFindingId: e.finding.id }
    case 'audit.completed':
      return { ...state, status: 'completed', report: e.report, findings: e.report.findings, currentStep: undefined }
    case 'audit.failed':
      return { ...state, status: 'failed', error: e.error }
  }
}

export function useAudit(auditId: string | undefined, runKey = 0) {
  const [state, dispatch] = useReducer(reduce, INITIAL)

  useEffect(() => {
    if (!auditId) return
    dispatch({ type: 'reset' })
    return auditSource.subscribe(auditId, (event) => dispatch({ type: 'event', event }))
  }, [auditId, runKey])

  const canSkip = auditId && auditSource.skipAhead && (auditSource.canSkipAhead?.(auditId) ?? true)
  const skipAhead = canSkip ? () => auditSource.skipAhead!(auditId) : undefined
  return { state, skipAhead }
}
