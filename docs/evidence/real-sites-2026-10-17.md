# Real stores, logged out · 15–17 Oct 2026

21 real websites, **82 audits** in all: 26 on the deployed service and 56 locally with `scripts/real_sites.py`. Each audit
used a fresh browser that is never signed in, never gets around bot protection and never pays. The table shows each
site's latest run: the agent improved over these three days, and a later run supersedes an earlier one of the same site.

These are automated observations of a logged-out session, not findings of a violation. Anything that rests on a page
layout we didn't build goes to human review.

**Sites are not named here.** The raw reports (address, screenshots, what the agent read on each screen and every
model call) are kept privately: `backend/var/real-sites/` on the machine that ran them (not committed), and the
deployed service's audit log. They can be shown on request.

## What was found

**One store with a confirmed dark pattern** (Site 1, a direct-to-consumer fashion brand in India). The agent added one
T-shirt to the cart. The cart then held two lines:

| Finding | Status | How it was found |
|---|---|---|
| **Basket sneaking**: a paid 12-month membership (₹199) was in the cart next to the T-shirt (₹999). The shopper never chose it | Sent to human review | Measured: two priced cart lines after adding one item. Measured checks on sites we didn't build always go to a person |
| **Confirm shaming**: a popup over the cart said the store had put the membership in the cart. Its decline button was worded so that saying no meant not wanting to save money | **Confirmed**, confidence 0.95 | The Pattern Analyst (Gemini) cited the button; the Adjudicator checked the claim against a crop of the screenshot |

**Three other sites had items sent to human review, none confirmed:** a ₹12 charge first shown in the cart, not on the
product page; unsourced "N people bought this" claims; a claim about an "added to cart" popup.

**Every other site the agent could check showed nothing to report.** Sites that blocked the agent are listed as not
checked: none was called clean.

## Every site, latest run

| # | Kind of store | Latest run | How far the agent got | What it reported |
|---|---|---|---|---|
| 1 | Fashion, direct-to-consumer (India) | 17 Oct · Gemini | Product → size → cart → checkout asked to sign in | Membership put in the cart (review); shaming decline button (**confirmed**) |
| 2 | Online pharmacy (India) | 17 Oct · Gemini | Product → cart → checkout asked to sign in | ₹12 charge first shown in the cart (review); unsourced "people bought recently" (review) |
| 3 | Fashion, direct-to-consumer (India) | 17 Oct · Gemini | Product → size → cart (a drawer) → checkout's mobile-number login | Unsourced "people bought this" (review) |
| 4 | Fashion, direct-to-consumer (India) | 17 Oct · Gemini | Product → size → cart → checkout asked to sign in | Nothing |
| 5 | Watches and apparel, direct-to-consumer (India) | 17 Oct · Gemini | Product → cart (a panel) → checkout asked to sign in | Nothing |
| 6 | Marketplace (India) | 15 Oct · local Gemma | Product → cart → checkout asked to sign in | A claim about the "added to cart" popup (review) |
| 7 | Practice store (a site made for testing) | 16 Oct · Gemini, deployed | Product → cart → checkout asked to sign in | Nothing |
| 8 | Small independent web store | 17 Oct · measured checks only | Product → cart; no way to checkout found | Nothing |
| 9 | Posters, direct-to-consumer (India) | 17 Oct · measured checks only | Product; "Add to cart" opens a build-your-own picker, so no cart | Nothing to check past the product |
| 10 | Marketplace (India) | 16 Oct · local Gemma | Product; the cart served an error page | Not checked past the product |
| 11 | Quick commerce (India) | 16 Oct · local Gemma | Product out of stock: nothing to add | Not checked past the product |
| 12 | Business-to-business marketplace | 16 Oct · Gemini, deployed | Product; sells by enquiry, no cart | Not checked past the product |
| 13 | Business-to-business marketplace (India) | 16 Oct · Gemini, deployed | Product; sells by enquiry, no cart | Not checked past the product |
| 14 | Classifieds | 16 Oct · Gemini, deployed | Product; no cart | Not checked past the product |
| 15 | Marketplace (US) | 15 Oct · local Gemma | Bot protection | Not checked |
| 16 | Home improvement (US) | 16 Oct · Gemini, deployed | Bot protection | Not checked |
| 17 | Marketplace (India) | 16 Oct · Gemini, deployed | Bot protection | Not checked |
| 18 | Home improvement (US) | 16 Oct · Gemini, deployed | An error page instead of the product | Not checked |
| 19 | Food delivery (India) | 16 Oct · Gemini, deployed | An empty page | Not checked |
| 20 | Quick commerce (India) | 16 Oct · local Gemma | An empty page | Not checked |
| 21 | Fashion marketplace (India) | 16 Oct · local Gemma | The site refused the connection | Not checked |

**In all:**
- **8 reached the cart.** Seven stopped where checkout asked them to sign in; one had no way to checkout.
- **6 got no further than the product page:** a build-your-own product, an error page, out of stock, or a site that sells by enquiry.
- **7 blocked the agent** with bot protection, empty or error pages, or a refused connection.

## Earlier runs

- **Two sites went further before.** On 12 and 16 Oct, sites 10 and 11 reached checkout. Their latest runs met an error page and an out-of-stock product.
- **Five sites stopped too early on 16 Oct** (1, 3, 4, 5 and 9). The navigator didn't yet recognise popups, size pickers or cart drawers built from plain page elements. Commit `3ee6317` fixed that (17 Oct), and each of those five was audited again; the table shows the new runs.
- **One early finding is not counted.** On 15 Oct, before checks resting on a third-party page's layout went to human review, site 6 had a never-changing "Only 1 left" marked as confirmed. Under the current rules that check goes to a person, and three later runs of the same page confirmed nothing.

Reproduce: `cd backend && uv run python -m scripts.real_sites URL … --provider gemini`. Every screenshot, what the agent
read on each screen and every model call are written to `backend/var/real-sites/<run>/`.
