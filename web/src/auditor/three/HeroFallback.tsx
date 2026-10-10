import { TRICK_TAGS } from './tags'

const FALLBACK_POS: Record<string, [number, number]> = {
  timer: [22, 118],
  stock: [352, 64],
  fees: [372, 336],
  mrp: [16, 300],
  tick: [196, 22],
}

/** Flat version of the 3D hero for reduced motion, no WebGL, or while three.js loads. */
export function HeroFallback() {
  return (
    <svg viewBox="0 0 520 440" className="h-full w-full" role="img" aria-label="A shopping bag under a magnifying glass, surrounded by dark-pattern tags">
      <ellipse cx="262" cy="392" rx="120" ry="14" fill="#111" opacity="0.12" />
      <path d="M215 152v-30a45 45 0 0 1 90 0v30" fill="none" stroke="#111" strokeWidth="9" strokeLinecap="round" />
      <rect x="168" y="150" width="188" height="226" rx="18" fill="#ff5ca8" stroke="#111" strokeWidth="5" />
      <rect x="168" y="150" width="188" height="40" rx="18" fill="#fff" opacity="0.18" />
      <circle cx="262" cy="268" r="50" fill="#c6f432" stroke="#111" strokeWidth="5" />
      <path d="m240 268 15 15 30-32" fill="none" stroke="#111" strokeWidth="10" strokeLinecap="round" strokeLinejoin="round" />
      <path d="m392 252 52 52" stroke="#111" strokeWidth="30" strokeLinecap="round" />
      <path d="m392 252 52 52" stroke="#3b5bff" strokeWidth="20" strokeLinecap="round" />
      <circle cx="350" cy="208" r="62" fill="#dff3ff" fillOpacity="0.55" stroke="#111" strokeWidth="13" />
      <path d="M318 186a40 40 0 0 1 26-22" fill="none" stroke="#fff" strokeWidth="7" strokeLinecap="round" />
      {TRICK_TAGS.map((t) => {
        const [x, y] = FALLBACK_POS[t.id]
        const caught = t.id === 'stock'
        const label = caught ? 'CAUGHT 🚩' : t.label
        const w = label.length * 10.5 + 28
        return (
          <g key={t.id} transform={`translate(${x} ${y}) rotate(${t.tilt})`}>
            <rect x="3" y="3" width={w} height="38" rx="19" fill="#111" />
            <rect width={w} height="38" rx="19" fill={caught ? '#ff5ca8' : '#fff'} stroke="#111" strokeWidth="3" />
            <text x={w / 2} y="25" textAnchor="middle" fontSize="16" fontWeight="800" fill="#111" fontFamily="Inter Variable, system-ui, sans-serif">
              {label}
            </text>
          </g>
        )
      })}
    </svg>
  )
}
