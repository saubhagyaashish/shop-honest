"""Rule-based checks: measured, evidence-backed findings (Phase 2).

Each check compares what the Navigator captured (Capture.signals, from
signals.js) and returns findings with screenshot evidence. They cover the
patterns that can be *measured*; Gemini adds the ones that need judgement
(shaming wording, lopsided buttons, unverifiable claims) in Phase 3.
"""

import re
from typing import Any

from app.agents.findings import Evidence, Finding
from app.agents.findings import frame as _frame
from app.agents.findings import make_finding as _finding
from app.agents.findings import money as _money
from app.agents.findings import union as _union
from app.knowledge import Knowledge

__all__ = ["ALL_CHECKS", "Evidence", "Finding", "price_facts"]


def restarting_timer(ev: Evidence, knowledge: Knowledge) -> list[Finding]:
    """A countdown that reads *later* after a reload can't be a real deadline."""
    looks = ev.get("product-first", "product-reload")
    if len(looks) < 2:
        return []
    first, second = looks
    out = []
    for before, after in zip(first.signals.get("timers", []), second.signals.get("timers", []), strict=False):
        if after["seconds"] <= before["seconds"]:
            continue
        b_text, a_text = _clock(before["text"]), _clock(after["text"])
        out.append(
            _finding(
                knowledge,
                id="f-restarting-timer",
                pattern_id="false_urgency",
                title="Countdown timer restarts on every page load",
                explanation=(
                    f"The countdown read {b_text} on the first look. Straight after a reload it read {a_text}. "
                    "A real deadline cannot move later, so this timer restarts per visit and the urgency it creates is false."
                ),
                confidence=0.97,
                capture=first,
                frames=[
                    _frame(first, before["bbox"], "First look"),
                    _frame(second, after["bbox"], "Second look, straight after reload"),
                ],
                observations=[
                    f"Before reload: {b_text}",
                    f"After reload: {a_text}",
                    "The deadline moved later, which a real end time cannot do",
                ],
                detected_by="pattern_analyst",
                element_text=before["text"],
            )
        )
        break
    return out


def frozen_stock(ev: Evidence, knowledge: Knowledge) -> list[Finding]:
    """The same 'only N left' on every look and every variant."""
    looks = [c for c in ev.get("product-first", "product-reload", "variant") if c.signals.get("stock")]
    if len(looks) < 3:
        return []
    counts = {c.signals["stock"][0]["count"] for c in looks}
    if len(counts) != 1 or next(iter(counts)) > 10:
        return []
    claim = looks[0].signals["stock"][0]
    return [
        _finding(
            knowledge,
            id="f-frozen-stock",
            pattern_id="false_urgency",
            title=f'"Only {claim["count"]} left" never changes',
            explanation=(
                "The scarcity badge shows the same count on first load, after a reload and after switching to another variant. "
                "Different variants normally carry separate stock, so an identical count everywhere points to a fixed message, "
                "not live inventory."
            ),
            confidence=0.84,
            severity="medium",
            capture=looks[0],
            frames=[
                _frame(looks[0], claim["bbox"], "First look"),
                _frame(looks[-1], looks[-1].signals["stock"][0]["bbox"], "Another variant"),
            ],
            observations=[
                f'Read on {len(looks)} looks: "{claim["text"]}" every time',
                "Looks taken: first load, after a reload, after a variant change",
            ],
            detected_by="pattern_analyst",
            element_text=claim["text"],
        )
    ]


