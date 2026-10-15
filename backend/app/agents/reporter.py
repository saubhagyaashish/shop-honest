"""Reporter: turns what the Navigator saw and the checks found into an AuditReport.

Deterministic in Phase 2 (summary, trust score, price drift, exposure).
Phase 4 adds Gemini-written summaries on top of the same structure.
"""

import re
from typing import Any

from app.agents.checks import Evidence
from app.contract.models import JOURNEY_STEPS
from app.knowledge import Knowledge
from app.prices.facts import price_facts

STEP_LABEL = {
    "product": "Product page",
    "variant": "Variant selection",
    "cart": "Cart",
    "checkout": "Checkout",
    "payment": "Payment",
}
SEVERITY_PENALTY = {"high": 12, "medium": 6, "low": 3}

# Summary rows that describe the goods themselves, not extra charges.
ITEM_ROWS = re.compile(r"^(price|mrp|subtotal|item|items|discount|coupon|savings?)\b|\bitems?\)", re.I)
SUBSCRIPTION_ROWS = re.compile(r"\b(member(ship)?|plus|subscription|prime|club|pass)\b", re.I)
UPGRADE_ROWS = re.compile(r"\b(express|priority|upgrade|faster)\b", re.I)


def trust_score(findings: list[dict[str, Any]]) -> int:
    """Same formula as web/src/auditor/score.ts: confirmed findings cost points by severity."""
    penalty = sum(SEVERITY_PENALTY[f["severity"]] for f in findings if f["status"] == "confirmed")
    return max(0, 100 - penalty)


def _money(amount: float) -> str:
    return f"₹{amount:,.0f}"


def inr(amount: float) -> dict[str, Any]:
    return {"amount": amount, "currency": "INR"}


def price_drift(ev: Evidence, findings: list[dict[str, Any]], knowledge: Knowledge) -> dict[str, Any] | None:
    """What the product page led the shopper to expect, versus what later steps added."""
    product = ev.captures.get("product-first")
    block = (product.signals.get("priceBlock") if product else None) or {}
    if not block.get("price"):
        return None
    ids = {f["id"] for f in findings}
    disclosed = product.signals.get("feeDisclosures", [])
    advertised = block["price"] + sum(d["amount"] for d in disclosed)

    lines: list[dict[str, Any]] = []
    cart = ev.captures.get("cart")
    if cart and ev.added_items:
        for line in cart.signals.get("cartLines", []):
            name = line["name"].lower()
            if line.get("amount") and not any(name in item.lower() or item.lower() in name for item in ev.added_items):
                lines.append(
                    _line(
                        line["name"],
                        line["amount"],
                        "sneaked_item",
                        "cart",
                        "f-sneaked-item" if "f-sneaked-item" in ids else None,
                    )
                )

    seen: set[str] = set()
    recurring = {
        box["amount"]
        for c in ev.get("checkout")
        for box in c.signals.get("checkboxes", [])
        if box["recurring"] and box.get("amount")
    }
    payable = advertised
    for label in ("cart", "checkout", "payment"):
        capture = ev.captures.get(label)
        summary = (capture.signals.get("summary") if capture else None) or {}
        if summary.get("total"):
            payable = summary["total"]["amount"]
        for row in summary.get("rows", []):
            if row["label"] in seen:
                continue
            seen.add(row["label"])
            if row["amount"] <= 0 or ITEM_ROWS.search(row["label"]) or any(d["label"] in row["label"].lower() for d in disclosed):
                continue
            if SUBSCRIPTION_ROWS.search(row["label"]):
                kind, finding = "subscription", "f-pre-ticked-subscription"
            elif UPGRADE_ROWS.search(row["label"]):
                kind, finding = "upgrade", None
            else:
                kind, finding = "fee", "f-late-fees" if label == "payment" else None
            entry = _line(row["label"], row["amount"], kind, label, finding if finding in ids else None)
            if kind == "subscription" and row["amount"] in recurring:
                entry["recurring"] = "monthly"
            lines.append(entry)

    drift: dict[str, Any] = {"advertised": inr(advertised), "payable": inr(payable), "lines": lines}
    if block.get("mrp"):
        drift["claimedSaving"] = inr(block["mrp"] - block["price"])
        # The genuine saving needs real history; without it, say nothing rather than guess.
        if ev.price_history is not None:
            facts = price_facts(block["price"], block["mrp"], ev.price_history)
            if facts.enough_history:
                drift["genuineSaving"] = inr(max(0.0, facts.highest_sold - block["price"]))
        if "f-inflated-mrp" in ids:
            drift["savingFindingId"] = "f-inflated-mrp"
    return drift


