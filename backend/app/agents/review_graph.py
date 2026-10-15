"""Model judgement for one screen as an ADK agent graph: Pattern Analyst → Evidence → Adjudicator with tools.

screen_review (Workflow), one session per screen the journey hands to analyse():

    START → prepare ──"skip"──▶ finish       the element list; nothing on the screen to judge
              ▼ "judge"
            analyse ──"done"──▶ finish        Pattern Analyst (LlmAgent) proposes candidates
              ▼ "claims"
            ground ──"none"──▶ finish         evidence rules drop what the measurements contradict
              ▼ "claims"
            adjudicate                        per claim, the Adjudicator (LlmAgent) checks the evidence
                                              with tools (tools.py), then decide() sets the status

The agents run as child nodes (ctx.run_node), so they receive the screen exactly
as Judge.review sends it, screenshot included. The narration matches
Judge.review's, plus one line per tool call; the steps around the models are
Judge's own (ground, decide…), so both paths judge alike.
"""

import logging
from dataclasses import dataclass, field
from pathlib import Path
from typing import TYPE_CHECKING, Any

from google.adk.agents import Context, LlmAgent
from google.adk.runners import InMemoryRunner
from google.adk.tools.base_tool import BaseTool
from google.adk.tools.tool_context import ToolContext
from google.adk.workflow import START, Workflow, node
from google.adk.workflow._errors import DynamicNodeFailError
from google.genai import types

from app.agents import adjudicator, pattern_analyst, tools
from app.agents.elements import Element, build_elements
from app.agents.findings import Finding
from app.agents.judge import SCREEN, Judge
from app.agents.pattern_analyst import Analysis, Candidate
from app.browser.capture import Capture
from app.models.call import APP, ModelError

if TYPE_CHECKING:
    from app.runner.walk import Walk

log = logging.getLogger(__name__)
# ADK logs every failed node at ERROR, with a traceback. Here a failed agent run is expected and handled (asked
# again, or the claim goes to human review), and any ERROR log raises an alert (deploy/monitoring.py), so its
# node runner stays quiet. A failure this file doesn't handle still reaches Walk._review, which logs it.
logging.getLogger("google_adk.google.adk.workflow._node_runner").setLevel(logging.CRITICAL)

TOOLS_NOTE = (Path(__file__).parent / "prompts" / "adjudicator_tools.md").read_text(encoding="utf-8")
# The tool ADK adds so a model without native support can return a structured answer; not an evidence check.
ANSWER_TOOL = "set_model_response"


@dataclass
class Work:
    """One screen under review."""

    capture: Capture
    screen: str
    elements: list[Element]
    jpeg: bytes
    candidates: list[Candidate] = field(default_factory=list)
    claims: list[tuple[Finding, Candidate]] = field(default_factory=list)


