import { ClipboardList, CreditCard, Package, Palette, ShoppingCart } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { JourneyStep } from '../shared/contract'

export const STEP_LABEL: Record<JourneyStep, string> = {
  product: 'Product page',
  variant: 'Variant selection',
  cart: 'Cart',
  checkout: 'Checkout',
  payment: 'Payment',
}

export const STEP_ICON: Record<JourneyStep, LucideIcon> = {
  product: Package,
  variant: Palette,
  cart: ShoppingCart,
  checkout: ClipboardList,
  payment: CreditCard,
}
