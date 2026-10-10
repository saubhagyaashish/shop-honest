// Walks both demo stores in a real browser and saves a screenshot per journey
// frame, plus the bounding box and text of every element the audit cites.
// Output feeds the mock audit (public/mock/screens + src/auditor/mock/captures.json).
// This is also the first prototype of the Navigator agent's walk.
//
//   npm run capture

import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import type { Page } from 'playwright'
import { createServer } from 'vite'
import { ANSWER_KEY, FRAME_STEPS, PROBE_SELECTORS } from '../src/store/answerKey'
import type { FrameId } from '../src/store/answerKey'
import type { StoreId } from '../src/store/catalog'
import { STORES, storePath } from '../src/store/variants'
import type { CapturedFrame, Captures } from '../src/auditor/mock/captures'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const PORT = 5199
const VIEWPORT = { width: 1280, height: 800 }
const PRODUCT = '/p/sonicbuds-pro'
const SECONDS_ON_PAGE = 8

async function measure(page: Page, selectors: string[], fullPage: boolean) {
  return page.evaluate(
    ({ selectors, fullPage }) => {
      const pageW = fullPage ? document.documentElement.scrollWidth : window.innerWidth
      const pageH = fullPage ? document.documentElement.scrollHeight : window.innerHeight
      const elements: Record<string, { bbox: { x: number; y: number; w: number; h: number }; text: string }> = {}
      for (const sel of selectors) {
        const el = document.querySelector<HTMLElement>(sel)
        if (!el) continue
        const r = el.getBoundingClientRect()
        const pad = 6
        const x = Math.max(0, r.left + window.scrollX - pad)
        const y = Math.max(0, r.top + window.scrollY - pad)
        elements[sel] = {
          bbox: {
            x: x / pageW,
            y: y / pageH,
            w: Math.min(r.width + pad * 2, pageW - x) / pageW,
            h: Math.min(r.height + pad * 2, pageH - y) / pageH,
          },
          text: el.innerText.replace(/\s+/g, ' ').trim(),
        }
      }
      return { width: pageW, height: pageH, elements }
    },
    { selectors, fullPage },
  )
}

async function walkStore(storeId: StoreId, base: string, outDir: string): Promise<Captures['stores'][StoreId]> {
  const setup = STORES[storeId]
  const frames: Partial<Record<FrameId, CapturedFrame>> = {}
  const probes: Record<string, string> = {}
  const cited = ANSWER_KEY[storeId].flatMap((f) => f.evidence.map((e) => e.selector))
  const selectors = [...new Set([...PROBE_SELECTORS, ...cited, '#offer-modal', '#offer-modal-decline', '#line-protect-1y'])]

  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: VIEWPORT })

  async function shoot(id: FrameId, fullPage = true) {
    await page.waitForTimeout(250)
    const file = `${id}.jpg`
    await page.screenshot({ path: join(outDir, file), fullPage, type: 'jpeg', quality: 82 })
    const m = await measure(page, selectors, fullPage)
    const url = new URL(page.url())
    frames[id] = {
      id,
      step: FRAME_STEPS[id],
      src: `/mock/screens/${storeId}/${file}`,
      url: url.pathname + url.search,
      width: m.width,
      height: m.height,
      elements: m.elements,
    }
    console.log(`  ${storeId}/${id}  ${m.width}×${m.height}  ${Object.keys(m.elements).length} elements`)
  }

  async function dismissOfferIfShown() {
    if (!setup.behaviour.guiltDeclinePopup) return
    await page.waitForSelector('#offer-modal')
    await page.click('#offer-modal-decline')
    await page.waitForSelector('#offer-modal', { state: 'detached' })
  }

  await page.goto(base + storePath(setup, PRODUCT))
  if (setup.behaviour.guiltDeclinePopup) {
    await page.waitForSelector('#offer-modal')
    await shoot('product-popup', false)
    await dismissOfferIfShown()
  } else {
    await page.waitForTimeout(1500)
  }

  // Linger like a shopper reading the page, then take a second look after a
  // reload: does the urgency survive?
  await page.waitForTimeout(SECONDS_ON_PAGE * 1000)
  await shoot('product')
  const clock = setup.behaviour.resettingTimer ? '#deal-timer' : '#sale-deadline'
  probes.clockBeforeReload = (await page.textContent(clock))?.trim() ?? ''
  probes.secondsOnPage = String(SECONDS_ON_PAGE)
  await page.reload()
  await dismissOfferIfShown()
  await shoot('product-reload')

  await page.click('[data-colour="ocean"]')
  await page.waitForSelector('[data-colour="ocean"][aria-checked="true"]')
  await shoot('variant')

  await page.click('#add-to-cart')
  await page.waitForSelector('#to-checkout')
  await shoot('cart')

  await page.click('#to-checkout')
  await page.waitForSelector('#delivery-choice')
  await shoot('checkout')

  await page.click(setup.behaviour.lopsidedDeliveryChoice ? '#standard-delivery-link' : '#continue-to-payment')
  await page.waitForSelector('#pay-now')
  await shoot('payment')

  await browser.close()

  for (const f of ANSWER_KEY[storeId]) {
    for (const e of f.evidence) {
      if (!frames[e.frame]?.elements[e.selector]) throw new Error(`${f.id}: ${e.selector} not found on frame ${e.frame}`)
    }
  }
  return { frames, probes }
}

async function main() {
  const server = await createServer({ root: ROOT, server: { port: PORT, strictPort: true }, logLevel: 'error' })
  await server.listen()
  const base = `http://localhost:${PORT}`
  try {
    const captures: Captures = { viewport: VIEWPORT, capturedAt: new Date().toISOString(), stores: {} as Captures['stores'] }
    for (const storeId of Object.keys(STORES) as StoreId[]) {
      const outDir = join(ROOT, 'public/mock/screens', storeId)
      await mkdir(outDir, { recursive: true })
      console.log(`Walking store ${storeId}…`)
      captures.stores[storeId] = await walkStore(storeId, base, outDir)
    }
    await writeFile(join(ROOT, 'src/auditor/mock/captures.json'), JSON.stringify(captures, null, 2) + '\n')
    console.log('Wrote src/auditor/mock/captures.json')
  } finally {
    await server.close()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
