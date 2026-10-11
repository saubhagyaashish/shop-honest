"""Building blocks shared by every agent that produces findings (measured checks and model judgement)."""

from dataclasses import dataclass, field
from typing import Any

from app.browser.capture import Capture
from app.knowledge import Knowledge
from app.prices.facts import History

Finding = dict[str, Any]
BBox = dict[str, float]


@dataclass
class Evidence:
    """Everything the agents can look at, gathered by the journey."""

    captures: dict[str, Capture]
    added_items: list[str] = field(default_factory=list)
    # The product's price history, once the Price Historian has looked it up (None: there is none).
    price_history: History | None = None

    def get(self, *labels: str) -> list[Capture]:
        return [self.captures[label] for label in labels if label in self.captures]


def money(amount: float) -> str:
    return f"₹{amount:,.0f}"


def frame(capture: Capture, bbox: BBox | None, caption: str) -> dict[str, Any]:
    out: dict[str, Any] = {"screenshotUrl": capture.screenshot_url, "caption": caption}
    if bbox:
        out["bbox"] = bbox
    return out


def make_finding(
    knowledge: Knowledge,
    *,
    id: str,
    pattern_id: str,
    title: str,
    explanation: str,
    confidence: float,
    capture: Capture,
    frames: list[dict[str, Any]],
    observations: list[str],
    detected_by: str,
    element_text: str | None = None,
    severity: str | None = None,
    status: str = "confirmed",
    remediation: str | None = None,
) -> Finding:
    pattern = knowledge.pattern(pattern_id)
    finding: Finding = {
        "id": id,
        "patternId": pattern_id,
        "title": title,
        "explanation": explanation,
        "severity": severity or pattern["defaultSeverity"],
        "confidence": confidence,
        "status": status,
        "step": capture.step,
        "pageUrl": capture.url,
        "rule": pattern["rule"],
        "detectedBy": detected_by,
        "evidence": {"frames": frames, "observations": observations},
        "remediation": remediation or pattern["fix"],
    }
    if element_text:
        finding["evidence"]["elementText"] = element_text
    return finding


def union(boxes: list[BBox]) -> BBox:
    x0 = min(b["x"] for b in boxes)
    y0 = min(b["y"] for b in boxes)
    x1 = max(b["x"] + b["w"] for b in boxes)
    y1 = max(b["y"] + b["h"] for b in boxes)
    return {"x": x0, "y": y0, "w": x1 - x0, "h": y1 - y0}
