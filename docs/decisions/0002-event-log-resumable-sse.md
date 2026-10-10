# 0002. Firestore event log + resumable server-sent events

**Status:** Accepted · 2026-10-10

## Context
The dashboard shows an audit live: screenshots, findings and the agents' chat as they happen. An audit runs for one to two minutes. Browsers refresh, networks drop, and the Firebase Hosting → Cloud Run path may cut long requests. We also need finished audits to stay viewable from a shared link.

## Decision
- The runner **appends every event to Firestore** (`audits/{id}/events/{seq}`) *before* it is sent anywhere. The sequence number is the event's identity.
- The browser receives events over **server-sent events (SSE)**. Each message's `id` is the sequence number, and on reconnect the server replays everything after `Last-Event-ID`.
- The final `AuditReport` is also stored on the audit document, for `GET /api/audits/{id}`.

## Consequences
- Refreshes, drops and proxy timeouts are harmless: the stream resumes where it left off, and a finished audit replays in full.
- SSE is one-way and plain HTTP, simpler than WebSockets and supported natively by `EventSource`. The client already exists (`sseSource.ts`).
- Firestore usage is small (about 80 writes per audit), well inside the free tier at hackathon scale.
- Local development swaps Firestore for an in-memory log with the same interface.
