"""Model judgement for one screen: Pattern Analyst → Evidence → Adjudicator, narrated as it goes."""

import asyncio
from pathlib import Path
from typing import TYPE_CHECKING

from google.genai import types
from pydantic import BaseModel

from app.agents import adjudicator, evidence, pattern_analyst
from app.agents.elements import build_elements
from app.browser.capture import Capture
from app.config import Settings
from app.knowledge import Knowledge
from app.models import ModelSet
from app.models.call import ModelCaller, ModelError

if TYPE_CHECKING:
    from app.runner.walk import Walk

NAVIGATOR_PROMPT = (Path(__file__).parent / "prompts" / "navigator.md").read_text(encoding="utf-8")


class Pick(BaseModel):
    reason: str = ""
    ref: str | None = None


SCREEN = {
    "product-popup": "popup",
    "product-first": "product page",
    "variant": "product page",
    "cart": "cart",
    "checkout": "checkout page",
    "payment": "payment page",
}


class Judge:
    def __init__(self, models: ModelSet, knowledge: Knowledge, settings: Settings) -> None:
        self.caller = ModelCaller(settings)
        self.model_name = models.name
        # Screens the model read, and screens it couldn't (for the closing summary).
        self.reviewed = 0
        self.failed = 0
        self._smart = models.smart
        self._fast = models.fast
        self._knowledge = knowledge
        self._settings = settings
        # (pattern, element text) already judged in this audit, kept or not, so each claim is judged once.
        self._judged: set[tuple[str, str]] = set()

    async def pick(self, purpose: str, controls: list[dict]) -> str | None:
        """Navigator fallback: which of these controls {purpose}? The ref, or None."""
        listing = "\n".join(
            f'{c["ref"]} · {c["kind"]}: "{c["text"]}"' + (f" → {c['href']}" if c.get("href") else "") for c in controls
        )
        text = f"Goal: find the control that {purpose}.\n\nControls on this page:\n{listing}"
        try:
            answer = await self.caller.ask(
                name="navigator", model=self._fast, instruction=NAVIGATOR_PROMPT, schema=Pick, parts=[types.Part(text=text)]
            )
        except ModelError:
            return None
        return answer.ref if answer.ref in {c["ref"] for c in controls} else None

    async def review(self, walk: "Walk", capture: Capture) -> None:
        screen = SCREEN.get(capture.label, capture.step)
        elements = build_elements(capture, walk.findings)
        if not elements:
            return
        await walk.log("pattern_analyst", f"Reading the {screen} with {self.model_name}…")
        jpeg = await walk.screenshot(capture)
        try:
            candidates = await pattern_analyst.analyse(self.caller, self._smart, self._knowledge, capture, screen, elements, jpeg)
        except ModelError as err:
            self.failed += 1
            await walk.log("pattern_analyst", f"Couldn't read the {screen}: {err}. The measured checks still apply.")
            return
        self.reviewed += 1
        if not candidates:
            await walk.log("pattern_analyst", f"Nothing on the {screen} needs flagging beyond what was measured.")
            return

        for n, candidate in enumerate(candidates, start=1):
            cited = evidence.cited(candidate, elements)
            if not cited:
                await walk.log("evidence", f"Dropped a {candidate.patternId} claim that cited nothing on the page.")
                continue
            if objection := evidence.rules(candidate, cited):
                await walk.log("evidence", f'Dropped "{candidate.title}": {objection}.')
                continue
            finding = evidence.ground(
                candidate, elements, capture, screen, self._knowledge, f"m-{capture.label}-{candidate.patternId}-{n}"
            )
            if finding is None:
                continue
            key = (finding["patternId"], finding["evidence"].get("elementText", ""))
            if key in self._judged:
                continue
            self._judged.add(key)
            await walk.log("pattern_analyst", candidate.title)
            verdict = None
            if self._settings.adjudicator_verify and adjudicator.needs_verifying(candidate):
                try:
                    region = await asyncio.to_thread(adjudicator.crop, jpeg, finding["evidence"]["frames"][0].get("bbox"))
                    verdict = await adjudicator.verify(self.caller, self._fast, self._knowledge, finding, region)
                except ModelError as err:
                    await walk.log("adjudicator", f"Couldn't double-check this ({err}). Sending it to human review.")
                    await walk.add_finding({**finding, "status": "needs_review"})
                    continue
            final, message = adjudicator.decide(
                finding, candidate, verdict, self._settings.review_threshold, self._settings.reject_below
            )
            await walk.log("adjudicator", message)
            if final is not None:
                await walk.add_finding(final)
