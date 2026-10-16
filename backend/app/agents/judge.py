"""Model judgement for one screen: Pattern Analyst → Evidence → Adjudicator, narrated as it goes."""

import asyncio
from pathlib import Path
from typing import TYPE_CHECKING

from google.genai import types
from pydantic import BaseModel

from app.agents import adjudicator, evidence, pattern_analyst
from app.agents.elements import Element, build_elements
from app.agents.findings import Finding
from app.agents.pattern_analyst import Candidate
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
        # Journey steps with at least one screen the model read (for the CCPA self-audit report).
        self.reviewed_steps: set[str] = set()
        self.smart = models.smart
        self.fast = models.fast
        self.knowledge = knowledge
        self.settings = settings
        # (pattern, element text) already judged in this audit, kept or not, so each claim is judged once.
        self.judged: set[tuple[str, str]] = set()

    async def pick(self, purpose: str, controls: list[dict]) -> str | None:
        """Navigator fallback: which of these controls {purpose}? The ref, or None."""
        listing = "\n".join(
            f'{c["ref"]} · {c["kind"]}: "{c["text"]}"' + (f" → {c['href']}" if c.get("href") else "") for c in controls
        )
        text = f"Goal: find the control that {purpose}.\n\nControls on this page:\n{listing}"
        try:
            answer = await self.caller.ask(
                name="navigator", model=self.fast, instruction=NAVIGATOR_PROMPT, schema=Pick, parts=[types.Part(text=text)]
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
            candidates = await pattern_analyst.analyse(self.caller, self.smart, self.knowledge, capture, screen, elements, jpeg)
        except ModelError as err:
            self.failed += 1
            await walk.log("pattern_analyst", f"Couldn't read the {screen}: {err}. The measured checks still apply.")
            return
        self.reviewed += 1
        self.reviewed_steps.add(capture.step)
        if not candidates:
            await walk.log("pattern_analyst", f"Nothing on the {screen} needs flagging beyond what was measured.")
            return

        for n, candidate in enumerate(candidates, start=1):
            finding = await self.ground(walk, candidate, n, elements, capture, screen)
            if finding is None:
                continue
            await walk.log("pattern_analyst", candidate.title)
            verdict = None
            if self.verifies(candidate):
                try:
                    region = await self.region(jpeg, finding)
                    verdict = await adjudicator.verify(self.caller, self.fast, self.knowledge, finding, region)
                except ModelError as err:
                    await self.unverified(walk, finding, err)
                    continue
            await self.decide(walk, finding, candidate, verdict)

    # The steps around the models, shared with the agent graph (review_graph.py).

    async def ground(
        self, walk: "Walk", candidate: Candidate, n: int, elements: list[Element], capture: Capture, screen: str
    ) -> Finding | None:
        """The candidate as a finding grounded on its cited elements; None if dropped or already judged in this audit."""
        cited = evidence.cited(candidate, elements)
        if not cited:
            await walk.log("evidence", f"Dropped a {candidate.patternId} claim that cited nothing on the page.")
            return None
        if objection := evidence.rules(candidate, cited):
            await walk.log("evidence", f'Dropped "{candidate.title}": {objection}.')
            return None
        finding = evidence.ground(
            candidate, elements, capture, screen, self.knowledge, f"m-{capture.label}-{candidate.patternId}-{n}"
        )
        if finding is None:
            return None
        key = (finding["patternId"], finding["evidence"].get("elementText", ""))
        if key in self.judged:
            return None
        self.judged.add(key)
        return finding

    def verifies(self, candidate: Candidate) -> bool:
        return self.settings.adjudicator_verify and adjudicator.needs_verifying(candidate)

    async def region(self, jpeg: bytes, finding: Finding) -> bytes:
        return await asyncio.to_thread(adjudicator.crop, jpeg, finding["evidence"]["frames"][0].get("bbox"))

    async def unverified(self, walk: "Walk", finding: Finding, err: ModelError) -> None:
        await walk.log("adjudicator", f"Couldn't double-check this ({err}). Sending it to human review.")
        await walk.add_finding({**finding, "status": "needs_review"})

    async def decide(self, walk: "Walk", finding: Finding, candidate: Candidate, verdict: adjudicator.Verdict | None) -> None:
        final, message = adjudicator.decide(
            finding, candidate, verdict, self.settings.review_threshold, self.settings.reject_below
        )
        await walk.log("adjudicator", message)
        if final is not None:
            await walk.add_finding(final)
