# Judging runbook

How to get the live site ready for judges, run a 3–5 minute demo, and recover if something goes wrong.

Site: <https://shop-honest-ai.web.app> · Project `shop-honest-72fd8` · Region `asia-south1`

## The day before
Run these from the repo root, logged in with `gcloud auth login` and `gcloud auth application-default login`:

```sh
(cd backend && uv run python -m scripts.seed_price_history)   # refresh the demo catalog's 26-week price history
deploy/judging.sh on                                          # warm instance (no cold starts), uptime probe
uv run --project backend python deploy/preflight.py           # about 3 minutes, 2 live audits
```

The pre-flight should end with `6/6 checks passed`. If you redeploy after this, run `deploy/judging.sh on` again: a deploy resets to normal mode.

## The demo (3–5 minutes)
1. **The problem (30 s).** Indian shoppers meet countdowns that restart, "only 2 left" that never moves, insurance sneaked into the cart and fees that appear at payment. Since 2023 the CCPA lists 13 such dark patterns as unfair trade practices. Nobody checks a whole journey the way a shopper meets it.
2. **Scan it on Store A (45 s).** It replays a recorded real run. Press **Skip to report**, then show:
   - the 9 findings with screenshots;
   - "they said you save ₹2,500, you really save ₹100" (the Price Historian, BigQuery);
   - the bill growing from ₹1,499 to ₹1,894;
   - the legal section and the fixes;
   - the PDF.
3. **Run live on Store C (60–90 s).** A fresh browser and Gemini walk the store while you watch. Point out:
   - the narration;
   - the Adjudicator dropping or sending claims to review;
   - the stop at the sign-in wall. The report says what it couldn't reach instead of guessing.
4. **A real store (60 s).** Use the **AutomationExercise** chip under the URL box, then **Scan it**. The general navigator finds "Add to cart" on a site we didn't build, opens the cart and stops at the login wall. The report carries the "automated observations, not a legal finding" note. Optionally try the **Tata 1mg** chip: a real pharmacy, where the agent reaches the cart, presses its "Continue" and stops at the sign-in popup, with a ₹12 handling charge first shown in the cart sent for review.
5. **How it's built and how accurate it is (45 s):**
   - The README's diagram.
   - **9/9** on the rigged store and **0 false alarms** on the honest one.
   - **0.962 F1 zero-shot** on the public ec-darkpattern dataset (models trained on it get 0.960–0.975).
   - Every claim is grounded on measured page elements and double-checked.

## If something goes wrong
| Problem | What you see | What to do |
|---|---|---|
| The API is down or slow | The audit page says "The live audit service can't be reached right now", and the scan falls back to the built-in demo replay | Keep demoing on the replay: it's the same store and findings. Check `curl https://shop-honest-ai.web.app/api/health`. |
| Gemini is busy (429) | "Couldn't read the … page" in the narration | The measured findings still stand. Retry in a minute; the SDK retries and falls back to `gemini-3.1-flash-lite`. |
| The daily live limit is reached (100 a day, site-wide) | "Live audits are paused for today" | Use **Scan it** (unlimited). Or raise the cap for the day: `gcloud run services update shop-honest-api --region asia-south1 --update-env-vars LIVE_PER_DAY=200`. |
| The real store blocks us | The report is blocked at a step with "bot protection" or "the site showed an error" | That's the honest path: show it. We never get around bot protection. |
| AutomationExercise is down | The audit fails to open the page | Skip step 4, or show Tata 1mg. |
| Stuck on "SCANNING" | No events for a minute | The stream reconnects by itself within 60 s. Otherwise reload the page: audits resume from their event log. |

## Afterwards

```sh
deploy/judging.sh off      # scale back to zero; a warm instance costs money all day
```

Check spending in the console: Billing → Reports, project `shop-honest-72fd8`.
