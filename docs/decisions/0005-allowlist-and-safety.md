# 0005. Allowlist + SSRF guard; stop at sign-in walls

**Status:** Accepted · 2026-10-10 · Amended 2026-10-15: any public site can be audited

## Context
A user-supplied URL makes our cloud browser visit it. Without controls that enables server-side request forgery (reaching internal services or the metadata server), turns us into a free crawler, and could run up costs. Many stores also put checkout behind a sign-in.

## Decision
- **Allowlist:** the deployed backend audits only the demo stores and approved domains (`ALLOWED_HOSTS`).
- **URL guard** on every request *and* every navigation inside Playwright: only http/https; DNS is resolved and private, loopback, link-local and metadata ranges are rejected; redirects are re-checked.
- **Behaviour on the target site:** never pay, never create accounts, never solve CAPTCHAs or evade bot protection. At a sign-in wall the agent emits `step.blocked`, and the report shows a **partial audit** ("3 of 5 steps · stopped at Checkout: sign-in required").
- Platform owners who want full coverage provide a test account (stored in Secret Manager), which is the intended production model.

## Amendment (2026-10-15): any public site
`ALLOWED_HOSTS` is now `*`, so any public site can be audited, in development and in production. The other protections are unchanged:
- **The URL guard** still blocks private, loopback, link-local and metadata addresses on every request, navigation and redirect. A private address is reachable only for a host listed by name with `ALLOW_PRIVATE_TARGETS` on, such as localhost in development, and never through `*`.
- **The click guard** is unchanged: never pay, sign in, type or get around bot protection.
- **The site-wide daily cap** on live audits still bounds cost.

A deployment can still go back to a list of named hosts.

## Consequences
- Safe to expose publicly; abuse and cost are bounded.
- ~~Arbitrary URLs aren't supported in the public deployment.~~ Since the amendment they are; the daily cap and the URL guard bound the risk.
- Partial audits are honest instead of silently incomplete.
