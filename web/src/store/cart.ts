import { useCallback, useEffect, useState } from 'react'
import { EXPRESS_DELIVERY_PRICE, PLUS_MEMBERSHIP, PROTECTION_PLAN } from './catalog'
import type { Colour, Product, StoreId } from './catalog'
import type { StoreSetup } from './variants'

export interface CartLine {
  id: string
  kind: 'product' | 'addon'
  name: string
  unitPrice: number
  mrp: number
  qty: number
  slug?: string
  colour?: Colour
}

export type Delivery = 'standard' | 'express'

export interface ShopState {
  lines: CartLine[]
  /** null until the shopper touches the checkbox; the store decides the default. */
  plus: boolean | null
  delivery: Delivery
}

const EMPTY: ShopState = { lines: [], plus: null, delivery: 'standard' }

function storageKey(storeId: StoreId) {
  return `bazaarnest-shop-${storeId}`
}

function load(storeId: StoreId): ShopState {
  try {
    const raw = localStorage.getItem(storageKey(storeId))
    return raw ? { ...EMPTY, ...(JSON.parse(raw) as ShopState) } : EMPTY
  } catch {
    return EMPTY
  }
}

function protectionLine(): CartLine {
  return {
    id: PROTECTION_PLAN.id,
    kind: 'addon',
    name: PROTECTION_PLAN.name,
    unitPrice: PROTECTION_PLAN.price,
    mrp: PROTECTION_PLAN.price,
    qty: 1,
  }
}

export function useShopState(setup: StoreSetup) {
  const [state, setState] = useState<ShopState>(() => load(setup.id))

  useEffect(() => {
    try {
      localStorage.setItem(storageKey(setup.id), JSON.stringify(state))
    } catch {
      // Storage unavailable (private mode): the cart just won't survive a reload.
    }
  }, [setup.id, state])

  const addProduct = useCallback(
    (product: Product, colour: Colour) => {
      setState((s) => {
        const id = `${product.slug}-${colour.id}`
        const { price, mrp } = product.pricing[setup.id]
        const existing = s.lines.find((l) => l.id === id)
        let lines = existing
          ? s.lines.map((l) => (l.id === id ? { ...l, qty: l.qty + 1 } : l))
          : [...s.lines, { id, kind: 'product' as const, name: product.name, unitPrice: price, mrp, qty: 1, slug: product.slug, colour }]
        if (setup.behaviour.autoAddProtection && !lines.some((l) => l.id === PROTECTION_PLAN.id)) {
          lines = [...lines, protectionLine()]
        }
        return { ...s, lines }
      })
    },
    [setup],
  )

  const removeLine = useCallback((id: string) => {
    setState((s) => ({ ...s, lines: s.lines.filter((l) => l.id !== id) }))
  }, [])

  const setProtection = useCallback((on: boolean) => {
    setState((s) => {
      const without = s.lines.filter((l) => l.id !== PROTECTION_PLAN.id)
      return { ...s, lines: on ? [...without, protectionLine()] : without }
    })
  }, [])

  const setPlus = useCallback((plus: boolean) => setState((s) => ({ ...s, plus })), [])
  const setDelivery = useCallback((delivery: Delivery) => setState((s) => ({ ...s, delivery })), [])
  const clear = useCallback(() => setState(EMPTY), [])

  const plusOn = state.plus ?? setup.behaviour.membershipTickedByDefault

  return { state, plusOn, addProduct, removeLine, setProtection, setPlus, setDelivery, clear }
}

export type Stage = 'cart' | 'checkout' | 'payment'

export interface TotalLine {
  label: string
  amount: number
  note?: string
  /** Fees are charges for nothing the shopper chose; services are delivery and membership. */
  kind: 'service' | 'fee'
}

export interface Totals {
  itemCount: number
  mrpTotal: number
  itemsTotal: number
  /** Everything after the items: delivery, membership, fees. */
  extras: TotalLine[]
  total: number
}

export function computeTotals(setup: StoreSetup, state: ShopState, plusOn: boolean, stage: Stage): Totals {
  const itemCount = state.lines.reduce((n, l) => n + l.qty, 0)
  const mrpTotal = state.lines.reduce((n, l) => n + l.mrp * l.qty, 0)
  const itemsTotal = state.lines.reduce((n, l) => n + l.unitPrice * l.qty, 0)

  const extras: TotalLine[] = []
  if (stage !== 'cart') {
    extras.push(
      state.delivery === 'express'
        ? { label: 'Express delivery', amount: EXPRESS_DELIVERY_PRICE, kind: 'service' }
        : { label: 'Standard delivery', amount: 0, note: 'FREE', kind: 'service' },
    )
    if (plusOn) extras.push({ label: `${PLUS_MEMBERSHIP.name} (first month)`, amount: PLUS_MEMBERSHIP.monthly, kind: 'service' })
  } else {
    extras.push({ label: 'Delivery charges', amount: 0, note: 'FREE', kind: 'service' })
  }
  if (setup.upfrontPlatformFee > 0) extras.push({ label: 'Platform fee', amount: setup.upfrontPlatformFee, kind: 'fee' })
  if (stage === 'payment' && setup.behaviour.feesAtPaymentOnly) {
    for (const fee of setup.paymentStepFees) extras.push({ label: fee.label, amount: fee.amount, kind: 'fee' })
  }

  const total = itemsTotal + extras.reduce((n, e) => n + e.amount, 0)
  return { itemCount, mrpTotal, itemsTotal, extras, total }
}
