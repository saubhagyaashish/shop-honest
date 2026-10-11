# 0013. A general navigator for stores we didn't build, with stricter rules there

**Status:** Accepted · 2026-10-11

## Context
Judges will ask whether Shop Honest works beyond our own demo stores. Real stores differ in every way that matters to an automated shopper:
- prices written as "Rs. 500";
- product names in an `<h2>`;
- "Add to cart" built from plain `<div>`s;
- a checkout link without an `href`;
- cookie banners;
- bot protection;
- carts that show an error to automated browsers.

A wrong accusation against a real company is also far more costly than a miss.

## Decision
- **A general navigator** (`app/journeys/generic.py`) walks any allowlisted store: product (two looks), variant, cart, checkout, payment. It uses the same capture labels as the scripted demo journey, so every check and the model review apply unchanged. Controls are found by their wording; when that fails, Gemini picks from the page's numbered controls.
- **Hard rules in code for every click:** never pay, buy now, confirm an order, sign in, register, subscribe, or accept terms or cookies (popups are closed or declined); never type anything. The one exception is the checkout-entry control on the cart page.
- **Honest stops:** a sign-in wall, a CAPTCHA or "verify you are human" page, or an error page instead of content ends the walk with `step.blocked` and a partial report. We never try to get around bot protection.
- **Stricter verdicts on third-party sites.** Measured findings that depend on reading a page's layout go to human review instead of being confirmed: sneaked cart items, pre-ticked options and late fees. Reports on third-party sites also open with a note that they are automated observations from a logged-out session, not a legal finding.
- **Ad networks are blocked** for every audit. Full-page interstitial ads would otherwise hijack the journey; first-party "sponsored" content still loads.
- **The allowlist** gains `automationexercise.com` (a store built for automation practice) and `flipkart.com` (a real retailer, best effort).

## Consequences
- AutomationExercise: product → cart → checkout, where it stops at the login wall, with nothing falsely flagged.
- Flipkart (from a home connection): product → add to cart → the cart page shows an error to automated browsers, and the audit reports that rather than inventing a result.
- `409 no_navigator` is no longer returned for allowlisted sites.
- Coverage on real stores is usually partial, and the report says so in its coverage strip.
