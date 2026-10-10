# 0003. Switchable model providers: replay, Ollama, Gemini

**Status:** Accepted · 2026-10-10

## Context
Gemini calls cost money (about ₹15–40 per live audit) and need network access. Most development work (APIs, streaming, the runner, schemas, UI integration) doesn't need a strong model, and some of it needs no model at all.

## Decision
One setting, `MODEL_PROVIDER`, selects how every agent gets its model:

| Value | What runs | Used for |
|---|---|---|
| `replay` | No model; a recorded run is played back | UI and infrastructure work, CI, the public demo default |
| `ollama` | **Gemma 3 4B** on the developer's machine via Ollama, through ADK's LiteLLM connector | Building agents, prompts and schemas offline, for free |
| `gemini` | Gemini via the Google AI Studio free tier in development; **Vertex AI** in production | Accuracy evals, "Run live", the deployed backend |

Agents ask the provider factory (`backend/app/models/`) for a *fast* or *smart* model, never for a specific vendor or model ID.

## Consequences
- Most development costs nothing, and the team can work offline.
- Small local models are weaker. Accuracy is only ever measured with Gemini, never with Ollama.
- Every agent must handle schema-validated JSON from any provider, which also makes them more robust.
