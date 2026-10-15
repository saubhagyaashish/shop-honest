// Exports the reference data the backend shares with the web app into
// shared/*.json, so both read one copy:
//   legal.json          regions, rules per pattern, precedents (mock/legal.ts)
//   patterns.json       names, severities, primary rules and fixes
//   price_history.json  stand-in for BigQuery until Phase 4 (store/catalog.ts)
//   answer_key.json     ground truth per store instance, for the evals
//   store_settings.json the demo stores' settings and current values, for the Fixer (store/settings.ts)
//
//   npm run knowledge

import { writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { JourneyStep, PatternId } from '../src/shared/contract'
import { JOURNEY_STEPS } from '../src/shared/contract'
import { PATTERNS } from '../src/shared/patterns'
import { FIXES } from '../src/auditor/mock/fixes'
import { EXPOSURE_DISCLAIMER, JURISDICTIONS, STRICTEST } from '../src/auditor/mock/legal'
import { ALSO_ACCEPTABLE, ANSWER_KEY } from '../src/store/answerKey'
import { PRODUCTS } from '../src/store/catalog'
import { currentSettings, SETTINGS } from '../src/store/settings'
import { ALL_STORES, storePath } from '../src/store/variants'

const SHARED = join(dirname(fileURLToPath(import.meta.url)), '../../shared')

async function write(name: string, data: unknown) {
  const file = join(SHARED, name)
  await writeFile(file, JSON.stringify(data, null, 2) + '\n')
  console.log(`Wrote ${file}`)
}

async function main() {
  await write('legal.json', { strictest: STRICTEST, disclaimer: EXPOSURE_DISCLAIMER, jurisdictions: JURISDICTIONS })

  await write(
    'patterns.json',
    Object.fromEntries(
      (Object.keys(PATTERNS) as PatternId[]).map((id) => [
        id,
        {
          name: PATTERNS[id].name,
          description: PATTERNS[id].description,
          defaultSeverity: PATTERNS[id].defaultSeverity,
          rule: PATTERNS[id].rule,
          fix: FIXES[id],
          check: PATTERNS[id].check,
        },
      ]),
    ),
  )

  const history: Record<string, unknown> = {}
  for (const setup of ALL_STORES) {
    for (const product of PRODUCTS) {
      const points = product.priceHistory?.[setup.id]
      if (!points) continue
      history[storePath(setup, `/p/${product.slug}`)] = { currency: 'INR', points }
    }
  }
  await write('price_history.json', history)

  const cutAt = (step?: JourneyStep) => (step ? JOURNEY_STEPS.indexOf(step) : JOURNEY_STEPS.length)
  await write(
    'answer_key.json',
    Object.fromEntries(
      ALL_STORES.map((setup) => [
        setup.key,
        {
          blockedAt: setup.behaviour.signInWallAt ?? null,
          findings: ANSWER_KEY[setup.id]
            .filter((f) => JOURNEY_STEPS.indexOf(f.step) < cutAt(setup.behaviour.signInWallAt))
            .map(({ id, patternId, step, status }) => ({ id, patternId, step, status })),
          alsoAcceptable: ALSO_ACCEPTABLE[setup.id].filter((f) => JOURNEY_STEPS.indexOf(f.step) < cutAt(setup.behaviour.signInWallAt)),
        },
      ]),
    ),
  )
  await write('store_settings.json', {
    settings: SETTINGS,
    stores: Object.fromEntries(ALL_STORES.map((setup) => [setup.key, currentSettings(setup)])),
  })
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
