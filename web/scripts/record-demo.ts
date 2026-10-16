/**
 * Record a ≤3 minute silent demo of the live site for the AI Builder Cup.
 *
 *   npm run demo:record
 *
 * Writes docs/demo/raw/*.webm then (if ffmpeg is available) a compressed
 * docs/demo/shop-honest-demo.mp4. Captions are burned in via a DOM overlay.
 */

import { spawnSync } from 'node:child_process'
import { mkdir, readdir, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium, type Page } from 'playwright'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const RAW_DIR = join(ROOT, 'docs', 'demo', 'raw')
const OUT_MP4 = join(ROOT, 'docs', 'demo', 'shop-honest-demo.mp4')
const BASE = process.env.DEMO_URL ?? 'https://shop-honest-ai.web.app'
const VIEWPORT = { width: 1280, height: 720 }
/** Soft cap: stop the walk before this many ms of wall time. */
const MAX_MS = 165_000

const FFMPEG_CANDIDATES = [
  process.env.FFMPEG,
  'ffmpeg',
  'C:\\Program Files\\KMPlayer 64X\\LAVFilters64\\ffmpeg.exe',
  join(
    process.env.LOCALAPPDATA ?? '',
    'ms-playwright',
    'ffmpeg-1011',
    'ffmpeg-win64.exe',
  ),
  join(
    process.env.PLAYWRIGHT_BROWSERS_PATH ?? '',
    'ffmpeg-1013',
    'ffmpeg-win64.exe',
  ),
].filter((p) => p && p.length > 8) as string[]

function findFfmpeg(): string | null {
  for (const bin of FFMPEG_CANDIDATES) {
    const r = spawnSync(bin, ['-version'], { encoding: 'utf8' })
    if (r.status === 0) return bin
  }
  return null
}

async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms))
}

async function setCaption(page: Page, text: string) {
  await page.evaluate((caption) => {
    let el = document.getElementById('demo-caption')
    if (!el) {
      el = document.createElement('div')
      el.id = 'demo-caption'
      el.setAttribute(
        'style',
        [
          'position:fixed',
          'left:24px',
          'right:24px',
          'bottom:20px',
          'z-index:2147483647',
          'pointer-events:none',
          'padding:14px 18px',
          'border:3px solid #111',
          'border-radius:16px',
          'background:#fffbe6',
          'color:#111',
          'font:700 18px/1.35 system-ui,Segoe UI,sans-serif',
          'box-shadow:4px 4px 0 #111',
          'text-align:center',
        ].join(';'),
      )
      document.body.appendChild(el)
    }
    el.textContent = caption
  }, text)
}

async function clearCaption(page: Page) {
  await page.evaluate(() => document.getElementById('demo-caption')?.remove())
}

async function slowScroll(page: Page, px: number, steps = 8) {
  const step = px / steps
  for (let i = 0; i < steps; i++) {
    await page.mouse.wheel(0, step)
    await sleep(180)
  }
}

