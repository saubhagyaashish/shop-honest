import type { ReactNode } from 'react'
import { useShopState } from './cart'
import { StoreContext } from './useStore'
import type { StoreSetup } from './variants'

export function StoreProvider({ setup, children }: { setup: StoreSetup; children: ReactNode }) {
  const shop = useShopState(setup)
  return <StoreContext.Provider value={{ setup, ...shop }}>{children}</StoreContext.Provider>
}
