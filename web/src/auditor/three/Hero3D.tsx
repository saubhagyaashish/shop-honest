import { useReducedMotion } from 'motion/react'
import { Component, lazy, Suspense, useState } from 'react'
import type { ReactNode } from 'react'
import { HeroFallback } from './HeroFallback'

const HeroScene = lazy(() => import('./HeroScene'))

function hasWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas')
    return !!(canvas.getContext('webgl2') || canvas.getContext('webgl'))
  } catch {
    return false
  }
}

class SceneBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  render() {
    return this.state.failed ? <HeroFallback /> : this.props.children
  }
}

/** Interactive 3D hero where it can run well; a flat SVG everywhere else. */
export function Hero3D() {
  const reduced = useReducedMotion()
  const [webgl] = useState(hasWebGL)
  if (reduced || !webgl) return <HeroFallback />
  return (
    <SceneBoundary>
      <Suspense fallback={<HeroFallback />}>
        <HeroScene />
      </Suspense>
    </SceneBoundary>
  )
}
