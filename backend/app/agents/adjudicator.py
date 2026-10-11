"""Adjudicator: double-checks each model claim against a crop of its evidence, then sets its status.

claim can't be checked from the page → needs_review (a verifier can't settle it either)
verifier agreement < reject_below    → dropped
min(analyst, verifier) ≥ threshold   → confirmed
otherwise                            → needs_review
"""

import io
from functools import cache
from pathlib import Path

from google.genai import types
from PIL import Image
from pydantic import BaseModel, Field

from app.agents.findings import BBox, Finding
from app.agents.pattern_analyst import GUIDANCE, Candidate
from app.knowledge import Knowledge
from app.models import Model
from app.models.call import ModelCaller

PROMPTS = Path(__file__).parent / "prompts"


class Verdict(BaseModel):
    # Reason first: models judge better when they explain before they score.
    reason: str = ""
    # How strongly the evidence shows the pattern: 0 clearly not, 0.5 arguable, 1 clearly yes.
    agreement: float = Field(ge=0, le=1)


@cache
def instruction() -> str:
    return (PROMPTS / "adjudicator.md").read_text(encoding="utf-8")


def crop(jpeg: bytes, bbox: BBox | None, pad: int = 60, min_w: int = 560, min_h: int = 280) -> bytes:
    """The evidence region with some context around it, as a JPEG."""
    with Image.open(io.BytesIO(jpeg)) as image:
        if not bbox:
            box = (0, 0, image.width, min(image.height, 1200))
        else:
            x0, y0 = bbox["x"] * image.width, bbox["y"] * image.height
            x1, y1 = x0 + bbox["w"] * image.width, y0 + bbox["h"] * image.height
            cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
            w, h = max(x1 - x0 + 2 * pad, min_w), max(y1 - y0 + 2 * pad, min_h)
            box = (
                max(0, int(cx - w / 2)),
                max(0, int(cy - h / 2)),
                min(image.width, int(cx + w / 2)),
                min(image.height, int(cy + h / 2)),
            )
        out = io.BytesIO()
        image.crop(box).convert("RGB").save(out, format="JPEG", quality=85)
        return out.getvalue()


def needs_verifying(candidate: Candidate) -> bool:
    """A claim the page can't settle goes to a human; a second model can't settle it either."""
    return candidate.verifiable


async def verify(caller: ModelCaller, model: Model, knowledge: Knowledge, finding: Finding, jpeg: bytes) -> Verdict:
    pattern_id = finding["patternId"]
    facts = "\n".join(f"- {o}" for o in finding["evidence"]["observations"])
    text = (
        f"Pattern claimed: {knowledge.pattern(pattern_id)['name']}. "
        f"What it looks like: {GUIDANCE.get(pattern_id, knowledge.pattern(pattern_id)['description'])}\n\n"
        f"Claim: {finding['title']}\n{finding['explanation']}\n\n"
        f"Measured on the page:\n{facts}"
    )
    parts = [types.Part(text=text), types.Part(inline_data=types.Blob(mime_type="image/jpeg", data=jpeg))]
    return await caller.ask(name="adjudicator", model=model, instruction=instruction(), schema=Verdict, parts=parts)


def decide(
    finding: Finding, candidate: Candidate, verdict: Verdict | None, threshold: float, reject_below: float
) -> tuple[Finding | None, str]:
    """The finding with its final confidence and status (or None when rejected), and a line for the audit trail."""
    if not candidate.verifiable:
        confidence = round(min(candidate.confidence, threshold - 0.01), 2)
        return (
            {**finding, "confidence": confidence, "status": "needs_review"},
            "Nothing on the page can confirm or refute this claim. Sending it to human review.",
        )
    if verdict is not None and verdict.agreement < reject_below:
        return None, f'Rejected "{finding["title"]}": {verdict.reason or "the evidence doesn’t support it."}'
    confidence = round(candidate.confidence if verdict is None else min(candidate.confidence, verdict.agreement), 2)
    finding = {**finding, "confidence": confidence}
    if confidence >= threshold:
        return {**finding, "status": "confirmed"}, f'Confirmed "{finding["title"]}" (confidence {confidence:.2f}).'
    return (
        {**finding, "status": "needs_review"},
        f"Confidence {confidence:.2f} is below the {threshold:g} threshold. Sending it to human review instead of asserting it.",
    )
