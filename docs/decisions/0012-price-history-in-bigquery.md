# 0012. Price history lives in BigQuery, grows with every audit, and the MRP rule doesn't depend on recency

**Status:** Accepted · 2026-10-11

## Context
The inflated-MRP check needs to know what a product has actually sold at. Until now that came from a static file covering only the demo products, so it couldn't work on any other site, and nothing we observed was kept. The rule also required the MRP to have been raised in the last 30 days. Once history has real dates, the demo's "raised 7 days ago" ages by a day every day, and about three weeks after seeding, Store A's planted trick would stop being detected.

## Decision
- **One table:** `shop_honest.price_history` in BigQuery (Mumbai), one row per observation (`product_key, observed_at, price, mrp, currency, source, audit_id`), partitioned by day and clustered by product.
- **Two sources of rows:**
  - the demo catalog, seeded by `scripts/seed_price_history.py` (`source=catalog`, re-runnable);
  - **every live audit**, which records the price and MRP it saw (`source=audit`). History builds up for any product we audit.
- **One key per product:** the demo stores share one history wherever they're served (laptop, preview channel, live site). Other sites use host + path, without the query string.
- **The Price Historian step:** after the first product-page capture, the walk looks the product up once (the last 180 days, one point per day), narrates what it found, and puts it on the evidence. The check and the report's "genuine saving" read it from there.
- **The rule is the regulator's question, not a recency test.** A discount is misleading when the product **never sold at the advertised MRP across at least 8 weeks of history**, and the advertised discount is at least 10 points bigger than the discount against the highest price it really sold at.
  - A recent raise is quoted as supporting evidence when known.
  - The genuine saving is measured against the highest real selling price. With too little history, no claim about the saving is made at all.
- **The file stays as an offline source.** `PRICE_HISTORY_BACKEND=json` keeps the catalog file for local runs and tests; production uses `bigquery`.

## Consequences
- The demo can't age out of detection, and a long-standing fake MRP on a real site is caught once we have 8 weeks of observations.
- Store A's genuine saving is now ₹100 (against ₹1,599, its highest real price) instead of ₹500 (against an earlier MRP it also never sold at). That's stricter and more defensible.
- Real sites start with no history: their MRP claims aren't judged until enough audits (or a data source) have built it up. The audit says so instead of guessing.
- Cost stays within BigQuery's free tier: the table is tiny, each query bills the 10 MB minimum, and each audit adds one streamed row.