class ReviewGraph:
    """One per audit: the screen_review graph and the runner every screen's session goes through."""

    def __init__(self, walk: "Walk", judge: Judge) -> None:
        self._walk = walk
        self._judge = judge
        self._screens: dict[str, Work] = {}
        self._analyst = LlmAgent(
            name="pattern_analyst",
            model=judge.caller.metered(judge.smart),
            static_instruction=pattern_analyst.instruction(judge.knowledge),
            output_schema=Analysis,
            include_contents="none",
            generate_content_config=types.GenerateContentConfig(temperature=0),
        )
        self.workflow = self._build()
        self._runner = InMemoryRunner(node=self.workflow, app_name=APP)

    async def review(self, capture: Capture) -> None:
        sessions = self._runner.session_service
        session = await sessions.create_session(app_name=APP, user_id="audit")
        message = types.Content(role="user", parts=[types.Part(text=capture.label)])
        try:
            async for _ in self._runner.run_async(user_id="audit", session_id=session.id, new_message=message):
                pass
        finally:
            self._screens.pop(capture.label, None)
            await sessions.delete_session(app_name=APP, user_id="audit", session_id=session.id)

    def _build(self) -> Workflow:
        walk, judge = self._walk, self._judge

        @node
        async def prepare(ctx: Context, node_input: types.Content) -> str:
            label = "".join(p.text or "" for p in node_input.parts or [])
            capture = walk.evidence.captures[label]
            screen = SCREEN.get(capture.label, capture.step)
            elements = build_elements(capture, walk.findings)
            if not elements:
                ctx.route = "skip"
                return label
            await walk.log("pattern_analyst", f"Reading the {screen} with {judge.model_name}…")
            self._screens[label] = Work(capture, screen, elements, await walk.screenshot(capture))
            ctx.route = "judge"
            return label

        @node(rerun_on_resume=True)
        async def analyse(ctx: Context, node_input: str) -> str:
            work = self._screens[node_input]
            parts = pattern_analyst.request_parts(work.capture, work.screen, work.elements, work.jpeg)
            try:
                answer = await self._ask(ctx, self._analyst, parts)
            except ModelError as err:
                judge.failed += 1
                await walk.log("pattern_analyst", f"Couldn't read the {work.screen}: {err}. The measured checks still apply.")
                ctx.route = "done"
                return node_input
            judge.reviewed += 1
            work.candidates = Analysis.model_validate(answer).candidates
            if not work.candidates:
                await walk.log("pattern_analyst", f"Nothing on the {work.screen} needs flagging beyond what was measured.")
                ctx.route = "done"
                return node_input
            ctx.route = "claims"
            return node_input

        @node
        async def ground(ctx: Context, node_input: str) -> str:
            work = self._screens[node_input]
            for n, candidate in enumerate(work.candidates, start=1):
                finding = await judge.ground(walk, candidate, n, work.elements, work.capture, work.screen)
                if finding is not None:
                    work.claims.append((finding, candidate))
            ctx.route = "claims" if work.claims else "none"
            return node_input

        @node(rerun_on_resume=True)
        async def adjudicate(ctx: Context, node_input: str) -> None:
            work = self._screens[node_input]
            screen = tools.Screen(work.capture, work.elements, walk.evidence, judge.knowledge)
            for finding, candidate in work.claims:
                await walk.log("pattern_analyst", candidate.title)
                verdict = None
                if judge.verifies(candidate):
                    try:
                        region = await judge.region(work.jpeg, finding)
                        parts = adjudicator.request_parts(judge.knowledge, finding, region, candidate.elementRefs)
                        verdict = adjudicator.Verdict.model_validate(await self._ask(ctx, self._adjudicator(screen), parts))
                    except ModelError as err:
                        await judge.unverified(walk, finding, err)
                        continue
                await judge.decide(walk, finding, candidate, verdict)

        @node
        async def finish(node_input: str) -> None:
            return None

        return Workflow(
            name="screen_review",
            edges=[
                (START, prepare),
                (prepare, {"judge": analyse, "skip": finish}),
                (analyse, {"claims": ground, "done": finish}),
                (ground, {"claims": adjudicate, "none": finish}),
            ],
        )

    def _adjudicator(self, screen: tools.Screen) -> LlmAgent:
        """An Adjudicator for one claim, with the evidence tools of its screen and a cap on how many it may call."""
        walk, judge = self._walk, self._judge
        used = 0

        def before_tool(tool: BaseTool, args: dict[str, Any], tool_context: ToolContext) -> dict[str, Any] | None:
            nonlocal used
            if tool.name == ANSWER_TOOL:
                return None
            if used >= judge.settings.adjudicator_max_tool_calls:
                return {"error": "No more checks for this claim: rule on the evidence you have."}
            used += 1
            return None

        async def after_tool(
            tool: BaseTool, args: dict[str, Any], tool_context: ToolContext, tool_response: dict[str, Any]
        ) -> None:
            if tool.name != ANSWER_TOOL:
                call, line = tools.describe(tool.name, args, tool_response)
                await walk.log("adjudicator", line, tool=call)

        return LlmAgent(
            name="adjudicator",
            model=judge.caller.metered(judge.fast),
            static_instruction=f"{adjudicator.instruction().rstrip()}\n\n{TOOLS_NOTE}",
            tools=tools.tools_for(screen),
            output_schema=adjudicator.Verdict,
            include_contents="none",
            generate_content_config=types.GenerateContentConfig(temperature=0),
            before_tool_callback=before_tool,
            after_tool_callback=after_tool,
        )

    async def _ask(self, ctx: Context, agent: LlmAgent, parts: list[types.Part]) -> Any:
        """Run the agent as a child node: once, again on an unusable answer; ModelError when there's still none."""
        last: BaseException | None = None
        for _ in range(2):
            try:
                answer = await ctx.run_node(agent, node_input=types.Content(role="user", parts=parts))
            except DynamicNodeFailError as failed:
                if isinstance(failed.error, ModelError):
                    # Out of budget or time: asking again won't help.
                    raise failed.error from None
                log.warning("%s: unusable answer (%s)", agent.name, failed.error)
                last = failed.error
                continue
            if answer is not None:
                return answer
            last = ValueError("empty answer")
        raise ModelError(f"no usable answer ({type(last).__name__})") from last
