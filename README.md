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

## Run it

```sh
cd web
npm install
npx playwright install chromium   # once, for the capture script
npm run dev                       # http://localhost:5173
```

| Command | What it does |
|---|---|
| `npm run capture` | Walks both stores in Chromium and refreshes screenshots and bounding boxes for the mock audits |
| `npm test` | Unit tests (trust score; mock audits match the answer key) |
| `npm run typecheck` / `npm run lint` / `npm run build` | Checks and production build |
