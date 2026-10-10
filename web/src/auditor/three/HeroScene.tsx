import { ContactShadows, Float, Outlines, RoundedBox } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useMemo, useRef, useState } from 'react'
import type { Dispatch, RefObject, SetStateAction } from 'react'
import * as THREE from 'three'
import { TRICK_TAGS } from './tags'
import type { TrickTag } from './tags'

const INK = '#111111'
const CATCH_RADIUS = 0.9
const HOLD_SECONDS = 3.5

function Bag() {
  const ref = useRef<THREE.Group>(null)
  useFrame((state) => {
    if (!ref.current) return
    const t = state.clock.elapsedTime
    ref.current.rotation.y = Math.sin(t * 0.45) * 0.35 + state.pointer.x * 0.25
    ref.current.rotation.x = -state.pointer.y * 0.08
  })
  return (
    <group ref={ref}>
      <RoundedBox args={[2, 2.3, 1]} radius={0.14} smoothness={4}>
        <meshToonMaterial color="#ff5ca8" />
        <Outlines thickness={4} color={INK} />
      </RoundedBox>
      {[0.3, -0.3].map((z) => (
        <mesh key={z} position={[0, 1.13, z]}>
          <torusGeometry args={[0.5, 0.075, 12, 40, Math.PI]} />
          <meshToonMaterial color={INK} />
        </mesh>
      ))}
      <group position={[0, -0.05, 0.51]}>
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.56, 0.56, 0.05, 48]} />
          <meshToonMaterial color="#c6f432" />
          <Outlines thickness={3} color={INK} />
        </mesh>
        <mesh position={[-0.165, -0.085, 0.04]} rotation={[0, 0, Math.PI / 4]}>
          <boxGeometry args={[0.11, 0.26, 0.04]} />
          <meshBasicMaterial color={INK} />
        </mesh>
        <mesh position={[0.085, 0.025, 0.04]} rotation={[0, 0, -0.7]}>
          <boxGeometry args={[0.11, 0.55, 0.04]} />
          <meshBasicMaterial color={INK} />
        </mesh>
      </group>
    </group>
  )
}

function Lens({ lensRef }: { lensRef: RefObject<THREE.Group | null> }) {
  return (
    <group ref={lensRef} position={[1.6, 0.6, 1.4]}>
      <mesh>
        <torusGeometry args={[0.62, 0.11, 16, 48]} />
        <meshToonMaterial color={INK} />
      </mesh>
      <mesh>
        <circleGeometry args={[0.6, 48]} />
        <meshBasicMaterial color="#dff3ff" transparent opacity={0.35} depthWrite={false} />
      </mesh>
      <mesh position={[-0.05, 0.05, 0.02]} rotation={[0, 0, 1.9]}>
        <torusGeometry args={[0.4, 0.035, 8, 24, Math.PI * 0.45]} />
        <meshBasicMaterial color="#ffffff" />
      </mesh>
      <mesh position={[0.78, -0.78, 0]} rotation={[0, 0, Math.PI / 4]}>
        <cylinderGeometry args={[0.13, 0.15, 0.95, 20]} />
        <meshToonMaterial color="#3b5bff" />
        <Outlines thickness={3} color={INK} />
      </mesh>
    </group>
  )
}

/** Invisible anchor that floats in 3D; its DOM sticker is positioned from its projection. */
function TagAnchor({ tag, groupRef }: { tag: TrickTag; groupRef: (g: THREE.Group | null) => void }) {
  return (
    <Float speed={2} rotationIntensity={0} floatIntensity={1.1}>
      <group ref={groupRef} position={tag.position} />
    </Float>
  )
}

type CaughtMap = Record<string, boolean>

