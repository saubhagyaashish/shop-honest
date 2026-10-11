"""The Pattern Analyst's judgement on text alone, for evaluating it on public datasets (evals/dataset.py).

Same model tier and the same pattern guidance as the screen review; only the input differs.
"""

from pathlib import Path

from google.genai import types
from pydantic import BaseModel, Field

from app.agents.pattern_analyst import GUIDANCE
from app.knowledge import Knowledge
from app.models import Model
from app.models.call import ModelCaller

PROMPT = (Path(__file__).parent / "prompts" / "text_judge.md").read_text(encoding="utf-8")


class TextVerdict(BaseModel):
    id: int
    dark: bool
    pattern: str | None = None
    confidence: float = Field(default=0.5, ge=0, le=1)


class TextVerdicts(BaseModel):
    verdicts: list[TextVerdict]


def instruction(knowledge: Knowledge) -> str:
    patterns = "\n".join(f"- {pid} ({p['name']}): {GUIDANCE.get(pid, p['description'])}" for pid, p in knowledge.patterns.items())
    return PROMPT.replace("{{PATTERNS}}", patterns)


async def classify(
    caller: ModelCaller, model: Model, knowledge: Knowledge, texts: list[tuple[int, str]]
) -> dict[int, TextVerdict]:
    listing = "\n".join(f"{i}. {text[:400]}" for i, text in texts)
    answer = await caller.ask(
        name="text_judge", model=model, instruction=instruction(knowledge), schema=TextVerdicts, parts=[types.Part(text=listing)]
    )
    wanted = {i for i, _ in texts}
    return {v.id: v for v in answer.verdicts if v.id in wanted}
