# 0009. Model claims are grounded on measured elements and verified before they're reported

**Status:** Accepted · 2026-10-11

## Context
Phase 3 adds a model (the Pattern Analyst) for the patterns that need judgement: shaming wording, a design that steers the choice, popularity claims nobody can check. Models, small local ones especially, raise false alarms. On our honest Store B, Gemma 3 4B's first run confirmed a "subscription trap" on an unticked, cancel-anytime opt-in. A false alarm against a real business is worse than a miss.

## Decision
- **The model cites, it doesn't draw.** It sees the screenshot and a numbered list of elements extracted from the page, and cites refs (`e3`). The evidence box, the element text and the observations are built from measurement, never from model prose or model-guessed coordinates.
- **Measurement can veto.** Deterministic rules drop claims the measurements contradict before any model argues about them. Interface interference must cite two options whose sizes differ at least 3×, and each pattern must rest on the right kind of element (false urgency on a claim, not a "Place order" button). Patterns already measured (countdowns, stock, prices, cart contents, pre-ticked options, fees) are kept out of the model's list entirely.
- **A second opinion before anything is asserted.** The Adjudicator scores agreement from a crop of the evidence. Below 0.35 the claim is dropped; the lower of the two scores decides confirmed (≥ 0.75) or human review.
- **What a page can't settle goes to a person.** Claims marked unverifiable (for example "120+ bought today" with no source) go straight to the human review queue, without a verifier.
- **A model failure costs a screen, never the audit.** Timeouts, nonsense and budget exhaustion are logged in the audit trail; the measured findings still stand.

## Consequences
- With Gemma 3 4B over 3 runs: Store A 8/9, Store B no false alarms, Store C 5/6 before its wall, and the unverifiable claim in review each time. Every rejected claim shows up in the audit trail with its reason.
- The rules are deliberately few and generic (sizes, element kinds), not tuned to our demo store's wording. They can't catch every bad claim. The verifier and the human review queue are the remaining safeguards.
- One extra model call per verifiable claim. On Ollama an audit takes about 30–50 s; Gemini should be faster.
