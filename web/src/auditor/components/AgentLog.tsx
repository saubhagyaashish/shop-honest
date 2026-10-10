import { motion } from 'motion/react'
import { useEffect, useRef } from 'react'
import { AGENTS } from '../agents'
import { AgentAvatar } from '../ui/AgentAvatar'
import type { LogEntry } from '../useAudit'

/** The agents' working log, styled as a group chat. */
export function AgentLog({ logs, startedAt, follow = true, typing = false }: { logs: LogEntry[]; startedAt?: number; follow?: boolean; typing?: boolean }) {
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!follow || !box.current) return
    box.current.scrollTo({ top: box.current.scrollHeight, behavior: 'smooth' })
  }, [logs.length, follow])

  const t0 = startedAt ?? logs[0]?.at ?? 0
  return (
    <div ref={box} className="h-full overflow-y-auto pr-1">
      <ol className="space-y-3 py-1">
        {logs.map((l) => (
          <motion.li
            key={l.id}
            className="flex gap-2.5"
            initial={follow ? { opacity: 0, y: 10, scale: 0.97 } : false}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ type: 'spring', stiffness: 380, damping: 28 }}
          >
            <AgentAvatar agent={l.agent} size="sm" />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-2 text-[11px]">
                <b className="font-bold">{AGENTS[l.agent].label}</b>
                <span className="font-mono text-ink/40 tabular-nums">{formatOffset(l.at - t0)}</span>
              </div>
              <div className="brutal-sm mt-1 inline-block rounded-2xl rounded-tl-md bg-white px-3 py-2 text-[13px] leading-snug">{l.message}</div>
            </div>
          </motion.li>
        ))}
        {typing && (
          <li className="flex items-center gap-2.5 pl-1 text-[12px] font-semibold text-ink/50">
            <span className="brutal-sm inline-flex gap-1 rounded-full bg-white px-3 py-2">
              {[0, 1, 2].map((i) => (
                <motion.span
                  key={i}
                  className="h-1.5 w-1.5 rounded-full bg-ink"
                  animate={{ y: [0, -4, 0] }}
                  transition={{ duration: 0.8, repeat: Infinity, delay: i * 0.15 }}
                />
              ))}
            </span>
            squad is typing…
          </li>
        )}
      </ol>
    </div>
  )
}

function formatOffset(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
