# 0010. The event stream goes straight to Cloud Run, not through Firebase Hosting

**Status:** Accepted · 2026-10-11

## Context
The site is on Firebase Hosting and the API on Cloud Run, with Hosting forwarding `/api/**` to the service. That keeps calls same-origin, which the PDF needs to crop screenshots on a canvas. The live view, however, depends on a server-sent event stream that delivers each agent step as it happens. Tested through Hosting on a preview channel, a 40-second replay arrived as one block: all 51 events at 48.5 s. Hosting buffers streamed responses (and caps forwarded requests at 60 s).

## Decision
- **Only the event stream bypasses Hosting.** The web app reads it from the Cloud Run URL (`VITE_STREAM_BASE` in `web/.env.production`). Starting audits, status, fast-forward and screenshots still go through Hosting's `/api/**` rewrite, same-origin.
- **CORS is limited to the stream's readers.** The backend allows the site's two domains plus its preview channels (`CORS_ORIGINS`, `CORS_ORIGIN_REGEX` in `deploy/backend.env.yaml`), for GET and POST only.
- **A watchdog covers dropped streams.** If nothing has arrived for 60 s, the client reopens the stream from the last event it saw (`?after=`), since a connection that silently stalls raises no error in `EventSource`.

## Consequences
- Events arrive as they happen (measured: first event after about 1.4 s, then steadily until the end), with Cloud Run's 15-minute request limit instead of Hosting's 60 s.
- The Cloud Run URL is visible in the web bundle and is a public endpoint. That was already true behind Hosting; the per-visitor and daily limits on live audits apply either way.
- If the service moves (another region, a custom domain), `VITE_STREAM_BASE` must change with it.
