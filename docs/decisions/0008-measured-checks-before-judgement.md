# 0008. Measured checks first, model judgement on top

**Status:** Accepted · 2026-10-11

## Context
Phase 2 gave the Navigator a real browser, but Gemini (the Pattern Analyst) arrives in Phase 3. We wanted live audits to produce real findings now, and we want findings a regulator can't argue with: "the timer read 09:51, then 09:59 after a reload" is stronger than "the model thinks this timer is fake".

## Decision
- Patterns that can be **measured** are found by deterministic checks over what the Navigator captured (`backend/app/agents/checks.py`): a countdown that is later after a reload, the same "only N left" on every look and variant, cart lines the agent never added, a paid recurring option ticked on arrival, fees first shown at payment and not disclosed upfront, and an MRP the price history says was never a real selling price.
- The page facts come from a **generic in-page extractor** (`backend/app/browser/signals.js`) that reads text patterns and roles, not our demo store's ids. Only the *journey* (where "add to cart" is) is site-specific.
- Patterns that need **judgement** (shaming wording, lopsided buttons, unverifiable claims) are left to the Pattern Analyst in Phase 3, which will also review the measured findings. The adjudicator's log line says so on every live run, so a partial result is never presented as complete.

## Consequences
- Live audits today: store A 6 of 9 planted patterns, store B no false alarms, store C 4 of the 6 before its sign-in wall (`uv run python -m evals.answer_key`).
- Measured findings carry exact numbers and before/after screenshots, and cost nothing to run.
- The checks are heuristics: a site that words its timer or fee rows differently can slip past `signals.js`. Phase 3's model pass is the backstop, and the eval tells us when a change regresses.