def inflated_mrp(ev: Evidence, knowledge: Knowledge) -> list[Finding]:
    """The struck-through MRP was never a real selling price (Price Historian)."""
    (capture,) = ev.get("product-first") or (None,)
    block = capture.signals.get("priceBlock") if capture else None
    history = knowledge.history_for(capture.url) if capture else None
    if not block or not block.get("mrp") or not history:
        return []
    facts = price_facts(block["price"], block["mrp"], history)
    if facts["ever_sold_at_mrp"] or not facts["mrp_raised_recently"]:
        return []
    price, mrp, prior = _money(block["price"]), _money(block["mrp"]), _money(facts["prior_mrp"])
    sold = f"{_money(facts['min_sold'])}–{_money(facts['max_sold'])}"
    weeks, days, off, real = facts["weeks"], facts["mrp_changed_days_ago"], facts["advertised_discount"], facts["real_discount"]
    return [
        _finding(
            knowledge,
            id="f-inflated-mrp",
            pattern_id="misleading_price",
            title=f"{off}% discount is calculated off an MRP raised {days} days ago",
            explanation=(
                f"The page advertises {price} as {off}% off an MRP of {mrp}. "
                f"Over the last {weeks} weeks the product sold at {sold} against an MRP of {prior}; the MRP was raised to {mrp} "
                f"{days} days ago and the product has never sold at that price. "
                f"Against the genuine reference price, the discount is {real}%."
            ),
            confidence=0.93,
            capture=capture,
            frames=[_frame(capture, block["bbox"], "Advertised price block")],
            observations=[
                f"Advertised: {price}, MRP {mrp} ({off}% off)",
                f"Last {weeks} weeks: sold at {sold}, never at {mrp}",
                f"MRP changed {prior} → {mrp}, {days} days ago",
                f"Discount against the prior MRP: {real}%",
            ],
            detected_by="price_historian",
            element_text=block["text"],
        )
    ]


def sneaked_items(ev: Evidence, knowledge: Knowledge) -> list[Finding]:
    """The cart holds lines the shopper never added."""
    (cart,) = ev.get("cart") or (None,)
    if not cart or not ev.added_items:
        return []
    lines = cart.signals.get("cartLines", [])
    extra = [line for line in lines if not any(_same_item(line["name"], item) for item in ev.added_items)]
    if not extra:
        return []
    line = extra[0]
    total = (cart.signals.get("summary") or {}).get("total") or {}
    observations = [
        f"Added by the agent: {len(ev.added_items)} line ({ev.added_items[0]})",
        f"Found in cart: {len(lines)} lines",
        *[f"Extra line: {item['name']}, {_money(item['amount'])}" for item in extra if item.get("amount") is not None],
    ]
    if total.get("amount"):
        observations.append(f"Cart total {_money(total['amount'])}")
    return [
        _finding(
            knowledge,
            id="f-sneaked-item",
            pattern_id="basket_sneaking",
            title=f"{line['name']} added to the cart without consent",
            explanation=(
                f"The agent added exactly {len(ev.added_items)} item to the cart. The cart then held {len(lines)} lines: "
                f'"{line["name"]}"'
                + (f" ({_money(line['amount'])})" if line.get("amount") is not None else "")
                + " had been added "
                "automatically. The shopper never ticked, chose or was asked about it."
            ),
            confidence=0.96,
            capture=cart,
            frames=[_frame(cart, line["bbox"], "Cart after adding one item")],
            observations=observations,
            detected_by="evidence",
            element_text=line["text"],
        )
    ]


def pre_ticked_subscription(ev: Evidence, knowledge: Knowledge) -> list[Finding]:
    """A paid, recurring option ticked before the shopper did anything."""
    (checkout,) = ev.get("checkout") or (None,)
    if not checkout:
        return []
    for box in checkout.signals.get("checkboxes", []):
        if not (box["checked"] and box["recurring"] and box.get("amount")):
            continue
        name = re.split(r"[:–-]", box["label"], maxsplit=1)[0].replace("Add ", "").strip()
        return [
            _finding(
                knowledge,
                id="f-pre-ticked-subscription",
                pattern_id="subscription_trap",
                title="Paid membership ticked by default",
                explanation=(
                    f"Checkout enrols the shopper in {name} at {_money(box['amount'])} a month unless they spot and untick it. "
                    "Consent to a recurring charge has to be given, not assumed."
                ),
                confidence=0.94,
                capture=checkout,
                frames=[_frame(checkout, box["bbox"], "Membership option on arrival at checkout")],
                observations=[
                    "Checkbox state on arrival: ticked",
                    f"Recurring charge: {_money(box['amount'])} a month",
                    f'Label: "{box["label"][:120]}"',
                ],
                detected_by="pattern_analyst",
                element_text=box["label"],
            )
        ]
    return []


