# 0015. "Fix it": a fix per finding, the numbers it would change, and proof on a copy of the store

**Status:** Accepted · 2026-10-16

## Context
Detecting dark patterns on a page isn't new: the government's Jagriti apps do it, and so did a browser extension from the 2023 hackathon. A platform's compliance team needs more than a finding. It needs to know what to change, what each change is worth, and proof that the change worked. Our report gave one sentence of advice per finding and stopped there.

A first version ran the fix automatically inside every demo-store audit: the Fixer wrote fixes, applied them to a copy and re-audited it. That doubled every audit's time. It also showed fixing as something that happens to a store, rather than something its team decides on, finding by finding.

## Decision
**"Fix it" is a separate step, opened from the report.**
- **The Fixer proposes** (`POST /api/audits/{id}/fixes`, `agents/fixer.py`, prompt `agents/prompts/fixer.md`). It's one model call, for a finished audit, replay or live. Each finding gets a kind:
  - `setting`: a change to the store's own settings fixes it;
  - `code`: only the site's developers can fix it, and the fix is described in words;
  - `review`: the finding awaits a human's review, so whether to fix it is the viewer's call.
- **Which settings exist.** They're exactly what the demo stores' admin panel offers: behaviours, the upfront fee and each product's M.R.P. (`web/src/store/settings.ts`, exported to `shared/store_settings.json`).
  - Each setting lists the dark patterns it can fix. A change that uses a setting for another kind of finding is dropped, as is one that names an unknown finding or setting or has a value of the wrong type. A local model was seen "fixing" an inflated M.R.P. by turning off the frozen stock counter.
  - The prompt asks the Fixer to fix the deception rather than hide information: fees revealed at payment move to the product page, and an inflated M.R.P. becomes one the product really sold at.
- **Proposals are kept per instance**, by page and findings, so reopening the panel or replaying the same store doesn't ask the model again.
- **Projected numbers.** As the viewer switches fixes on, the panel recalculates the trust score, the hidden extras, the fine ceiling and the CCPA patterns found, from the audit's own evidence (`web/src/auditor/projection.ts`). They're labelled "projected".
  - The fine ceiling is the statutory maximum per contravention (India: ₹10 lakh the first time, CPA s 21; `perContraventionMax` in the legal data) times the confirmed findings left. It's labelled as a maximum, never a predicted fine.
- **Verified by the same audit.** "Verify these fixes" is `POST /api/audits` with `compareTo` and `applyFixes`. The server checks the fixes again against that audit and the store's settings. Then:
  - a live audit runs, with the auditor's browser writing the patch to sessionStorage before the page loads (`page.add_init_script`), and the store applying exactly that patch, in that browser only;
  - its prices are looked up but never recorded (`ReadOnlyPrices`), so BigQuery keeps only real observations;
  - its report gets `appliedFixes` and a `comparison` with the earlier audit.
- **How a later finding counts as the same one** (`fixer.same_finding`): a measured finding by its check's id; a model's finding by the screen it was seen on and its pattern. So fixing the frozen stock counter doesn't hide that the timer still restarts, though both are false urgency on the product page.
- **Real sites are never changed.** Every fix there is `code` or `review`. The viewer can switch fixes on as planned, to see what they'd change, copy the fix list for the developers, and use "Re-audit this page" (`compareTo` alone) once they've shipped.

## Consequences
- Audits are back to about 30 s. Fixing costs one model call when the panel first opens, and a live audit only if the viewer verifies.
- The projection is a calculation, and the verified numbers can disagree with it: a fix that doesn't work shows "Still there". The tests include a fix applied to one finding only, and a fix that's dropped as invalid.
- Replays work too: their proposals come from the Fixer, and verifying runs live, within the site's daily live-audit cap.
