"""Evidence tools the Adjudicator can call before it rules. No model involved.

They read what the Navigator already captured, never the live page: by the time
a claim is judged, the browser has moved on (reviews run in the background).
The product page is captured twice, first look and after a reload, so "reload
and compare" is a lookup. Answers are small, so a tool call costs few tokens.
"""

import re
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

from app.agents.elements import Element
from app.agents.findings import Evidence
from app.agents.pattern_analyst import GUIDANCE
from app.browser.capture import Capture
from app.knowledge import Knowledge

PRODUCT_LOOKS = ("product-first", "product-reload")
SCREEN_NAMES = {"product": "product page", "variant": "product page", "checkout": "checkout page", "payment": "payment page"}


@dataclass(frozen=True)
class Screen:
    """One screen under review, and the rest of the journey for comparison."""

    capture: Capture
    elements: list[Element]
    evidence: Evidence
    knowledge: Knowledge

    def element(self, ref: str) -> Element | None:
        return next((e for e in self.elements if e.ref == ref), None)


def measure(screen: Screen, refs: list[str]) -> dict[str, Any]:
    found = [e for ref in dict.fromkeys(refs) if (e := screen.element(ref))]
    out: dict[str, Any] = {"elements": [{"ref": e.ref, "kind": e.kind, "text": _short(e.text), "look": e.facts} for e in found]}
    if unknown := [r for r in refs if not screen.element(r)]:
        out["unknown"] = unknown
    sized = sorted((e for e in found if e.area > 0), key=lambda e: e.area)
    if len(sized) >= 2:
        quiet, loud = sized[0], sized[-1]
        out["largest"], out["smallest"] = loud.ref, quiet.ref
        out["areaRatio"] = round(loud.area / quiet.area, 1)
        fonts = [float(e.metrics["fontPx"]) for e in (loud, quiet) if e.metrics.get("fontPx")]
        if len(fonts) == 2 and fonts[1]:
            out["fontRatio"] = round(fonts[0] / fonts[1], 2)
    return out


def compare_looks(screen: Screen, ref: str) -> dict[str, Any]:
    element = screen.element(ref)
    if element is None:
        return {"error": f"no element {ref} on this screen"}
    looks = [screen.evidence.captures.get(label) for label in PRODUCT_LOOKS]
    if screen.capture.step != "product" or not all(looks):
        return {"result": "not compared", "why": "only the product page is looked at twice (before and after a reload)"}
    first, second = (_matching(look, element.text) for look in looks)  # type: ignore[arg-type]
    if first is None and second is None:
        return {"result": "on neither look", "text": _short(element.text)}
    if first is None or second is None:
        seen = "after the reload only" if first is None else "on the first look only"
        return {"result": seen, "text": _short(second or first or "")}
    if first == second:
        return {"result": "unchanged after reload", "text": _short(first)}
    return {"result": "changed after reload", "before": _short(first), "after": _short(second)}


def seen_elsewhere(screen: Screen, ref: str) -> dict[str, Any]:
    element = screen.element(ref)
    if element is None:
        return {"error": f"no element {ref} on this screen"}
    here = _screen_name(screen.capture)
    others = [c for c in sorted(screen.evidence.captures.values(), key=lambda c: c.n) if _matching(c, element.text)]
    names = list(dict.fromkeys(name for c in others if (name := _screen_name(c)) != here))
    return {"text": _short(element.text), "otherScreens": names}


def ccpa_rule(screen: Screen, pattern_id: str) -> dict[str, Any]:
    try:
        pattern = screen.knowledge.pattern(pattern_id)
    except KeyError:
        return {"error": f"unknown pattern {pattern_id}"}
    rule = pattern.get("rule") or {}
    return {
        "pattern": pattern["name"],
        "definition": pattern["description"],
        "lookFor": GUIDANCE.get(pattern_id, ""),
        "rule": ", ".join(p for p in (rule.get("source"), rule.get("clause")) if p),
    }


