# Architecture decision records

Short notes on the decisions that shape Shop Honest: what we chose, why, and what it costs us. New decisions get the next number; superseded ones stay, marked as such.

| # | Decision | Status |
|---|---|---|
| [0001](0001-python-adk-cloud-run.md) | Python + Google ADK on one Cloud Run service, Playwright in the same container | Accepted |
| [0002](0002-event-log-resumable-sse.md) | Firestore event log + resumable server-sent events | Accepted |
| [0003](0003-model-providers.md) | Switchable model providers: replay, Ollama (local), Gemini | Accepted |
| [0004](0004-replay-and-run-live.md) | Recorded replay by default, "Run live" on demand, for the public demo | Accepted |
| [0005](0005-allowlist-and-safety.md) | Allowlist + SSRF guard; stop at sign-in walls | Accepted |
| [0006](0006-contract-source-of-truth.md) | The TypeScript contract is the source of truth, via a generated JSON Schema | Accepted |
| [0007](0007-client-side-pdf.md) | PDF reports are generated in the browser | Accepted |
| [0008](0008-measured-checks-before-judgement.md) | Measured checks first, model judgement on top | Accepted |
| [0009](0009-grounded-and-verified-model-claims.md) | Model claims are grounded on measured elements and verified before they're reported | Accepted |
| [0010](0010-event-stream-straight-to-cloud-run.md) | The event stream goes straight to Cloud Run, not through Firebase Hosting | Accepted |
| [0011](0011-audit-ownership-and-takeover.md) | Audits have an owner with a heartbeat; other instances can take over | Accepted |
| [0012](0012-price-history-in-bigquery.md) | Price history lives in BigQuery, grows with every audit, and the MRP rule doesn't depend on recency | Accepted |
| [0013](0013-general-navigator-on-third-party-stores.md) | A general navigator for stores we didn't build, with stricter rules there | Accepted |
| [0014](0014-audit-as-adk-workflow.md) | The live audit runs as an ADK agent graph, with an Adjudicator that checks evidence through tools | Proposed |

Back to [Architecture](../ARCHITECTURE.md).
