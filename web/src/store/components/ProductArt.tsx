import type { ProductKind } from '../catalog'

/** Simple vector product shots, tinted with the selected colour. */
export function ProductArt({ kind, hex, className = '' }: { kind: ProductKind; hex: string; className?: string }) {
  return (
    <svg viewBox="0 0 200 200" className={className} role="img" aria-hidden="true">
      <defs>
        <radialGradient id={`bg-${kind}`} cx="50%" cy="40%" r="70%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="100%" stopColor="#eef2f1" />
        </radialGradient>
        <linearGradient id={`shine-${kind}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.45" />
          <stop offset="60%" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <rect width="200" height="200" fill={`url(#bg-${kind})`} />
      <ellipse cx="100" cy="168" rx="58" ry="7" fill="#000" opacity="0.08" />
      {kind === 'earbuds' && <Earbuds hex={hex} shine={`url(#shine-${kind})`} />}
      {kind === 'watch' && <Watch hex={hex} shine={`url(#shine-${kind})`} />}
      {kind === 'powerbank' && <PowerBank hex={hex} shine={`url(#shine-${kind})`} />}
      {kind === 'neckband' && <Neckband hex={hex} shine={`url(#shine-${kind})`} />}
    </svg>
  )
}

function Earbuds({ hex, shine }: { hex: string; shine: string }) {
  return (
    <g>
      <rect x="52" y="92" width="96" height="70" rx="30" fill={hex} />
      <rect x="52" y="92" width="96" height="70" rx="30" fill={shine} />
      <line x1="56" y1="112" x2="144" y2="112" stroke="#000" strokeOpacity="0.18" strokeWidth="2" />
      <circle cx="100" cy="140" r="3" fill="#22c55e" />
      <g transform="rotate(-18 72 70)">
        <ellipse cx="72" cy="62" rx="17" ry="15" fill={hex} />
        <rect x="66" y="66" width="11" height="36" rx="5.5" fill={hex} />
        <ellipse cx="72" cy="62" rx="17" ry="15" fill={shine} />
        <circle cx="64" cy="58" r="5" fill="#000" opacity="0.25" />
      </g>
      <g transform="rotate(18 128 70)">
        <ellipse cx="128" cy="62" rx="17" ry="15" fill={hex} />
        <rect x="123" y="66" width="11" height="36" rx="5.5" fill={hex} />
        <ellipse cx="128" cy="62" rx="17" ry="15" fill={shine} />
        <circle cx="136" cy="58" r="5" fill="#000" opacity="0.25" />
      </g>
    </g>
  )
}

function Watch({ hex, shine }: { hex: string; shine: string }) {
  return (
    <g>
      <rect x="78" y="22" width="44" height="50" rx="10" fill={hex} />
      <rect x="78" y="128" width="44" height="44" rx="10" fill={hex} />
      <rect x="62" y="56" width="76" height="88" rx="20" fill="#1f2937" />
      <rect x="68" y="62" width="64" height="76" rx="15" fill="#0b1220" />
      <text x="100" y="98" textAnchor="middle" fontSize="20" fontWeight="700" fill="#e5e7eb" fontFamily="system-ui">10:09</text>
      <text x="100" y="116" textAnchor="middle" fontSize="9" fill="#34d399" fontFamily="system-ui">♥ 72 bpm</text>
      <rect x="138" y="88" width="5" height="16" rx="2" fill="#4b5563" />
      <rect x="62" y="56" width="76" height="88" rx="20" fill={shine} />
    </g>
  )
}

function PowerBank({ hex, shine }: { hex: string; shine: string }) {
  return (
    <g>
      <rect x="56" y="40" width="88" height="124" rx="16" fill={hex} />
      <rect x="56" y="40" width="88" height="124" rx="16" fill={shine} />
      <rect x="88" y="34" width="24" height="8" rx="3" fill="#374151" />
      {[0, 1, 2, 3].map((i) => (
        <circle key={i} cx={82 + i * 12} cy="140" r="3.2" fill={i < 3 ? '#22c55e' : '#d1d5db'} />
      ))}
      <text x="100" y="98" textAnchor="middle" fontSize="13" fontWeight="700" fill="#fff" fillOpacity="0.85" fontFamily="system-ui">10000</text>
      <text x="100" y="112" textAnchor="middle" fontSize="8" fill="#fff" fillOpacity="0.7" fontFamily="system-ui">mAh · 22.5W</text>
    </g>
  )
}

function Neckband({ hex, shine }: { hex: string; shine: string }) {
  return (
    <g>
      <path d="M48 70 C 48 150, 152 150, 152 70" fill="none" stroke={hex} strokeWidth="11" strokeLinecap="round" />
      <rect x="38" y="64" width="22" height="46" rx="10" fill={hex} />
      <rect x="140" y="64" width="22" height="46" rx="10" fill={hex} />
      <rect x="38" y="64" width="22" height="46" rx="10" fill={shine} />
      <path d="M49 110 C 52 128, 66 138, 74 140" fill="none" stroke="#374151" strokeWidth="2" />
      <path d="M151 110 C 148 128, 134 138, 126 140" fill="none" stroke="#374151" strokeWidth="2" />
      <circle cx="76" cy="142" r="9" fill={hex} />
      <circle cx="124" cy="142" r="9" fill={hex} />
    </g>
  )
}
