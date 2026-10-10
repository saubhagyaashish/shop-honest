// Exports the scripted mock audits as replay recordings for the backend
// (backend/app/replay/recordings/*.json). The backend swaps the
// placeholders for the real audit id and origin, and stamps real times.
// Real agent runs replace these recordings from Phase 2 onwards.
//
//   npm run recordings

import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildMockAudit } from '../src/auditor/mock/scripts'
import type { StoreId } from '../src/store/catalog'
import { STORES, storePath } from '../src/store/variants'

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '../../backend/app/replay/recordings')
const AUDIT_ID = '__AUDIT_ID__'
const ORIGIN = '__ORIGIN__'

async function main() {
  await mkdir(OUT_DIR, { recursive: true })
  for (const storeId of Object.keys(STORES) as StoreId[]) {
    const setup = STORES[storeId]
    const recording = {
      version: 1,
      store: setup.key,
      pathPrefix: `${storePath(setup)}/`,
      source: 'scripted-mock',
      recordedAt: new Date().toISOString(),
      placeholders: { auditId: AUDIT_ID, origin: ORIGIN },
      events: buildMockAudit(storeId, AUDIT_ID, ORIGIN),
    }
    const file = join(OUT_DIR, `${setup.key}.json`)
    await writeFile(file, JSON.stringify(recording, null, 2) + '\n')
    console.log(`Wrote ${file} (${recording.events.length} events)`)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
