/** Mini storefront doodle for the sample cards. */
export function StoreIllustration({ rigged, locked = false }: { rigged: boolean; locked?: boolean }) {
  return (
    <svg viewBox="0 0 320 170" className="w-full" aria-hidden="true">
      <rect x="6" y="6" width="306" height="158" rx="14" fill="#111" />
      <rect x="2" y="2" width="306" height="158" rx="14" fill="#fff" stroke="#111" strokeWidth="3" />
      <path d="M2 30h306" stroke="#111" strokeWidth="3" />
      <circle cx="18" cy="16" r="4.5" fill="#ff5ca8" stroke="#111" strokeWidth="2" />
      <circle cx="32" cy="16" r="4.5" fill="#ffd23f" stroke="#111" strokeWidth="2" />
      <circle cx="46" cy="16" r="4.5" fill="#c6f432" stroke="#111" strokeWidth="2" />
      <rect x="64" y="10" width="170" height="12" rx="6" fill="#f3f0e8" stroke="#111" strokeWidth="2" />
      <rect x="18" y="44" width="104" height="104" rx="10" fill="#f3f0e8" stroke="#111" strokeWidth="2.5" />
      <rect x="46" y="88" width="48" height="40" rx="12" fill={rigged ? '#ff5ca8' : '#4ade9a'} stroke="#111" strokeWidth="2.5" />
      <path d="M58 88v-8a12 12 0 0 1 24 0v8" fill="none" stroke="#111" strokeWidth="3" />
      <rect x="138" y="46" width="140" height="10" rx="5" fill="#111" />
      <rect x="138" y="62" width="96" height="8" rx="4" fill="#d6d1c4" />
      <text x="138" y="96" fontSize="22" fontWeight="800" fill="#111" fontFamily="Inter Variable, system-ui">₹1,499</text>
      {rigged ? (
        <>
          <text x="222" y="95" fontSize="12" fill="#888" fontFamily="Inter Variable, system-ui" textDecoration="line-through">₹3,999</text>
          <g transform="rotate(-4 200 118)">
            <rect x="138" y="106" width="96" height="22" rx="11" fill="#ff5ca8" stroke="#111" strokeWidth="2.5" />
            <text x="186" y="121" textAnchor="middle" fontSize="12" fontWeight="800" fill="#111" fontFamily="Inter Variable, system-ui">⏱ 09:59</text>
          </g>
          <text x="140" y="146" fontSize="12" fontWeight="800" fill="#e11d48" fontFamily="Inter Variable, system-ui">only 2 left!!</text>
        </>
      ) : (
        <>
          <text x="222" y="95" fontSize="12" fill="#888" fontFamily="Inter Variable, system-ui" textDecoration="line-through">₹1,999</text>
          <rect x="138" y="106" width="120" height="22" rx="11" fill="#c6f432" stroke="#111" strokeWidth="2.5" />
          <text x="198" y="121" textAnchor="middle" fontSize="12" fontWeight="800" fill="#111" fontFamily="Inter Variable, system-ui">ends Sun 11:59 PM</text>
          <text x="140" y="146" fontSize="12" fontWeight="700" fill="#15803d" fontFamily="Inter Variable, system-ui">in stock ✓</text>
        </>
      )}
      {locked && (
        <g transform="translate(232 112)">
          <rect x="4" y="4" width="70" height="48" rx="10" fill="#111" />
          <rect width="70" height="48" rx="10" fill="#ffd23f" stroke="#111" strokeWidth="2.5" />
          <path d="M26 22v-6a9 9 0 0 1 18 0v6" fill="none" stroke="#111" strokeWidth="3" />
          <rect x="22" y="22" width="26" height="18" rx="4" fill="#fff" stroke="#111" strokeWidth="2.5" />
        </g>
      )}
    </svg>
  )
}
