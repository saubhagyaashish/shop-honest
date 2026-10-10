# Shop Honest

Dark patterns? Caught in 4K. Shop Honest sends AI agents shopping like a customer and catches dark patterns before a regulator does.
Google Cloud AI Builder Cup 2026 · Retail & Commerce. Original concept doc: `Honest_Journey_Auditor.docx`.

## What's here so far

`web/` is one Vite + React + TypeScript app with two parts:

- **Shop Honest dashboard** (`/`): a neo-brutalist UI with a react-three-fiber 3D hero (lazy-loaded, SVG fallback for reduced motion or no WebGL). Paste a URL or run a sample audit. Watch the agents walk the journey live, then get a report with a trust score, findings, screenshot evidence, rule citations and a human-review queue.
- **Demo storefront** (`/demo/store-a`, `/demo/store-b`, `/demo/store-c`): "BazaarNest", a fictional Indian e-commerce store.
  - Store A has 8 planted violations and 1 borderline claim.
  - Store B is the honest control.
  - Store C is Store A behind a sign-in wall at checkout: the "logged-out shopper" case, where an audit can only be partial.
  - Ground truth lives in `web/src/store/answerKey.ts` (exported to `shared/answer_key.json` for the backend eval).

The dashboard currently runs in **demo mode**: audits replay real captures of the sample stores through the same event stream the agent backend will use. The contract is `web/src/shared/contract.ts`. Setting `VITE_AUDIT_SOURCE=live` switches the dashboard to `POST /api/audits` and the SSE stream at `/api/audits/:id/events`.

Live at **<https://shop-honest.web.app>**.

## Architecture

The backend (Python + Google ADK agents on Cloud Run, Gemini on Vertex AI, Firestore, Cloud Storage, BigQuery) is designed and documented. **Phases 1–2 are built** and run locally: a FastAPI backend with the full API, a resumable event stream and replay mode, plus live audits where a headless Chromium walks the store and measured checks report what it finds. Gemini judgement comes next.

- [**Architecture**](docs/ARCHITECTURE.md): system context, agents, audit flow, data model, model providers, security, costs, evaluation, roadmap
- [**API reference**](docs/API.md): endpoints, the event stream, the event catalogue with examples
- [**Decision records**](docs/decisions/README.md): why we chose what we chose

```
shophonest/
├── web/        React app: dashboard, report, PDF, demo store (built)
├── backend/    Python FastAPI API, audit runner, Playwright navigator and measured checks; Gemini agents next
├── shared/     contract.schema.json (generated from contract.ts) + reference data for the backend (`npm run knowledge`)
└── docs/       architecture, API, decision records
```

## Run it

```sh
cd web
npm install
npx playwright install chromium   # once, for the capture script
npm run dev                       # http://localhost:5173
```

| Command | What it does |
|---|---|
| `VITE_MOCK_BLOCK_AT=checkout npm run dev` | Replays the sample audits as if a sign-in wall stopped the agent at that step (shows the partial-coverage UI) |
| `npm run dev:live` | Dashboard talking to the local backend (see below) instead of the mock |
| `npm run schema` | Regenerates `shared/contract.schema.json` after changing `contract.ts` |
| `npm run recordings` | Re-exports the replay recordings the backend plays (`backend/app/replay/recordings/`) |
| `npm run knowledge` | Re-exports the reference data the backend reads (`shared/legal.json`, `patterns.json`, `price_history.json`, `answer_key.json`) |
| `npm run capture` | Walks stores A and B in Chromium and refreshes screenshots and bounding boxes for the mock audits |
| `npm test` | Unit tests (trust score; mock audits match the answer key) |
| `npm run typecheck` / `npm run lint` / `npm run build` | Checks and production build |

## Run the backend

Needs [uv](https://docs.astral.sh/uv/) (it installs Python 3.12 for the project).

```sh
cd backend
uv sync                                          # install
uv run playwright install chromium               # once, for live audits
uv run pytest                                    # 62 tests; the 4 browser tests need `npm run build` in web/ first
uv run uvicorn app.main:app --reload --port 8080
```

Then, in another terminal, `cd web && npm run dev:live` and open <http://localhost:5173>: the header shows **live API**. On each sample card:

- **Scan it** replays a recorded run (instant, and it can skip to the report).
- **Run live** sends a real headless Chromium through the store: real screenshots, real prices and measured findings, in about 15 seconds. It never pays, signs in or creates an account. On Store C it stops at the sign-in wall and reports what it reached.

How well live audits do against the answer key: `uv run python -m evals.answer_key` (today A 6/9, B no false alarms, C 4/6 before the wall; the misses need the Gemini judgement coming in Phase 3). Settings are environment variables (or `backend/.env`); see [ARCHITECTURE.md §13](docs/ARCHITECTURE.md#13-environments-and-deployment).
