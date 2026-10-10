import type { CurrencyCode, Money } from '../shared/contract'

const SYMBOL: Record<CurrencyCode, string> = { INR: '₹', SGD: 'S$', GBP: '£', EUR: '€', USD: '$', KRW: '₩', AUD: 'A$' }

/** ₹1,894 style, with Indian digit grouping for rupees. */
export function formatMoney({ amount, currency }: Money): string {
  const locale = currency === 'INR' ? 'en-IN' : 'en-US'
  return `${SYMBOL[currency]}${amount.toLocaleString(locale, { maximumFractionDigits: 0 })}`
}

/** Large rupee sums in lakh / crore, others in K / M / B. */
export function formatMoneyCompact({ amount, currency }: Money): string {
  const sym = SYMBOL[currency]
  if (currency === 'INR') {
    if (amount >= 1e7) return `${sym}${trim(amount / 1e7)} crore`
    if (amount >= 1e5) return `${sym}${trim(amount / 1e5)} lakh`
    return formatMoney({ amount, currency })
  }
  if (amount >= 1e9) return `${sym}${trim(amount / 1e9)}B`
  if (amount >= 1e6) return `${sym}${trim(amount / 1e6)}M`
  if (amount >= 1e4) return `${sym}${trim(amount / 1e3)}K`
  return formatMoney({ amount, currency })
}

function trim(n: number): string {
  return n >= 100 ? n.toFixed(0) : n.toFixed(n >= 10 ? 1 : 2).replace(/\.?0+$/, '')
}

export function percentUp(from: number, to: number): number {
  return from > 0 ? Math.round((to / from - 1) * 100) : 0
}
