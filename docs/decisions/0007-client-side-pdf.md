# 0007. PDF reports are generated in the browser

**Status:** Accepted · 2026-10-10 (already implemented)

## Context
Compliance teams need a proper downloadable report, not a printout of the web page. The report data is already in the browser when the audit completes.

## Decision
- The PDF is built **client-side** with `@react-pdf/renderer`, loaded on demand (its own ~450 KB gzip chunk).
- Evidence screenshots are cropped and zoomed on a canvas before they're embedded, so the cited element is readable at print size.
- The PDF includes reviewer decisions and the jurisdiction selected on screen.

## Consequences
- No server rendering, no extra service, and no cost per report. It works for replayed and live audits alike.
- Screenshots served from Cloud Storage need a **CORS rule** for the site origin, so the canvas can read them.
- If a server-side PDF is ever needed (e.g. emailed reports), the same `AuditPdf` component can render in Node.
