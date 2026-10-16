# Real platforms, logged out · 16 Oct 2026

Six of the 26 e-commerce platforms that declared themselves free of dark patterns in November 2025, audited with
`scripts/real_sites.py` and the local model (Gemma 3 4B on Ollama), in a fresh browser that is never signed in and never
gets around bot protection. One product page each (earbuds where the site sells them).

These are automated observations of a logged-out session, not findings of a violation. Anything that rests on a page
layout we didn't build goes to human review.

| Platform | How far the agent got | What it reported |
|---|---|---|
| Zepto | Product page: blank | "The site showed an empty page (it may be blocking automated browsers)". Not checked |
| Blinkit | Product page | The product was out of stock, so there was nothing to add to the cart |
| Flipkart | Product page → cart | The cart showed a ₹10 platform fee the product page didn't show (sent for review). On later runs the cart served "Something went wrong! Please try again later", which is reported as an error page |
| Myntra | None | "The site refused the connection". Not checked |
| Meesho | None | Bot protection stopped the agent. Not checked |
| Tata 1mg | Product page → cart → its sign-in popup | A ₹12 handling charge first shown in the cart, not on the product page (sent for review); an unsourced "3,979 people bought recently" (sent for review) |

The first scout of the same six pages, before the navigator fixes in commit `6080bf2`, scored Zepto's blank page and
Meesho's block as "trust score 100" and claimed checkouts that never opened. Each of those cases is now a test built
from a copy of the page (`backend/tests/sites/`, `tests/test_navigator.py`).

Reproduce: `cd backend && uv run python -m scripts.real_sites URL … --provider ollama`. Every screenshot, what the agent
read on each screen and every model call are written to `backend/var/real-sites/<run>/`.
