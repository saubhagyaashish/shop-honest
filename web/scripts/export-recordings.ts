// Exports the scripted mock audits as replay recordings for the backend
// (backend/app/replay/recordings/*.json). The backend swaps the
// placeholders for the real audit id and origin, and stamps real times.
// Real agent runs replace these recordings from Phase 2 onwards.
//
//   npm run recordings

import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildMockAuditForStore } from '../src/auditor/mock/scripts'
import { ALL_STORES, storePath } from '../src/store/variants'

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '../../backend/app/replay/recordings')
const AUDIT_ID = '__AUDIT_ID__'
const ORIGIN = '__ORIGIN__'

async function main() {
  await mkdir(OUT_DIR, { recursive: true })
  for (const setup of ALL_STORES) {
    const recording = {
      version: 1,
      store: setup.key,
      pathPrefix: `${storePath(setup)}/`,
      source: 'scripted-mock',
      recordedAt: new Date().toISOString(),
      placeholders: { auditId: AUDIT_ID, origin: ORIGIN },
      events: buildMockAuditForStore(setup, AUDIT_ID, ORIGIN),
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
