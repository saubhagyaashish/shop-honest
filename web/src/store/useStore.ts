import { createContext, useContext } from 'react'
import type { useShopState } from './cart'
import type { StoreSetup } from './variants'

export type StoreContextValue = { setup: StoreSetup } & ReturnType<typeof useShopState>

export const StoreContext = createContext<StoreContextValue | null>(null)

export function useStore(): StoreContextValue {
  const value = useContext(StoreContext)
  if (!value) throw new Error('useStore must be used inside <StoreProvider>')
  return value
}
