import { AU, EU, GB, IN, KR, SG, US } from 'country-flag-icons/react/3x2'
import type { JurisdictionCode } from '../../shared/contract'

const FLAGS = { IN, SG, GB, EU, US, KR, AU }

/** Real flag artwork (SVG), framed in the brand outline. */
export function Flag({ code, title, className = 'h-5 w-[30px]' }: { code: JurisdictionCode; title?: string; className?: string }) {
  const Svg = FLAGS[code]
  return (
    <span className={`inline-block shrink-0 overflow-hidden rounded-[4px] border-2 border-ink bg-white ${className}`}>
      <Svg title={title ?? code} className="block h-full w-full" />
    </span>
  )
}
