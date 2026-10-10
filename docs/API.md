# Shop Honest: API reference

> Every payload here is defined in [`web/src/shared/contract.ts`](../web/src/shared/contract.ts), the single source of truth ([ADR-0006](decisions/0006-contract-source-of-truth.md)). Field names, types and event names must match it exactly. The examples below were generated from the current mock audit.
>
> Related: [Architecture](ARCHITECTURE.md) · [Decision records](decisions/README.md)

Base URL: same origin as the web app, `https://shop-honest.web.app/api` (Firebase Hosting rewrites `/api/**` to Cloud Run). Locally: `http://localhost:8080/api`.

All bodies are JSON (`Content-Type: application/json`), except the event stream (`text/event-stream`).

## Endpoints

### `POST /api/audits`: start an audit

Request

```json
{
  "targetUrl": "https://shop-honest.web.app/demo/store-a/p/sonicbuds-pro",
  "mode": "auto"
}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `targetUrl` | string (http/https URL) | yes | A product page. Must pass the URL guard (allowlist, no private or metadata addresses). |
| `mode` | `"auto"` · `"replay"` · `"live"` | no, default `auto` | `auto`: replay a recorded run if one exists for this URL, otherwise live. `live`: always run the agents (rate-limited). |

Response `202 Accepted`

```json
{ "auditId": "aud_7Kq2m9", "mode": "replay", "eventsUrl": "/api/audits/aud_7Kq2m9/events" }
```

The web client only needs `auditId`; the other fields are informational.

### `GET /api/audits/{auditId}`: status and report

Response `200 OK`

```json
{
  "auditId": "aud_7Kq2m9",
  "status": "completed",
  "mode": "replay",
  "targetUrl": "https://shop-honest.web.app/demo/store-a/p/sonicbuds-pro",
  "createdAt": "2026-10-10T12:00:00.000Z",
  "report": { "…": "AuditReport, present when status is completed" },
  "error": null
}
```

`status`: `queued` → `running` → `completed` | `failed`.

### `GET /api/audits/{auditId}/events`: live event stream (SSE)

- `Content-Type: text/event-stream`. One message per `AuditEvent`, in order:

  ```
  id: 7
  data: {"type":"price.observed","step":"cart","label":"Cart","total":{"amount":1698,"currency":"INR"}}

  ```

- `id` is the event's sequence number (1, 2, 3…). Messages use the default event type, so the browser's `EventSource.onmessage` receives them (that's what `sseSource.ts` listens to).
- **Resume:** on reconnect the browser sends `Last-Event-ID`; the server replays every event after it from the stored log. `?after=<seq>` does the same for clients that can't set headers.
- **Heartbeat:** a comment line (`: ping`) every 15 s keeps proxies from closing an idle stream.
- **End:** the server closes the stream after the terminal event (`audit.completed` or `audit.failed`). Connecting after the audit has finished replays the whole log and closes.
- Opening the stream of an audit that is still `queued` is fine: it waits for the first event.

### `POST /api/audits/{auditId}/fast-forward`: skip ahead (replays only)

Plays the rest of a replayed audit without delays; this powers "Skip to report". `202 {"ok": true}`. Returns `409 not_replay` for live audits, which can't be sped up.

### `GET /api/health`

`200 OK` → `{ "ok": true, "version": "<git sha>" }`. Used by Cloud Run.

## Errors

Every non-2xx response has the same shape:

```json
{ "error": { "code": "host_not_allowed", "message": "Only the demo stores and approved sites can be audited in this deployment." } }
```

| Status | `code` | When |
|---|---|---|
| 400 | `invalid_url` | Not an http(s) URL, or malformed |
| 403 | `host_not_allowed` | Host not on `ALLOWED_HOSTS`, or it resolves to a private/metadata address |
| 404 | `audit_not_found` | Unknown `auditId` |
| 409 | `no_recording` | No recorded run exists for this URL (Phase 1 serves only recordings) |
| 409 | `not_replay` | Fast-forward requested for a live audit |
| 400 | `invalid_request` | The body doesn't match the schema (e.g. an unknown `mode`) |
| 429 | `rate_limited` | Too many live audits from this requester |
| 501 | `live_unavailable` | `mode: "live"` requested before the agents are switched on (until Phase 2) |
| 503 | `at_capacity` | All audit slots are busy; retry shortly |
| 404 / 405 | `not_found` / `method_not_allowed` | Unknown route or wrong HTTP method |

Failures *during* an audit are not HTTP errors: they arrive on the stream as `audit.failed`.

## Event catalogue

Every event is one variant of `AuditEvent` in `contract.ts`, discriminated by `type`.

| `type` | Fields | Emitted when |
|---|---|---|
| `audit.started` | `auditId`, `targetUrl`, `startedAt` | First event of every audit |
| `step.started` | `step`, `url` | The Navigator begins a journey step |
| `step.captured` | `step`, `url`, `screenshotUrl` | A screen was captured (a step may have several, e.g. before and after a reload) |
| `step.blocked` | `step`, `url`, `reason`, `screenshotUrl?` | The agent can't continue (e.g. `"Sign-in required"`). No later `step.started` follows. |
| `agent.log` | `agent`, `message` | An agent explains what it is doing (the "squad chat") |
| `price.observed` | `step`, `label`, `total: Money` | The running total the shopper would pay at this point |
| `finding` | `finding: Finding` | A grounded, adjudicated finding (confirmed or needs_review) |
| `audit.completed` | `report: AuditReport` | Terminal: the full report |
| `audit.failed` | `error` | Terminal: the audit could not finish |

**Ordering guarantees**
1. `audit.started` is first; exactly one terminal event (`audit.completed` or `audit.failed`) is last.
2. Steps run in journey order: `product` → `variant` → `cart` → `checkout` → `payment`.
3. Within a step: `step.started` comes before that step's captures, prices and findings.
4. After `step.blocked`, only `agent.log` and the terminal event may follow.

**Enumerations**

| Type | Values |
|---|---|
| `JourneyStep` | `product`, `variant`, `cart`, `checkout`, `payment` |
| `AgentName` | `navigator`, `pattern_analyst`, `evidence`, `price_historian`, `seller_trust`, `adjudicator`, `reporter` |
| `Severity` | `high`, `medium`, `low` |
| `FindingStatus` | `confirmed`, `needs_review` |
| `StepStatus` | `audited`, `blocked` |
| `JurisdictionCode` | `IN`, `SG`, `GB`, `EU`, `US`, `KR`, `AU` |
| `CurrencyCode` | `INR`, `SGD`, `GBP`, `EUR`, `USD`, `KRW`, `AUD` |
| `PatternId` | The 13 CCPA patterns (`false_urgency`, `basket_sneaking`, `confirm_shaming`, `forced_action`, `subscription_trap`, `interface_interference`, `bait_and_switch`, `drip_pricing`, `disguised_advertisement`, `nagging`, `trick_question`, `saas_billing`, `rogue_malware`) plus `misleading_price` |

Conventions: timestamps are ISO-8601 UTC; money is `{ amount, currency }` in whole units; bounding boxes are fractions (0–1) of the screenshot's width and height.

### Example: `finding`

```json
{
  "type": "finding",
  "finding": {
    "id": "a-added-protection",
    "patternId": "basket_sneaking",
    "title": "Protection plan added to the cart without consent",
    "explanation": "The agent added exactly one item to the cart. The cart then held two lines: a ₹199 \"1-Year Accidental Damage Protection\" had been added automatically. The shopper never ticked, chose or was asked about it.",
    "severity": "high",
    "confidence": 0.96,
    "status": "confirmed",
    "step": "cart",
    "pageUrl": "https://shop-honest.web.app/demo/store-a/cart",
    "rule": {
      "source": "CCPA Guidelines for Prevention and Regulation of Dark Patterns, 2023",
      "clause": "Annexure 1, item 2",
      "verified": true
    },
    "detectedBy": "evidence",
    "evidence": {
      "frames": [
        {
          "screenshotUrl": "https://storage.googleapis.com/shop-honest-audits/audits/aud_7Kq2m9/frames/5.jpg?X-Goog-Signature=…",
          "caption": "Cart after adding one item",
          "bbox": { "x": 0.0578, "y": 0.4019, "w": 0.6063, "h": 0.1675 }
        }
      ],
      "elementText": "1-Year Accidental Damage Protection 12 months · Sold by BazaarNest Care ₹199 REMOVE",
      "observations": [
        "Added by the agent: 1 line (SonicBuds Pro, Ocean Blue)",
        "Found in cart: 2 lines",
        "Extra line: 1-Year Accidental Damage Protection, ₹199"
      ]
    },
    "remediation": "Never add items to the cart for the shopper. Offer add-ons as an unticked option with the price shown next to it."
  }
}
```

### Example: `audit.completed` (trimmed)

```json
{
  "type": "audit.completed",
  "report": {
    "auditId": "aud_7Kq2m9",
    "targetUrl": "https://shop-honest.web.app/demo/store-a/p/sonicbuds-pro",
    "startedAt": "2026-10-10T12:00:00.000Z",
    "completedAt": "2026-10-10T12:01:42.000Z",
    "trustScore": 22,
    "steps": [
      { "step": "product", "url": "https://shop-honest.web.app/demo/store-a/p/sonicbuds-pro", "screenshotUrl": "…/frames/2.jpg", "status": "audited" },
      { "step": "checkout", "url": "https://shop.example.in/checkout", "status": "blocked", "blockedReason": "Sign-in required" }
    ],
    "findings": ["…same shape as the finding event…"],
    "summary": "8 violations confirmed across 4 of 5 journey steps, and 1 claim sent for human review. The amount payable rose from ₹1,499 on the product page to ₹1,894 (+26%).",
    "exposure": {
      "priceDrift": {
        "advertised": { "amount": 1499, "currency": "INR" },
        "payable": { "amount": 1894, "currency": "INR" },
        "lines": [
          { "label": "1-Year Accidental Damage Protection", "amount": { "amount": 199, "currency": "INR" }, "kind": "sneaked_item", "firstSeen": "cart", "findingId": "a-added-protection" },
          { "label": "BazaarNest Plus membership", "amount": { "amount": 99, "currency": "INR" }, "kind": "subscription", "firstSeen": "checkout", "recurring": "monthly", "findingId": "a-ticked-membership" }
        ],
        "claimedSaving": { "amount": 2500, "currency": "INR" },
        "genuineSaving": { "amount": 500, "currency": "INR" },
        "savingFindingId": "a-inflated-mrp"
      },
      "strictest": "GB",
      "jurisdictions": [
        {
          "code": "IN",
          "name": "India",
          "law": "Consumer Protection Act, 2019 and the CCPA Guidelines for Prevention and Regulation of Dark Patterns, 2023",
          "regulator": "Central Consumer Protection Authority (CCPA)",
          "status": "in_force",
          "maxPenalty": "Up to ₹10 lakh per contravention, ₹50 lakh for each later one (s 21). …",
          "penaltyHeadline": "Up to ₹50 lakh + jail for repeat offences",
          "citations": { "a-added-protection": { "source": "CCPA Guidelines …, 2023", "clause": "Annexure 1, item 2", "verified": true } },
          "precedents": [
            { "id": "in-physicswallah", "jurisdiction": "IN", "company": "PhysicsWallah", "regulator": "CCPA", "date": "2026-08", "outcome": "₹5 lakh penalty", "patternIds": ["basket_sneaking"], "summary": "A ₹10 donation was pre-added to orders.", "sourceUrl": "https://www.aninews.in/…", "confidence": "reported" }
          ]
        }
      ],
      "disclaimer": "Shop Honest maps findings to laws and public enforcement outcomes to show exposure. It is not legal advice. …"
    }
  }
}
```

A full audit lists all five steps (or the reachable ones plus one `blocked` step), every finding, and all seven jurisdictions.

## Client notes (web app)

- `web/src/auditor/source/sseSource.ts` implements this API. `npm run dev:live` (or `VITE_AUDIT_SOURCE=live`) uses it; in development Vite proxies `/api` to the backend on `127.0.0.1:8080`.
- `EventSource` reconnects on its own and resumes via `Last-Event-ID`; the client only reports `audit.failed` after 3 consecutive errors with no event in between.
- Error messages from the API (e.g. the allowlist message) are shown to the user as they are.
