export type Tone = 'lime' | 'pink' | 'sun' | 'blue' | 'mint' | 'lilac' | 'peach' | 'white' | 'ink' | 'cream'

export const TONE_BG: Record<Tone, string> = {
  lime: 'bg-lime text-ink',
  pink: 'bg-pink text-ink',
  sun: 'bg-sun text-ink',
  blue: 'bg-blue text-white',
  mint: 'bg-mint text-ink',
  lilac: 'bg-lilac text-ink',
  peach: 'bg-peach text-ink',
  white: 'bg-white text-ink',
  ink: 'bg-ink text-cream',
  cream: 'bg-cream text-ink',
}

const SIZE = {
  sm: 'h-9 px-3.5 text-sm rounded-xl',
  md: 'h-11 px-5 text-[15px] rounded-xl',
  lg: 'h-14 px-7 text-base rounded-2xl',
}

export function buttonClass(tone: Tone = 'lime', size: keyof typeof SIZE = 'md', extra = ''): string {
  return `brutal-btn inline-flex items-center justify-center gap-2 font-bold whitespace-nowrap ${TONE_BG[tone]} ${SIZE[size]} ${extra}`
}
