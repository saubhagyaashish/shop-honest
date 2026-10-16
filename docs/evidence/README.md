# Evidence

The raw results behind every number in the README, with how to reproduce each.

| File | What it is | Reproduce |
|---|---|---|
| [`answer-key-2026-10-15.json`](answer-key-2026-10-15.json), [`answer-key-2026-10-16.json`](answer-key-2026-10-16.json) | Live audits of the three demo stores scored against the planted answer key (`shared/answer_key.json`): 3 runs per store in all, `gemini-3.6-flash`, agent graph on. Per run: hits, misses, false alarms, claims that went to review, seconds and tokens | `cd backend && uv run python -m evals.answer_key --provider gemini --runs 2` |
| [`dataset-2026-10-15.json`](dataset-2026-10-15.json) | The Pattern Analyst, zero-shot, on all 2,356 texts of the public ec-darkpattern dataset: accuracy, precision, recall, F1, confusion matrix, recall per category (the dataset's texts are left out; it's downloaded at evaluation time) | `cd backend && uv run python -m evals.dataset` |
| [`real-sites-2026-10-16.md`](real-sites-2026-10-16.md) | Six of the 26 self-declared platforms, audited logged out | `cd backend && uv run python -m scripts.real_sites URL …` |

Fix it, verified: `backend/tests/test_live.py::test_fixes_are_proposed_then_verified_on_a_copy_of_the_store` runs the
whole loop on Store A (audit → propose → verify on a fixed copy → 9 of 9 gone, ₹1,894 → ₹1,596) in a real browser.
The same loop on Gemini, 16 Oct 2026: 9 of 9 fixes verified, trust score 16 → 100, ₹1,894 → ₹1,596.
