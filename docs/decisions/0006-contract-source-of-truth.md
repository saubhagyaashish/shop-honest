# 0006. The TypeScript contract is the source of truth

**Status:** Accepted · 2026-10-10

## Context
The web app was built first, against a mock. Every payload shape (events, findings, report, exposure) is already defined and exercised in `web/src/shared/contract.ts`. The backend is Python, and the two must never drift apart.

## Decision
- `web/src/shared/contract.ts` stays the **single source of truth**.
- `npm run schema` (in `web/`, using `ts-json-schema-generator`) generates **`shared/contract.schema.json`** from it.
- The backend's Pydantic models in `backend/app/contract/models.py` are hand-written for readability and **checked against** that schema: every recorded event must validate against the schema *and* round-trip through the models unchanged.
- **Contract tests** validate every event the backend emits against the schema. A mismatch fails CI.

## Consequences
- The frontend team can change the contract and the backend finds out immediately.
- One extra generation step: run `npm run schema` after changing `contract.ts`, then `uv run pytest` in `backend/`.
- Contract changes start in TypeScript, then flow to Python. Never the other way round.
