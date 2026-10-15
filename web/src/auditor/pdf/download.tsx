import { pdf } from '@react-pdf/renderer'
import type { AuditReport, BBox, EvidenceFrame } from '../../shared/contract'
import { AuditPdf } from './AuditPdf'
import type { AuditPdfProps } from './AuditPdf'
import { SelfAuditPdf } from './SelfAuditPdf'

/** Builds the audit PDF in the browser and saves it. Loaded on demand, so react-pdf stays out of the main bundle. */
export async function downloadAuditPdf(props: Omit<AuditPdfProps, 'origin'>): Promise<void> {
  patchBuffer()
  const report = await withCroppedEvidence(props.report)
  const blob = await pdf(<AuditPdf {...props} report={report} origin={window.location.origin} />).toBlob()
  save(blob, fileName('shop-honest-audit', report.targetUrl, report.completedAt))
}

/** The CCPA self-audit PDF: the 13 patterns and the findings, text only. */
export async function downloadSelfAuditPdf(report: AuditReport): Promise<void> {
  patchBuffer()
  const blob = await pdf(<SelfAuditPdf report={report} />).toBlob()
  save(blob, fileName('ccpa-self-audit', report.targetUrl, report.completedAt))
}

function patchBuffer() {
  // react-pdf's browser build calls the Node-only Buffer.isBuffer() after loading each image.
  const g = globalThis as { Buffer?: { isBuffer: (x: unknown) => boolean } }
  g.Buffer ??= { isBuffer: () => false }
}

function save(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

/** Replaces each evidence screenshot with a 2:1 crop zoomed on the cited element, so it reads at print size. */
async function withCroppedEvidence(report: AuditReport): Promise<AuditReport> {
  const findings = await Promise.all(
    report.findings.map(async (f) => ({
      ...f,
      evidence: { ...f.evidence, frames: await Promise.all(f.evidence.frames.map(cropFrame)) },
    })),
  )
  return { ...report, findings }
}

async function cropFrame(frame: EvidenceFrame): Promise<EvidenceFrame> {
  if (!frame.bbox) return frame
  try {
    const img = await loadImage(new URL(frame.screenshotUrl, window.location.origin).href)
    const { region, bbox } = cropRegion(frame.bbox, img.naturalWidth, img.naturalHeight)
    const scale = Math.min(1, 1100 / region.w)
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(region.w * scale)
    canvas.height = Math.round(region.h * scale)
    canvas.getContext('2d')!.drawImage(img, region.x, region.y, region.w, region.h, 0, 0, canvas.width, canvas.height)
    return { ...frame, screenshotUrl: canvas.toDataURL('image/jpeg', 0.88), bbox }
  } catch {
    return frame
  }
}

/** Pixel region around the bbox (2:1, clamped to the image) and the bbox relative to that region. */
export function cropRegion(b: BBox, imgW: number, imgH: number) {
  const bx = b.x * imgW
  const by = b.y * imgH
  const bw = b.w * imgW
  const bh = b.h * imgH
  let w = Math.min(imgW, Math.max(imgW * 0.42, bw * 1.6, bh * 1.35 * 2))
  let h = Math.min(imgH, Math.max(w / 2, bh * 1.35))
  w = Math.min(imgW, Math.max(w, h * 2))
  const x = Math.min(imgW - w, Math.max(0, bx + bw / 2 - w / 2))
  const y = Math.min(imgH - h, Math.max(0, by + bh / 2 - h / 2))
  return {
    region: { x, y, w, h },
    bbox: { x: (bx - x) / w, y: (by - y) / h, w: bw / w, h: bh / h },
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error(`Could not load ${src}`))
    img.src = src
  })
}

function fileName(prefix: string, targetUrl: string, completedAt: string): string {
  let slug = 'site'
  try {
    const u = new URL(targetUrl)
    slug = `${u.hostname}${u.pathname}`
  } catch {
    // keep default
  }
  slug = slug.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase().slice(0, 60)
  return `${prefix}_${slug}_${completedAt.slice(0, 10)}.pdf`
}
