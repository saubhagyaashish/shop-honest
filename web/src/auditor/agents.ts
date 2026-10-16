import { Camera, Compass, FileText, History, Scale, ScanEye, ShieldCheck, Wrench } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { AgentName } from '../shared/contract'
import type { Tone } from './ui/styles'

export interface AgentInfo {
  label: string
  /** Formal one-liner. */
  job: string
  /** Squad-card one-liner. */
  vibe: string
  tone: Tone
  icon: LucideIcon
}

export const AGENTS: Record<AgentName, AgentInfo> = {
  navigator: {
    label: 'Navigator',
    job: 'Walks the journey like a shopper and captures every screen.',
    vibe: 'Clicks everything so you don’t have to.',
    tone: 'blue',
    icon: Compass,
  },
  pattern_analyst: {
    label: 'Pattern Analyst',
    job: 'Judges each screen against the 13 banned patterns, by intent, not keywords.',
    vibe: 'Reads the room. And the fine print.',
    tone: 'pink',
    icon: ScanEye,
  },
  price_historian: {
    label: 'Price Historian',
    job: 'Checks whether the struck-through MRP was ever the real price.',
    vibe: 'Remembers every price. Holds grudges.',
    tone: 'sun',
    icon: History,
  },
  evidence: {
    label: 'Evidence',
    job: 'Pairs each finding with screenshots, the element and the rule.',
    vibe: 'Screenshots or it didn’t happen.',
    tone: 'mint',
    icon: Camera,
  },
  seller_trust: {
    label: 'Seller Trust',
    job: 'Domain age, reused imagery and review anomalies.',
    vibe: 'Checks who you’re really buying from.',
    tone: 'peach',
    icon: ShieldCheck,
  },
  adjudicator: {
    label: 'Adjudicator',
    job: 'Scores confidence and sends borderline cases to a human.',
    vibe: 'Not sure? Asks a human. No cap.',
    tone: 'lilac',
    icon: Scale,
  },
  fixer: {
    label: 'Fixer',
    job: 'Writes a fix for each finding, applies it to a copy of the store and re-audits it.',
    vibe: 'Found it? Fixed it. Proved it.',
    tone: 'lime',
    icon: Wrench,
  },
  reporter: {
    label: 'Reporter',
    job: 'Builds the audit with severity, rule citation and evidence.',
    vibe: 'Turns receipts into a report.',
    tone: 'white',
    icon: FileText,
  },
}

/** The pipeline shown on the home page, in order. Seller Trust is a later phase. */
export const PIPELINE: AgentName[] = ['navigator', 'pattern_analyst', 'price_historian', 'evidence', 'adjudicator', 'fixer', 'reporter']
