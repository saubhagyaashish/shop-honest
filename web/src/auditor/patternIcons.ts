import {
  BellRing,
  Bug,
  CircleHelp,
  CreditCard,
  Frown,
  Lock,
  Megaphone,
  MousePointerClick,
  Receipt,
  Repeat,
  ShoppingBasket,
  Shuffle,
  Tag,
  Timer,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { PatternId } from '../shared/contract'

export const PATTERN_ICON: Record<PatternId, LucideIcon> = {
  false_urgency: Timer,
  basket_sneaking: ShoppingBasket,
  confirm_shaming: Frown,
  forced_action: Lock,
  subscription_trap: Repeat,
  interface_interference: MousePointerClick,
  bait_and_switch: Shuffle,
  drip_pricing: Receipt,
  disguised_advertisement: Megaphone,
  nagging: BellRing,
  trick_question: CircleHelp,
  saas_billing: CreditCard,
  rogue_malware: Bug,
  misleading_price: Tag,
}
