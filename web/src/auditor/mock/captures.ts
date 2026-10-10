import type { BBox, JourneyStep } from '../../shared/contract'
import type { FrameId } from '../../store/answerKey'
import type { StoreId } from '../../store/catalog'

/** Shape of captures.json, written by scripts/capture-screens.ts. */
export interface CapturedElement {
  bbox: BBox
  text: string
}

export interface CapturedFrame {
  id: FrameId
  step: JourneyStep
  src: string
  url: string
  width: number
  height: number
  elements: Record<string, CapturedElement>
}

export interface StoreCapture {
  frames: Partial<Record<FrameId, CapturedFrame>>
  /** Readings taken between frames, e.g. the timer just before a reload. */
  probes: Record<string, string>
}

export interface Captures {
  viewport: { width: number; height: number }
  capturedAt: string
  stores: Record<StoreId, StoreCapture>
}