function Scene({ tagEls, setCaught }: { tagEls: RefObject<(HTMLDivElement | null)[]>; setCaught: Dispatch<SetStateAction<CaughtMap>> }) {
  const lens = useRef<THREE.Group>(null)
  const tagRefs = useRef<(THREE.Group | null)[]>([])
  const caughtAt = useRef<Record<string, number>>({})
  const lastPointer = useRef({ x: 0, y: 0, t: -10 })
  const viewportWidth = useThree((s) => s.viewport.width)
  const scale = Math.min(1, viewportWidth / 7)
  const lensPos = useMemo(() => new THREE.Vector3(), [])
  const tagPos = useMemo(() => new THREE.Vector3(), [])

  useFrame((state, delta) => {
    const g = lens.current
    if (!g) return
    const t = state.clock.elapsedTime
    const p = state.pointer
    if (p.x !== lastPointer.current.x || p.y !== lastPointer.current.y) lastPointer.current = { x: p.x, y: p.y, t }

    // Follow the pointer; drift around the bag when nobody is steering.
    const idle = t - lastPointer.current.t > 2.5
    const halfW = state.viewport.width / 2
    const halfH = state.viewport.height / 2
    const tx = idle ? Math.sin(t * 0.7) * 2.3 * scale : p.x * halfW * 0.95
    const ty = idle ? (Math.sin(t * 1.1 + 1) * 1.45 + 0.35) * scale : p.y * halfH * 0.95
    g.position.x = THREE.MathUtils.damp(g.position.x, tx / scale, 5, delta)
    g.position.y = THREE.MathUtils.damp(g.position.y, ty / scale, 5, delta)
    g.rotation.z = THREE.MathUtils.damp(g.rotation.z, -p.x * 0.3, 4, delta)

    g.getWorldPosition(lensPos)
    tagRefs.current.forEach((ref, i) => {
      if (!ref) return
      const id = TRICK_TAGS[i].id
      ref.getWorldPosition(tagPos)

      const el = tagEls.current[i]
      if (el) {
        const screen = tagPos.clone().project(state.camera)
        const x = (screen.x * 0.5 + 0.5) * state.size.width
        const y = (-screen.y * 0.5 + 0.5) * state.size.height
        el.style.transform = `translate(${x}px, ${y}px)`
        el.style.opacity = '1'
      }

      const near = Math.hypot(tagPos.x - lensPos.x, tagPos.y - lensPos.y) < CATCH_RADIUS * scale
      const since = caughtAt.current[id]
      if (since === undefined && near) {
        caughtAt.current[id] = t
        setCaught((c) => ({ ...c, [id]: true }))
      } else if (since !== undefined && !near && t - since > HOLD_SECONDS) {
        delete caughtAt.current[id]
        setCaught((c) => ({ ...c, [id]: false }))
      }
    })
  })

  return (
    <group scale={scale}>
      <Float speed={1.4} rotationIntensity={0.15} floatIntensity={0.6}>
        <Bag />
      </Float>
      <Lens lensRef={lens} />
      {TRICK_TAGS.map((tag, i) => (
        <TagAnchor key={tag.id} tag={tag} groupRef={(g) => (tagRefs.current[i] = g)} />
      ))}
      <ContactShadows position={[0, -1.75, 0]} opacity={0.35} scale={8} blur={2.4} far={4} color={INK} />
    </group>
  )
}

export default function HeroScene() {
  const tagEls = useRef<(HTMLDivElement | null)[]>([])
  const [caught, setCaught] = useState<CaughtMap>({})
  return (
    <div className="relative h-full w-full">
      <Canvas camera={{ position: [0, 0.2, 7.5], fov: 40 }} dpr={[1, 2]} gl={{ antialias: true, alpha: true }} style={{ touchAction: 'pan-y' }}>
        <ambientLight intensity={1.3} />
        <directionalLight position={[3, 5, 4]} intensity={2.2} />
        <Scene tagEls={tagEls} setCaught={setCaught} />
      </Canvas>
      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        {TRICK_TAGS.map((tag, i) => {
          const isCaught = !!caught[tag.id]
          return (
            <div
              key={tag.id}
              ref={(el) => {
                tagEls.current[i] = el
              }}
              className="absolute top-0 left-0 opacity-0 will-change-transform"
            >
              <div
                className={`sticker -translate-x-1/2 -translate-y-1/2 text-sm transition-[background-color,rotate,scale] duration-200 sm:text-base ${isCaught ? 'bg-pink' : 'bg-white'}`}
                style={{ rotate: `${isCaught ? tag.tilt * -1.5 : tag.tilt}deg`, scale: isCaught ? '1.08' : '1' }}
              >
                {isCaught ? (
                  <>
                    <s className="opacity-60">{tag.label}</s> CAUGHT 🚩
                  </>
                ) : (
                  tag.label
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
