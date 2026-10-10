export interface TrickTag {
  id: string
  label: string
  /** Scene-space position around the bag. */
  position: [number, number, number]
  tilt: number
}

/** Tricks the demo store really plays, floating around the hero bag. */
export const TRICK_TAGS: TrickTag[] = [
  { id: 'timer', label: '⏱ 09:59', position: [-2.35, 1.3, 0.3], tilt: -6 },
  { id: 'stock', label: 'only 2 left!', position: [2.2, 1.6, 0], tilt: 5 },
  { id: 'fees', label: '+₹97 fees', position: [2.4, -0.7, 0.4], tilt: -4 },
  { id: 'mrp', label: '62% off*', position: [-2.45, -0.6, 0.2], tilt: 7 },
  { id: 'tick', label: '☑ pre-ticked', position: [0.1, 2.45, -0.3], tilt: -3 },
]