async function main() {
  await rm(RAW_DIR, { recursive: true, force: true })
  await mkdir(RAW_DIR, { recursive: true })
  await mkdir(dirname(OUT_MP4), { recursive: true })

  const started = Date.now()
  const withinBudget = () => Date.now() - started < MAX_MS

  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 1,
    recordVideo: { dir: RAW_DIR, size: VIEWPORT },
  })
  const page = await context.newPage()

  try {
    // 0:00 — home / brand (~20s)
    await page.goto(BASE, { waitUntil: 'networkidle', timeout: 60_000 })
    await setCaption(page, 'Shop Honest — AI agents catch dark patterns on the full shopping journey')
    await sleep(9_000)

    await setCaption(page, 'Retail & Commerce · audit the checkout a shopper actually meets')
    const storeA = page.getByRole('heading', { name: /BazaarNest · Store A/i })
    await storeA.scrollIntoViewIfNeeded()
    await sleep(6_000)

    // Scan it (replay) + watch the journey (~25s before skip)
    await setCaption(page, 'Store A · Scan it — replay of a real Gemini audit (instant, free)')
    const storeCard = page.locator('article').filter({ has: storeA })
    await storeCard.getByRole('button', { name: /Scan it/i }).click()
    await page.waitForURL(/\/audit\//, { timeout: 60_000 })
    await sleep(3_000)

    await setCaption(page, 'Agents walk product → cart → checkout · every claim cites a measured element')
    const skip = page.getByRole('button', { name: /Skip to report/i })
    await skip.waitFor({ state: 'visible', timeout: 90_000 })
    await sleep(14_000)
    await skip.click()

    // Report overview
    const fixIt = page.locator('#overview').getByRole('button', { name: /^Fix it$/i })
    await fixIt.waitFor({ state: 'visible', timeout: 90_000 })
    await setCaption(page, '9 dark patterns · grounded screenshots · the rule each one breaks')
    await sleep(8_000)

    // Money / bill beat
    await setCaption(page, 'Bill grew ₹1,499 → ₹1,894 · “you save ₹2,500” was really ₹100')
    const moneyNav = page.getByRole('button', { name: /Money/i }).first()
    if (await moneyNav.isVisible().catch(() => false)) {
      await moneyNav.click()
      await sleep(10_000)
    } else {
      await slowScroll(page, 900)
      await sleep(6_000)
    }

    // Findings
    await setCaption(page, 'Findings with evidence — timers, sneaked add-ons, late fees, inflated M.R.P.')
    const findingsNav = page.getByRole('button', { name: /Findings/i }).first()
    if (await findingsNav.isVisible().catch(() => false)) {
      await findingsNav.click()
      await sleep(6_000)
      await slowScroll(page, 900)
      await sleep(6_000)
    }

    // Fix it
    if (withinBudget()) {
      await setCaption(page, 'Fix it — propose settings changes, project the numbers, prove them')
      await fixIt.click()
      const apply = page.getByRole('button', { name: /Apply all \d+ fixes/i })
      await apply.waitFor({ state: 'visible', timeout: 90_000 })
      await sleep(5_000)
      await apply.click()
      await setCaption(page, 'Projected: trust score ↑ · hidden extras ↓ · fine ceiling shrinks')
      await sleep(12_000)
      await page.getByRole('dialog', { name: 'Fix it' }).getByRole('button', { name: 'Close' }).click()
      await sleep(1_500)
    }

    // Accuracy beat
    if (withinBudget()) {
      await setCaption(page, 'Measured: 9/9 on the rigged store · 0 false alarms on the honest one')
      await sleep(8_000)
      await setCaption(page, 'Honest by design — stops at sign-in walls & bot protection, never invents a “clean” page')
      await sleep(8_000)
    }

    // End card
    await clearCaption(page)
    await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60_000 })
    await setCaption(page, 'Live: shop-honest-ai.web.app · Team Zero Context · AI Builder Cup 2026')
    await sleep(8_000)
  } finally {
    await page.close()
    await context.close()
    await browser.close()
  }

  const files = (await readdir(RAW_DIR)).filter((f) => f.endsWith('.webm'))
  if (!files.length) throw new Error('Playwright wrote no video file')
  const rawPath = join(RAW_DIR, files[0])
  const namedRaw = join(RAW_DIR, 'shop-honest-demo.webm')
  if (rawPath !== namedRaw) await rename(rawPath, namedRaw)

  const elapsed = ((Date.now() - started) / 1000).toFixed(1)
  console.log(`Raw recording: ${namedRaw} (script wall ~${elapsed}s)`)

  const ffmpeg = findFfmpeg()
  if (!ffmpeg) {
    console.warn('ffmpeg not found — leaving WebM only. Install ffmpeg to produce MP4.')
    await writeFile(
      join(ROOT, 'docs', 'demo', 'STATUS.txt'),
      `Raw WebM at docs/demo/raw/shop-honest-demo.webm\nConvert with: ffmpeg -i docs/demo/raw/shop-honest-demo.webm -c:v libx264 -pix_fmt yuv420p -movflags +faststart -crf 23 -t 170 docs/demo/shop-honest-demo.mp4\n`,
      'utf8',
    )
    return
  }

  // Trim to 2:50 max, H.264, reasonable size
  const args = [
    '-y',
    '-i',
    namedRaw,
    '-t',
    '170',
    '-vf',
    'scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2',
    '-c:v',
    'libx264',
    '-pix_fmt',
    'yuv420p',
    '-movflags',
    '+faststart',
    '-crf',
    '23',
    '-an',
    OUT_MP4,
  ]
  console.log(`Encoding MP4 with ${ffmpeg}…`)
  const enc = spawnSync(ffmpeg, args, { encoding: 'utf8' })
  if (enc.status !== 0) {
    console.error(enc.stderr)
    throw new Error(`ffmpeg failed with status ${enc.status}`)
  }
  console.log(`Wrote ${OUT_MP4}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