def _line(label: str, amount: float, kind: str, first_seen: str, finding_id: str | None) -> dict[str, Any]:
    line: dict[str, Any] = {"label": label, "amount": inr(amount), "kind": kind, "firstSeen": first_seen}
    if finding_id:
        line["findingId"] = finding_id
    return line


def exposure(findings: list[dict[str, Any]], drift: dict[str, Any], knowledge: Knowledge) -> dict[str, Any]:
    """Port of buildExposure (web/src/auditor/mock/legal.ts): the rule each finding breaks, per region."""
    legal = knowledge.legal
    regions = []
    for j in legal["jurisdictions"]:
        region = {k: v for k, v in j.items() if k not in ("rules", "general")}
        region["citations"] = {f["id"]: j["rules"].get(f["patternId"], j["general"]) for f in findings}
        regions.append(region)
    return {"priceDrift": drift, "jurisdictions": regions, "strictest": legal["strictest"], "disclaimer": legal["disclaimer"]}


def summary(findings: list[dict[str, Any]], steps: list[dict[str, Any]], drift: dict[str, Any] | None) -> str:
    confirmed = [f for f in findings if f["status"] == "confirmed"]
    review = len(findings) - len(confirmed)
    audited = [s for s in steps if s.get("status", "audited") == "audited"]
    blocked = next((s for s in steps if s.get("status") == "blocked"), None)

    not_audited = ""
    if blocked:
        rest = [STEP_LABEL[s] for s in JOURNEY_STEPS[JOURNEY_STEPS.index(blocked["step"]) :]]
        reason = (blocked.get("blockedReason") or "blocked").lower()
        names = rest[0] if len(rest) == 1 else f"{', '.join(rest[:-1])} and {rest[-1]}"
        not_audited = f" {names} could not be audited: {reason}."

    if blocked and not audited:
        return f"The agent couldn't audit any step of this journey.{not_audited}"
    if not confirmed:
        where = f"the {len(audited)} steps the agent could reach" if blocked else f"all {len(JOURNEY_STEPS)} steps"
        if review:
            claims = f"{review} claim{'s' if review != 1 else ''}"
            return f"No violations confirmed on {where}; {claims} sent for human review." + not_audited
        base = (
            f"No deceptive patterns found on {where}: "
            "urgency, pricing, cart contents, consent and fees matched what the shopper was shown."
        )
        return base + not_audited

    hit = len({f["step"] for f in confirmed})
    of = f"the {len(audited)} reachable" if blocked else str(len(JOURNEY_STEPS))
    noun = "violation" if len(confirmed) == 1 else "violations"
    text = f"{len(confirmed)} {noun} confirmed across {hit} of {of} journey steps"
    text += f", and {review} claim{'s' if review != 1 else ''} sent for human review." if review else "."
    if drift and drift["payable"]["amount"] > drift["advertised"]["amount"]:
        a, p = drift["advertised"]["amount"], drift["payable"]["amount"]
        text += f" The amount payable rose from {_money(a)} on the product page to {_money(p)} (+{round((p / a - 1) * 100)}%)."
    return text + not_audited


def build_report(
    *,
    audit_id: str,
    target_url: str,
    started_at: str,
    completed_at: str,
    steps: list[dict[str, Any]],
    findings: list[dict[str, Any]],
    ev: Evidence,
    knowledge: Knowledge,
    reviewed_steps: set[str] | None = None,
) -> dict[str, Any]:
    """`reviewed_steps`: steps whose screens a model judged (None: not known, e.g. a report rebuilt from a recording)."""
    drift = price_drift(ev, findings, knowledge)
    report: dict[str, Any] = {
        "auditId": audit_id,
        "targetUrl": target_url,
        "startedAt": started_at,
        "completedAt": completed_at,
        "trustScore": trust_score(findings),
        "steps": steps,
        "findings": findings,
        "summary": summary(findings, steps, drift),
    }
    if drift:
        report["exposure"] = exposure(findings, drift, knowledge)
    if reviewed_steps is not None:
        report["reviewedSteps"] = [s for s in JOURNEY_STEPS if s in reviewed_steps]
    return report
