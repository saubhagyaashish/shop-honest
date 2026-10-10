import type { AgentName } from '../../shared/contract'
import { AGENTS } from '../agents'
import { TONE_BG } from './styles'

const SIZES = { sm: ['h-7 w-7 rounded-lg', 15], md: ['h-10 w-10 rounded-xl', 20], lg: ['h-16 w-16 rounded-2xl', 30] } as const

export function AgentAvatar({ agent, size = 'md' }: { agent: AgentName; size?: keyof typeof SIZES }) {
  const { icon: Icon, tone, label } = AGENTS[agent]
  const [box, iconSize] = SIZES[size]
  return (
    <span className={`brutal-sm inline-grid shrink-0 place-items-center ${box} ${TONE_BG[tone]}`} title={label}>
      <Icon size={iconSize} strokeWidth={2.4} aria-hidden="true" />
    </span>
  )
}
