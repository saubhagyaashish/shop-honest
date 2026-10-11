"""The numbered element list a model sees and cites (e1, e2…) for one screen.

Only what needs judgement goes in: dialogs and their buttons, controls, claims,
persuasive notes and checkboxes. Countdowns, stock, prices, cart contents and
fees are measured by checks.py instead, and an element a measured finding
already covers is left out, so the model can neither repeat nor contradict it.
"""

from dataclasses import dataclass, field
from typing import Any

from app.agents.findings import BBox, Finding
from app.browser.capture import Capture


@dataclass(frozen=True)
class Element:
    ref: str
    kind: str
    text: str
    bbox: BBox | None
    facts: str = ""
    context: str = ""
    # Measured prominence of a control (look, fontPx, width, height…), for the evidence rules.
    metrics: dict[str, Any] = field(default_factory=dict, compare=False)

    @property
    def area(self) -> float:
        return float(self.metrics.get("width", 0)) * float(self.metrics.get("height", 0))

    def line(self) -> str:
        where = f" ({self.context})" if self.context else ""
        facts = f" · {self.facts}" if self.facts else ""
        return f'{self.ref} · {self.kind}{where}: "{self.text}"{facts}'


def looks(control: dict[str, Any]) -> str:
    """Measured prominence, in words: "filled button, orange, 16 px bold, 680×56 px"."""
    colour = control.get("background") if control.get("look") == "filled button" else f"{control.get('textColour')} text"
    weight = " bold" if control.get("bold") else ""
    return (
        f"{control.get('look')}, {colour}, {control.get('fontPx')} px{weight}, {control.get('width')}×{control.get('height')} px"
    )


def build_elements(capture: Capture, findings: list[Finding]) -> list[Element]:
    s = capture.signals
    covered = [f["evidence"]["frames"] for f in findings]
    raw: list[tuple[str, str, BBox | None, str, str, dict[str, Any]]] = []

    for dialog in s.get("dialogs", []):
        title = dialog["text"][:70]
        raw.append(("popup", dialog["text"][:200], dialog.get("bbox"), "", "", {}))
        for button in dialog.get("buttons", []):
            raw.append(("popup button", button["text"], button.get("bbox"), looks(button), f'in popup "{title}"', button))
    for claim in s.get("salesClaims", []):
        raw.append(("claim", claim["text"], claim.get("bbox"), "", "", {}))
    for note in s.get("notes", []):
        raw.append(("note", note["text"], note.get("bbox"), "", _section(note), {}))
    for box in s.get("checkboxes", []):
        state = "ticked on arrival" if box["checked"] else "not ticked"
        raw.append(("checkbox", box["label"][:200], box.get("bbox"), state, "", {}))
    for control in s.get("controls", []):
        state = ", selected" if control.get("checked") else ""
        raw.append((control["kind"], control["text"], control.get("bbox"), looks(control) + state, _section(control), control))

    elements = []
    for kind, text, bbox, facts, context, metrics in raw:
        if not text or _already_reported(capture, bbox, covered):
            continue
        ref = f"e{len(elements) + 1}"
        elements.append(Element(ref=ref, kind=kind, text=text, bbox=bbox, facts=facts, context=context, metrics=metrics))
    return elements


def _section(item: dict[str, Any]) -> str:
    return f'in "{item["section"]}"' if item.get("section") else ""


def _already_reported(capture: Capture, bbox: BBox | None, covered: list[list[dict[str, Any]]]) -> bool:
    """True when a measured finding's evidence box on this screenshot contains the element's centre."""
    if not bbox:
        return False
    cx, cy = bbox["x"] + bbox["w"] / 2, bbox["y"] + bbox["h"] / 2
    for frames in covered:
        for frame in frames:
            b = frame.get("bbox")
            if (
                frame["screenshotUrl"] == capture.screenshot_url
                and b
                and b["x"] <= cx <= b["x"] + b["w"]
                and b["y"] <= cy <= b["y"] + b["h"]
            ):
                return True
    return False
