# Shop Honest

Dark patterns? Caught in 4K. Shop Honest sends AI agents shopping like a customer and catches dark patterns before a regulator does.
Google Cloud AI Builder Cup 2026 · Retail & Commerce. Original concept doc: `Honest_Journey_Auditor.docx`.

## What's here so far

`web/` is one Vite + React + TypeScript app with two parts:

- **Shop Honest dashboard** (`/`): a neo-brutalist UI with a react-three-fiber 3D hero (lazy-loaded, SVG fallback for reduced motion or no WebGL). Paste a URL or run a sample audit. Watch the agents walk the journey live, then get a report with a trust score, findings, screenshot evidence, rule citations and a human-review queue.
- **Demo storefront** (`/demo/store-a`, `/demo/store-b`): "BazaarNest", a fictional Indian e-commerce store.
  - Store A has 8 planted violations and 1 borderline claim.
  - Store B is the honest control.
  - Ground truth lives in `web/src/store/answerKey.ts`.

The dashboard currently runs in **demo mode**: audits replay real captures of the sample stores through the same event stream the agent backend will use. The contract is `web/src/shared/contract.ts`. Setting `VITE_AUDIT_SOURCE=live` switches the dashboard to `POST /api/audits` and the SSE stream at `/api/audits/:id/events`.

Live at **<https://shop-honest.web.app>**.

## Architecture

The backend (Python + Google ADK agents on Cloud Run, Gemini on Vertex AI, Firestore, Cloud Storage, BigQuery) is designed and documented. **Phase 1 is built**: a FastAPI backend with the full API, a resumable event stream and replay mode, running locally. The agents come next.

- [**Architecture**](docs/ARCHITECTURE.md): system context, agents, audit flow, data model, model providers, security, costs, evaluation, roadmap
- [**API reference**](docs/API.md): endpoints, the event stream, the event catalogue with examples
- [**Decision records**](docs/decisions/README.md): why we chose what we chose

```
shophonest/
├── web/        React app: dashboard, report, PDF, demo store (built)
├── backend/    Python FastAPI API + audit runner (Phase 1); ADK agents + Playwright next
├── shared/     contract.schema.json (generated from web/src/shared/contract.ts)
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
| `npm run capture` | Walks both stores in Chromium and refreshes screenshots and bounding boxes for the mock audits |
| `npm test` | Unit tests (trust score; mock audits match the answer key) |
| `npm run typecheck` / `npm run lint` / `npm run build` | Checks and production build |

## Run the backend

Needs [uv](https://docs.astral.sh/uv/) (it installs Python 3.12 for the project).

```sh
cd backend
uv sync                                          # install
uv run pytest                                    # 32 tests: API, stream, URL guard, contract
uv run uvicorn app.main:app --reload --port 8080
```

Then, in another terminal, `cd web && npm run dev:live` and open <http://localhost:5173>: the header shows **live API** and audits stream from the backend. Settings are environment variables (or `backend/.env`); see [ARCHITECTURE.md §13](docs/ARCHITECTURE.md#13-environments-and-deployment).
