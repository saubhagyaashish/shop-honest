import { useEffect, useState } from 'react'

export interface NavItem {
  id: string
  label: string
  count?: number
}

/** Sticky jump links; the section in view is highlighted. */
export function ReportNav({ items, className = '' }: { items: NavItem[]; className?: string }) {
  const [active, setActive] = useState(items[0]?.id)

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
        if (visible[0]) setActive(visible[0].target.id)
      },
      { rootMargin: '-140px 0px -55% 0px' },
    )
    for (const item of items) {
      const el = document.getElementById(item.id)
      if (el) observer.observe(el)
    }
    return () => observer.disconnect()
  }, [items])

  return (
    <nav aria-label="Report sections" className={`sticky top-16 z-20 -mx-1 py-3 print:hidden ${className}`}>
      <div className="brutal-sm flex gap-1 overflow-x-auto rounded-2xl bg-white/95 p-1.5 backdrop-blur">
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => document.getElementById(item.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
            className={`flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-1.5 text-sm font-bold whitespace-nowrap transition-colors ${
              active === item.id ? 'bg-ink text-cream' : 'text-ink/70 hover:bg-cream hover:text-ink'
            }`}
          >
            {item.label}
            {item.count !== undefined && (
              <span className={`rounded-md px-1.5 text-[11px] ${active === item.id ? 'bg-cream text-ink' : 'bg-ink/10'}`}>{item.count}</span>
            )}
          </button>
        ))}
      </div>
    </nav>
  )
}
