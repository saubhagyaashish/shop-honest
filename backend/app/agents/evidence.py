"""Evidence: grounds a model's candidate on the elements it cited. No model involved.

The box comes from the cited elements' measured positions and the observations
from their measured facts, so everything in a finding's evidence was measured
on the page, not written by the model. A claim the measurements contradict is
dropped before anyone has to argue about it (rules()).
"""

from app.agents.elements import Element
from app.agents.findings import Finding, frame, make_finding, union
from app.agents.pattern_analyst import Candidate
from app.browser.capture import Capture
from app.knowledge import Knowledge

CONTROLS = {"popup button", "button", "link", "radio option", "checkbox"}
# The kinds of element each pattern can rest on.
KINDS: dict[str, set[str]] = {
    "false_urgency": {"claim", "note", "popup"},
    "confirm_shaming": CONTROLS,
    "interface_interference": CONTROLS,
    "forced_action": {"popup", "note", *CONTROLS},
    "disguised_advertisement": {"note", "claim", "link"},
    "nagging": {"popup", "popup button"},
    "trick_question": CONTROLS,
}
# Interface interference: the loudest cited option must be at least this many times the area of the quietest.
PROMINENCE_RATIO = 3.0


def cited(candidate: Candidate, elements: list[Element]) -> list[Element]:
    """The listed elements a candidate cites (unknown refs are ignored)."""
    by_ref = {e.ref: e for e in elements}
    return [by_ref[ref] for ref in dict.fromkeys(candidate.elementRefs) if ref in by_ref]


def rules(candidate: Candidate, elements: list[Element]) -> str | None:
    """Why the measurements rule this claim out, or None if they allow it. `elements` are the cited ones."""
    usable = [e for e in elements if e.kind in KINDS.get(candidate.patternId, set())]
    if not usable:
        kinds = ", ".join(sorted({e.kind for e in elements})) or "nothing"
        return f"a {candidate.patternId.replace('_', ' ')} claim can't rest on a {kinds}"
    if candidate.patternId == "interface_interference":
        options = [e for e in usable if e.area > 0]
        if len(options) < 2:
            return "interface interference needs two options to compare, and the claim cited one"
        ranked = sorted(options, key=lambda e: e.area)
        quiet, loud = ranked[0], ranked[-1]
        if loud.area < PROMINENCE_RATIO * quiet.area:
            return f'the measured sizes of "{_short(loud.text, 40)}" and "{_short(quiet.text, 40)}" are similar'
    return None


def ground(
    candidate: Candidate, elements: list[Element], capture: Capture, screen: str, knowledge: Knowledge, finding_id: str
) -> Finding | None:
    """A needs_review finding built from the cited elements (the adjudicator sets the final status)."""
    every = cited(candidate, elements)
    if not every:
        return None
    usable = [e for e in every if e.kind in KINDS.get(candidate.patternId, set())] or every
    boxes = [e.bbox for e in usable if e.bbox]
    observations = [f'{e.kind.capitalize()}: "{_short(e.text)}"' + (f" ({e.facts})" if e.facts else "") for e in usable]
    return make_finding(
        knowledge,
        id=finding_id,
        pattern_id=candidate.patternId,
        title=candidate.title,
        explanation=candidate.explanation,
        confidence=candidate.confidence,
        capture=capture,
        frames=[frame(capture, union(boxes) if boxes else None, f"The {screen}, as the shopper saw it")],
        observations=observations,
        detected_by="pattern_analyst",
        element_text=" · ".join(_short(e.text) for e in usable),
        severity=None if candidate.verifiable else "low",
        status="needs_review",
    )


def _short(text: str, limit: int = 120) -> str:
    return text if len(text) <= limit else text[: limit - 1].rstrip() + "…"
