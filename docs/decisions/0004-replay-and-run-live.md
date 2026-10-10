# 0004. Recorded replay by default, "Run live" on demand

**Status:** Accepted · 2026-10-10

## Context
Judges will click "Scan it" many times, often at the same moment, and the live demo must not fail on stage because of network or model latency. Every live audit also costs money.

## Decision
- For the sample stores, **"Scan it" replays a recorded real run** (`mode: replay`): the exact event log the real agents produced, with real timings.
- A **"Run live"** button starts a fresh audit with the real agents (`mode: live`), rate-limited and budget-capped.
- Recordings are produced by `backend/scripts/record.py` and re-recorded whenever the agents change, so a replay always reflects the current system.
- The UI says plainly when a run is a recording, and when it was recorded.

## Consequences
- The default demo is free, instant and deterministic, and "Run live" still proves the system works for real.
- We must re-record after agent changes, or the replay drifts from reality. This is part of the release checklist.
- The same mechanism doubles as golden test data.
