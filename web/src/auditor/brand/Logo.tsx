/** Shop Honest mark: a shopping bag with a magnifying lens and a check. */
export function LogoMark({ className = 'h-9 w-9' }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
      <rect x="2" y="2" width="44" height="44" rx="12" fill="#c6f432" stroke="#111" strokeWidth="3" />
      <path d="M18.5 18v-3a5.5 5.5 0 0 1 11 0v3" fill="none" stroke="#111" strokeWidth="2.8" strokeLinecap="round" />
      <path d="M12.5 18h23l-1.6 19.2a2 2 0 0 1-2 1.8H16.1a2 2 0 0 1-2-1.8L12.5 18Z" fill="#fff" stroke="#111" strokeWidth="2.8" strokeLinejoin="round" />
      <circle cx="22.5" cy="28" r="5.6" fill="#ff5ca8" stroke="#111" strokeWidth="2.6" />
      <path d="m26.6 32.1 4.4 4.4" stroke="#111" strokeWidth="3.2" strokeLinecap="round" />
      <path d="m20 28 1.8 1.8 3.2-3.4" fill="none" stroke="#111" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function Logo({ size = 'md' }: { size?: 'md' | 'lg' }) {
  const big = size === 'lg'
  return (
    <span className="inline-flex items-center gap-2.5">
      <LogoMark className={big ? 'h-12 w-12' : 'h-9 w-9'} />
      <span className={`font-display font-extrabold tracking-tight ${big ? 'text-3xl' : 'text-[22px]'}`}>
        shop<span className="ml-1 inline-block -rotate-2 rounded-md border-2 border-ink bg-lime px-1.5 leading-tight">honest</span>
      </span>
    </span>
  )
}
