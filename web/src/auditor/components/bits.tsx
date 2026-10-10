import type { AgentName, FindingStatus, Severity } from '../../shared/contract'
import { AGENTS } from '../agents'
import { TONE_BG } from '../ui/styles'

const SEVERITY_TONE: Record<Severity, string> = {
  high: 'bg-pink text-ink',
  medium: 'bg-sun text-ink',
  low: 'bg-white text-ink',
}

export function SeverityBadge({ severity }: { severity: Severity }) {
  return <span className={`sticker !px-2 !py-0 text-[11px] tracking-wide uppercase ${SEVERITY_TONE[severity]}`}>{severity}</span>
}

export function StatusBadge({ status }: { status: FindingStatus }) {
  return status === 'confirmed' ? (
    <span className="inline-flex items-center gap-1 text-xs font-bold">🚩 Confirmed</span>
  ) : (
    <span className="inline-flex items-center gap-1 text-xs font-bold">🤔 Needs a human</span>
  )
}

export function AgentTag({ agent }: { agent: AgentName }) {
  return (
    <span className={`inline-flex shrink-0 items-center rounded-md border-2 border-ink px-1.5 text-[11px] leading-[18px] font-bold ${TONE_BG[AGENTS[agent].tone]}`}>
      {AGENTS[agent].label}
    </span>
  )
}

export function ConfidenceMeter({ value, threshold }: { value: number; threshold?: number }) {
  const pct = Math.round(value * 100)
  const tone = value >= (threshold ?? 0.75) ? 'bg-ink' : 'bg-sun'
  return (
    <div className="flex items-center gap-2" title={`Confidence ${pct}%`}>
      <div className="relative h-2.5 w-20 overflow-hidden rounded-full border-2 border-ink bg-white">
        <div className={`h-full ${tone}`} style={{ width: `${pct}%` }} />
        {threshold !== undefined && <div className="absolute top-0 h-full w-0.5 bg-pink" style={{ left: `${threshold * 100}%` }} />}
      </div>
      <span className="font-mono text-xs font-medium tabular-nums">{value.toFixed(2)}</span>
    </div>
  )
}
