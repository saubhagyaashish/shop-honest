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

Live at **<https://shop-honest-ai.web.app>**, on the real backend (Cloud Run, Firestore, Cloud Storage, Gemini on Vertex AI):

- **Scan it** replays a recorded real run of a sample store (the same agents and Gemini as "Run live"): free, instant and unlimited.
- **Run live** audits the store for real, with Gemini judging. It takes about a minute, and is limited to 3 runs per visitor per hour and 100 a day across the site.

If the backend can't be reached, sample-store scans fall back to the built-in demo replay. Locally, `npm run dev` runs the same dashboard on that built-in demo, with no backend needed; the contract is `web/src/shared/contract.ts`.

### Deploying

```sh
deploy/setup.sh                              # once: APIs, Firestore, bucket, BigQuery, registry, service account
(cd backend && uv run python -m scripts.seed_price_history)   # load the demo catalog's price history (re-run before judging)
deploy/backend.sh                            # build with Cloud Build, deploy to Cloud Run (image tagged with the commit)
npx firebase-tools deploy --only hosting     # the site (production build talks to the backend)
uv run --project backend python deploy/monitoring.py setup   # once: email alerts on errors and 5xx
deploy/judging.sh on                         # judging day: warm instance, higher per-visitor limit, uptime probe
deploy/judging.sh off                        # afterwards (a warm instance costs money all day)
```

Deploy from a committed tree, so the running image matches a commit (`/api/health` reports it). Project `shop-honest-72fd8`, region `asia-south1`; rollback and the rest in [ARCHITECTURE.md §11 and §13](docs/ARCHITECTURE.md#11-reliability-and-cost-controls).

## Architecture

The backend (Python + Google ADK agents on Cloud Run, Gemini on Vertex AI, Firestore, Cloud Storage, BigQuery) is designed and documented. **Phases 1–3 are built** and run locally: a FastAPI backend with the full API, a resumable event stream and replay mode; live audits where a headless Chromium walks the store and measured checks report what they find; and ADK agents (Pattern Analyst, Adjudicator) that judge wording and design, with every model claim grounded on measured elements and verified before it's reported. It runs on Gemma 3 4B locally; Gemini is wired in and needs an API key.

- [**Architecture**](docs/ARCHITECTURE.md): system context, agents, audit flow, data model, model providers, security, costs, evaluation, roadmap
- [**API reference**](docs/API.md): endpoints, the event stream, the event catalogue with examples
- [**Decision records**](docs/decisions/README.md): why we chose what we chose

```
shophonest/
├── web/        React app: dashboard, report, PDF, demo store (built)
├── backend/    Python FastAPI API, audit runner, Playwright navigator, measured checks and ADK judging agents
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
uv run pytest                                    # the browser tests need `npm run build` in web/ first; cloud tests need SHOP_HONEST_CLOUD_TESTS=1
uv run uvicorn app.main:app --reload --port 8080
```

Then, in another terminal, `cd web && npm run dev:live` and open <http://localhost:5173>: the header shows **live API**. On each sample card:

- **Scan it** replays a recorded run (instant, and it can skip to the report).
- **Run live** sends a real headless Chromium through the store: real screenshots, real prices and measured findings, in about 15 seconds. It never pays, signs in or creates an account. On Store C it stops at the sign-in wall and reports what it reached.

**With a model judging.** Start the backend with `MODEL_PROVIDER=ollama` (needs [Ollama](https://ollama.com) and `ollama pull gemma3:4b`). Live audits then also get wording and design findings: the Pattern Analyst reads each screen, and the Adjudicator double-checks every claim. Unverifiable claims land in the report's human review queue. Expect about 30–50 s per audit locally. For Gemini, set `MODEL_PROVIDER=gemini`: it goes through Vertex AI using your `gcloud auth application-default login`, with no key (see `backend/.env.example`). Add `STORE_BACKEND=gcp` to use the real Firestore and Cloud Storage instead of memory.

How well live audits do against the answer key: `uv run python -m evals.answer_key --provider gemini --runs 2` (Gemini through Vertex AI, using your `gcloud auth application-default login`). With `gemini-3.8-flash`: **A 9/9, B no false alarms, C 6/6 before the wall**, with the unverifiable claim sent to human review every run. Gemma 3 4B locally gets A 8/9, B 0, C 5/6; measured checks alone get A 6/9. Settings are environment variables (or `backend/.env`); see [ARCHITECTURE.md §13](docs/ARCHITECTURE.md#13-environments-and-deployment).
