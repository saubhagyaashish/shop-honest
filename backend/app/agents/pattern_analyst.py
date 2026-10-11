"""Pattern Analyst: reads one screen (screenshot + element list) and proposes dark-pattern candidates."""

from pathlib import Path
from typing import Literal

from google.genai import types
from pydantic import BaseModel, Field

from app.agents.elements import Element
from app.browser.capture import Capture
from app.knowledge import Knowledge
from app.models import Model
from app.models.call import ModelCaller

PROMPTS = Path(__file__).parent / "prompts"

# Patterns a model judges from one screen. The rest are measured (checks.py) or need more than a screen.
JudgedPattern = Literal[
    "false_urgency",
    "confirm_shaming",
    "interface_interference",
    "forced_action",
    "disguised_advertisement",
    "nagging",
    "trick_question",
]
JUDGED: tuple[str, ...] = JudgedPattern.__args__  # type: ignore[attr-defined]

# What each judged pattern looks like on a page, in the spirit of the CCPA guidelines' illustrations.
# Shared by the analyst and the adjudicator so both judge by the same yardstick.
GUIDANCE: dict[str, str] = {
    "false_urgency": (
        'Pressure from time or popularity the shopper can\'t check, such as "12 people are viewing this" or '
        '"500 bought today" with no source. Countdowns and stock counts are measured elsewhere.'
    ),
    "confirm_shaming": (
        "The decline or opt-out option is worded to make the shopper feel foolish, guilty or irresponsible for saying no, "
        'such as "No, I\'ll stay unprotected" or "No thanks, I don\'t like saving money". A neutral "No thanks" is fine.'
    ),
    "interface_interference": (
        "The design steers the choice: the option the store prefers is a large, coloured button while the alternative is "
        "small, grey or styled as plain text, so it's easy to miss. It counts even though the shopper can still choose the "
        "other option. Options shown with similar size and style are fine."
    ),
    "forced_action": "The shopper must do something unrelated (sign up, download an app, share data) to continue.",
    "disguised_advertisement": "Paid placements dressed up as reviews, recommendations or editorial content.",
    "nagging": "Repeated interruptions or requests unrelated to what the shopper is doing.",
    "trick_question": "Confusing or double-negative wording, so the shopper agrees to something they didn't mean to.",
}


class Candidate(BaseModel):
    patternId: JudgedPattern
    elementRefs: list[str] = Field(min_length=1)
    title: str = Field(min_length=3)
    explanation: str = Field(min_length=3)
    confidence: float = Field(ge=0, le=1)
    verifiable: bool = True
    # One specific sentence on what the business should change; the pattern's generic fix if empty.
    fix: str = ""


class Analysis(BaseModel):
    candidates: list[Candidate] = Field(default_factory=list, max_length=8)


def instruction(knowledge: Knowledge) -> str:
    patterns = "\n".join(f"- {pid} ({knowledge.pattern(pid)['name']}): {GUIDANCE[pid]}" for pid in JUDGED)
    return (PROMPTS / "pattern_analyst.md").read_text(encoding="utf-8").replace("{{PATTERNS}}", patterns)


async def analyse(
    caller: ModelCaller, model: Model, knowledge: Knowledge, capture: Capture, screen: str, elements: list[Element], jpeg: bytes
) -> list[Candidate]:
    listing = "\n".join(e.line() for e in elements)
    text = f"Screen: the {screen} ({capture.step} step of the journey)\n\nElements on this screen:\n{listing}"
    parts = [types.Part(text=text), types.Part(inline_data=types.Blob(mime_type="image/jpeg", data=jpeg))]
    analysis = await caller.ask(
        name="pattern_analyst", model=model, instruction=instruction(knowledge), schema=Analysis, parts=parts
    )
    return analysis.candidates
