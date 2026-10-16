"""A rule-based stand-in for the Pattern Analyst and Adjudicator, for tests (never for accuracy)."""

import io
import json
import re
from collections.abc import Callable

from PIL import Image

from app.models import ModelSet
from app.models.scripted import ScriptedLlm

LINE = re.compile(r'^(e\d+) · ([a-z ]+?)(?: \(.*?\))?: "(.*?)"', re.M)
CITED = re.compile(r"^Cited elements: (.+)$", re.M)
FINDING = re.compile(r"^- (\S+) · (\w+) at the (\w+) step", re.M)

# What a good Fixer changes for each of Store A's findings (by finding id, or the judged pattern of a model finding).
STORE_A_FIXES: dict[str, list[tuple[str, str]]] = {
    "f-restarting-timer": [("behaviour.resettingTimer", "false")],
    "f-frozen-stock": [("behaviour.frozenStock", "false")],
    "f-inflated-mrp": [("mrp.sonicbuds-pro", "1599")],
    "f-sneaked-item": [("behaviour.autoAddProtection", "false")],
    "f-pre-ticked-subscription": [("behaviour.membershipTickedByDefault", "false")],
    "f-late-fees": [("behaviour.feesAtPaymentOnly", "false"), ("upfrontPlatformFee", "97")],
    "confirm_shaming": [("behaviour.guiltDeclinePopup", "false")],
    "interface_interference": [("behaviour.lopsidedDeliveryChoice", "false")],
    "false_urgency": [("behaviour.buyersClaim", "false")],
}


def demo_store_fixer(user_text: str, skip: frozenset[str] = frozenset()) -> list[dict]:
    """Fixes for every finding listed, except those whose id or pattern is in skip."""
    out = []
    for finding_id, pattern, _ in FINDING.findall(user_text):
        key = finding_id if finding_id.startswith("f-") else pattern
        if finding_id in skip or key in skip:
            continue
        for setting, value in STORE_A_FIXES.get(key, []):
            out.append({"findingId": finding_id, "setting": setting, "value": value, "why": f"Fixes {finding_id}."})
    return out


def elements_in(user_text: str) -> list[tuple[str, str, str]]:
    """(ref, kind, text) for every element line in an analyst request."""
    return LINE.findall(user_text)


def candidate(pattern: str, refs: list[str], *, confidence: float = 0.9, verifiable: bool = True, title: str = "") -> dict:
    return {
        "patternId": pattern,
        "elementRefs": refs,
        "title": title or f"{pattern.replace('_', ' ').capitalize()} spotted",
        "explanation": "The scripted model saw it.",
        "confidence": confidence,
        "verifiable": verifiable,
    }


def demo_store_analyst(user_text: str) -> list[dict]:
    """Proposes what a good model should on the demo stores, plus one claim the evidence rules must drop."""
    els = elements_in(user_text)
    # The most specific element: a popup's own text includes its buttons'.
    ref = lambda pattern: next((r for r, kind, t in els if kind != "popup" and re.search(pattern, t, re.I)), None)  # noqa: E731
    out = []
    if shame := ref(r"prefer paying full price"):
        out.append(candidate("confirm_shaming", [shame], title="The decline link shames the shopper"))
    if claim := ref(r"bought in the last"):
        out.append(candidate("false_urgency", [claim], confidence=0.6, verifiable=False, title="Unsourced popularity claim"))
    express, standard = ref(r"upgrade to express"), ref(r"continue with standard")
    if express and standard:
        out.append(candidate("interface_interference", [express, standard], title="Standard delivery is a tiny grey link"))
    # Store B's even delivery cards: a claim the measured sizes must rule out.
    even = [r for r, kind, t in els if kind == "radio option" and re.search(r"delivery", t, re.I)]
    if len(even) == 2:
        out.append(candidate("interface_interference", even, title="Delivery options steer the shopper"))
    return out


def scripted_models(
    analyst: Callable[[str], list[dict]] = demo_store_analyst,
    agreement: float = 0.9,
    delay: float = 0,
    fixer: Callable[[str], list[dict]] = demo_store_fixer,
) -> ModelSet:
    def respond(system: str, user: str, images: int) -> str | dict:
        if "Pattern Analyst" in system:
            return json.dumps({"candidates": analyst(user)})
        if "You are the Fixer" in system:
            return json.dumps({"changes": fixer(user)})
        # In the agent graph the adjudicator has tools: measure the cited elements first, then rule.
        if "measure_elements" in system and "[measure_elements]" not in user and (cited := CITED.search(user)):
            return {"tool": "measure_elements", "args": {"refs": cited.group(1).split(", ")}}
        return json.dumps({"reason": "The measured facts support it.", "agreement": agreement})

    model = ScriptedLlm(responder=respond, delay=delay)
    return ModelSet(smart=model, fast=model, name="a scripted model")


def blank_jpeg(width: int = 1280, height: int = 1600) -> bytes:
    out = io.BytesIO()
    Image.new("RGB", (width, height), "white").save(out, format="JPEG")
    return out.getvalue()