FEE = re.compile(r"\b(fee|charge|surcharge|handling|convenience)\b", re.I)


def late_fees(ev: Evidence, knowledge: Knowledge) -> list[Finding]:
    """Fees that first appear at payment and weren't disclosed on the product page."""
    product, payment = (ev.get("product-first") or [None])[0], (ev.get("payment") or [None])[0]
    if not product or not payment:
        return []
    disclosed = {d["label"] for d in product.signals.get("feeDisclosures", [])}
    seen_before = {
        row["label"]
        for label in ("cart", "checkout")
        for c in ev.get(label)
        for row in (c.signals.get("summary") or {}).get("rows", [])
    }
    rows = (payment.signals.get("summary") or {}).get("rows", [])
    late = [
        row
        for row in rows
        if row["amount"] > 0
        and FEE.search(row["label"])
        and row["label"] not in seen_before
        and not any(d in row["label"].lower() for d in disclosed)
    ]
    if not late:
        return []
    total = sum(r["amount"] for r in late)
    price = (product.signals.get("priceBlock") or {}).get("price")
    payment_total = ((payment.signals.get("summary") or {}).get("total") or {}).get("amount")
    fee_names = ", ".join(f"{r['label']} ({_money(r['amount'])})" for r in late)
    union = _union([r["bbox"] for r in late])
    return [
        _finding(
            knowledge,
            id="f-late-fees",
            pattern_id="drip_pricing",
            title=f"{_money(total)} in fees appears only at the payment step",
            explanation=(
                (f"The product page showed {_money(price)}. " if price else "")
                + f"{fee_names} were first shown on the payment step, after the shopper had invested in the journey. "
                "None was disclosed on the product, cart or checkout pages."
            ),
            confidence=0.95,
            capture=payment,
            frames=[
                _frame(product, (product.signals.get("priceBlock") or {}).get("bbox"), "Price as first shown"),
                _frame(payment, union, "Price breakdown at payment"),
            ],
            observations=[
                *([f"Product page: {_money(price)}"] if price else []),
                *([f"Payment total: {_money(payment_total)}"] if payment_total else []),
                "New at payment: " + ", ".join(f"{r['label'].lower()} {_money(r['amount'])}" for r in late),
            ],
            detected_by="evidence",
        )
    ]


ALL_CHECKS = [restarting_timer, frozen_stock, inflated_mrp, sneaked_items, pre_ticked_subscription, late_fees]


def price_facts(price: float, mrp: float, history: dict[str, Any]) -> dict[str, Any]:
    """What the price history says about an advertised MRP."""
    points = history["points"]
    sold = [p["price"] for p in points]
    current_mrp_since = next((p for p in points if p["mrp"] == mrp), None)
    prior_mrp = points[0]["mrp"]
    return {
        "weeks": len(points) - 1,
        "min_sold": min(sold),
        "max_sold": max(sold),
        "ever_sold_at_mrp": mrp in sold,
        "prior_mrp": prior_mrp,
        "mrp_changed_days_ago": current_mrp_since["daysAgo"] if current_mrp_since else None,
        "mrp_raised_recently": bool(current_mrp_since) and current_mrp_since["daysAgo"] <= 30 and mrp > prior_mrp,
        "advertised_discount": int((1 - price / mrp) * 100),
        "real_discount": int((1 - price / prior_mrp) * 100),
    }


def _clock(text: str) -> str:
    match = re.search(r"\b\d{1,2}:\d{2}(?::\d{2})?\b", text)
    return match.group(0) if match else text


def _same_item(line_name: str, added: str) -> bool:
    a, b = line_name.lower(), added.lower()
    return a in b or b in a
