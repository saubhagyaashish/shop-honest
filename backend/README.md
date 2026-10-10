# Shop Honest backend

FastAPI service behind the dashboard: starts audits, runs them in the background, stores every event and streams them (resumable SSE). Design: [docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md) · API: [docs/API.md](../docs/API.md).

**Phase 1 (now):** the full API, the in-memory event log, the URL guard and **replay mode**, which plays recorded runs of the demo stores. The ADK agents (Navigator, Pattern Analyst…) arrive in Phases 2–3 behind the same API.

```sh
uv sync
uv run pytest                                     # tests
uv run ruff check . && uv run ruff format --check .
uv run uvicorn app.main:app --reload --port 8080  # http://localhost:8080/api/docs
```

| Path | What it is |
|---|---|
| `app/main.py` | App factory and wiring |
| `app/config.py` | Settings from environment variables |
| `app/api/audits.py` | `POST /api/audits`, `GET /api/audits/{id}`, `GET …/events` (SSE), `POST …/fast-forward`, `GET /api/health` |
| `app/contract/models.py` | Pydantic mirror of `web/src/shared/contract.ts` (checked by tests against `shared/contract.schema.json`) |
| `app/browser/url_guard.py` | Allowlist + SSRF protection for every audit target |
| `app/stores/events.py` | Event log interface + in-memory implementation |
| `app/runner/runner.py` | Background audit runner: ordering, terminal event, status |
| `app/replay/` | Recordings (`npm run recordings` in `web/`) and the player |