def tools_for(screen: Screen) -> list[Callable[..., dict[str, Any]]]:
    """The tools as plain functions over this screen, for ADK to declare to the model."""

    def measure_elements(refs: list[str]) -> dict[str, Any]:
        """Measured size, font and colour of the listed elements (refs like "e3"), and how many times larger the
        biggest is than the smallest. Use it to compare how prominent the options are."""
        return measure(screen, refs)

    def compare_reloads(ref: str) -> dict[str, Any]:
        """Whether an element's text stayed the same when the product page was reloaded. A real figure or deadline
        stays put; a made-up one often changes or resets."""
        return compare_looks(screen, ref)

    def find_on_other_screens(ref: str) -> dict[str, Any]:
        """Which other screens of this shopping journey showed the same text (for repeated interruptions)."""
        return seen_elsewhere(screen, ref)

    def ccpa_definition(pattern_id: str) -> dict[str, Any]:
        """The CCPA guideline's definition of a dark pattern (by id, such as "confirm_shaming") and its clause."""
        return ccpa_rule(screen, pattern_id)

    return [measure_elements, compare_reloads, find_on_other_screens, ccpa_definition]


def describe(name: str, args: dict[str, Any], result: dict[str, Any]) -> tuple[str, str]:
    """(the call as a chip, e.g. "measure_elements(e4, e5)"; one line for the agent log)."""
    call = f"{name}({', '.join(_flat(v) for v in args.values())})"
    if "error" in result:
        return call, f"Couldn't use {name}: {result['error']}."
    if name == "measure_elements":
        if "areaRatio" not in result:
            looks = [f'"{e["text"]}": {e["look"]}' for e in result["elements"] if e["look"]]
            return call, f"Measured {'; '.join(looks)}." if looks else "Measured the cited element."
        by_ref = {e["ref"]: e["text"] for e in result["elements"]}
        line = f'"{by_ref[result["largest"]]}" takes up {result["areaRatio"]:g}× the space of "{by_ref[result["smallest"]]}"'
        if "fontRatio" in result and result["fontRatio"] != 1:
            line += f", with {result['fontRatio']:g}× the font size"
        return call, line + "."
    if name == "compare_reloads":
        if result["result"] == "changed after reload":
            return call, f'After a reload, "{result["before"]}" became "{result["after"]}".'
        if result["result"] == "unchanged after reload":
            return call, f'"{result["text"]}" read the same after a reload.'
        return call, f"Reload comparison: {result.get('why') or result['result']}."
    if name == "find_on_other_screens":
        screens = result["otherScreens"]
        return call, ("Also shown on the " + ", ".join(screens) + ".") if screens else "Not shown on any other screen."
    if name == "ccpa_definition":
        return call, f"Checked the rule: {result['pattern']}, {result['rule']}."
    return call, f"Used {name}."


def _screen_name(capture: Capture) -> str:
    return SCREEN_NAMES.get(capture.step, capture.step)


def _matching(capture: Capture, text: str) -> str | None:
    """The text on that screen that matches `text` once numbers are ignored, or None."""
    want = _shape(text)
    # Element texts are cut at 200 characters; compare the common start of long ones.
    return next((t for t in _texts(capture) if _same(_shape(t), want)), None)


def _same(a: str, b: str) -> bool:
    if a == b:
        return True
    short, long = sorted((a, b), key=len)
    return len(short) >= 40 and long.startswith(short)


def _texts(capture: Capture) -> list[str]:
    s = capture.signals
    out = [c["text"] for c in s.get("salesClaims", [])] + [n["text"] for n in s.get("notes", [])]
    for dialog in s.get("dialogs", []):
        out += [dialog["text"], *(b["text"] for b in dialog.get("buttons", []))]
    out += [c["text"] for c in s.get("controls", [])] + [b["label"] for b in s.get("checkboxes", [])]
    return [t for t in out if t]


def _shape(text: str) -> str:
    return re.sub(r"\d[\d,.:]*", "#", " ".join(text.split()).lower())


def _flat(value: Any) -> str:
    return ", ".join(map(str, value)) if isinstance(value, list) else str(value)


def _short(text: str, limit: int = 70) -> str:
    return text if len(text) <= limit else text[: limit - 1].rstrip() + "…"
