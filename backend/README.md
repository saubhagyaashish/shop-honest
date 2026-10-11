# Shop Honest backend

FastAPI service behind the dashboard: starts audits, runs them in the background, stores every event and streams them (resumable SSE). Design: [docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md) · API: [docs/API.md](../docs/API.md).

**Phase 3 (now):** the full API, the in-memory event log, the URL guard, **replay mode** (recorded runs of the demo stores) and **live mode**: a headless Chromium walks the store, measured checks turn what it sees into findings ([ADR-0008](../docs/decisions/0008-measured-checks-before-judgement.md)), and with `MODEL_PROVIDER=ollama|gemini` ADK agents judge wording and design. Each model claim is grounded on measured elements and verified before it's reported ([ADR-0009](../docs/decisions/0009-grounded-and-verified-model-claims.md)). A deterministic reporter builds the report.

```sh
uv sync
uv run playwright install chromium                # once
uv run pytest                                     # all tests; -m "not browser" skips the real-browser ones
uv run ruff check . && uv run ruff format --check .
uv run uvicorn app.main:app --reload --port 8080  # http://localhost:8080/api/docs

uv run python -m evals.answer_key --provider ollama --runs 3   # live audits vs shared/answer_key.json (serves web/dist)
MODEL_PROVIDER=ollama uv run uvicorn app.main:app --port 8080  # live audits judged by Gemma 3 4B
uv run python -m scripts.record store-a           # a real recording → var/recordings/ (--publish to replace the committed one)
uv run python -m scripts.capture_signals          # refresh tests/fixtures/ from a running web app on :5173
```

| Path | What it is |
|---|---|
| `app/main.py` | App factory and wiring |
| `app/config.py` | Settings from environment variables |
| `app/api/audits.py` | `POST /api/audits`, `GET /api/audits/{id}`, `GET …/events` (SSE), `GET …/frames/{n}.jpg`, `POST …/fast-forward`, `GET /api/health` |
| `app/contract/models.py` | Pydantic mirror of `web/src/shared/contract.ts` (checked by tests against `shared/contract.schema.json`) |
| `app/browser/url_guard.py` | Allowlist + SSRF protection for every audit target |
| `app/browser/session.py` | One Chromium per live audit; every request goes through the guard (navigation stays on the allowlist, nothing reaches internal addresses) |
| `app/browser/signals.js` | Generic in-page extractor: timers, stock, prices, dialogs, checkboxes, cart, order summary, fees, sign-in walls, with boxes |
| `app/journeys/` | How to walk a site family (`bazaarnest.py`: product → variant → cart → checkout → payment, never pays) |
| `app/runner/walk.py` | What a journey drives: captures, prices, steps, narration; runs the checks after every capture |
| `app/agents/checks.py` | Measured checks: restarting timer, frozen stock, inflated MRP, sneaked item, pre-ticked subscription, late fees |
| `app/agents/reporter.py` | Trust score, summary, price drift, legal exposure |
| `app/agents/elements.py` | A screen as a numbered element list with measured facts, for the model to cite |
| `app/agents/pattern_analyst.py` | ADK agent: proposes dark-pattern candidates for one screen (prompt in `prompts/`) |
| `app/agents/evidence.py` | Grounds candidates on measured elements; rules that drop claims the measurements contradict |
| `app/agents/adjudicator.py` | ADK agent: verifies each claim on a crop of its evidence, then sets confirmed / review / dropped |
| `app/agents/judge.py` | Runs the three for one screen, narrating every decision |
| `app/models/` | Provider factory (replay, ollama, gemini), the one call helper (schema, retry, timeout, budget), `ScriptedLlm` for tests |
| `app/knowledge.py` | Loads `shared/*.json` (patterns, legal, price history) |
| `app/stores/frames.py` | Live screenshots (local disk now, Cloud Storage later) |
| `app/stores/events.py` | Event log interface + in-memory implementation |
| `app/runner/runner.py` | Background audit runner (replay and live): ordering, one terminal event, status, time limit |
| `app/replay/` | Recordings (`npm run recordings` in `web/`) and the player |
