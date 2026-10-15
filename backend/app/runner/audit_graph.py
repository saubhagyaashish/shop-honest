"""The live audit as an ADK agent graph.

audit (Workflow), one run per live audit, over the steps in steps.py:

    START → navigate ──"failed"──▶ finish     journey.walk() in a fresh browser; every screen it hands to
              ▼ "walked"                       analyse() is judged meanwhile by screen_review (review_graph.py)
            collect_reviews                   the model reviews still running, within the time limit
              ▼
            summarise                         the Adjudicator's closing line and the model usage
              ▼
            report                            the Reporter: trust score, money, law

A step that fails stores its error and ends the graph; run() then raises it, so
the runner turns it into the same message as without the graph. Cancellation
(the audit taken over, or the server stopping) passes straight through.
"""

from typing import Any

from google.adk.agents import Context
from google.adk.runners import InMemoryRunner
from google.adk.workflow import START, Workflow, node
from google.genai import types

from app.models.call import APP
from app.runner.steps import LiveAudit


class AuditGraph:
    def __init__(self, audit: LiveAudit) -> None:
        self._audit = audit
        self._error: Exception | None = None
        self._report: dict[str, Any] | None = None
        self.workflow = self._build()

    async def run(self) -> dict[str, Any]:
        """The report, or the error a step stopped on."""
        runner = InMemoryRunner(node=self.workflow, app_name=APP)
        session = await runner.session_service.create_session(app_name=APP, user_id="audit")
        message = types.Content(role="user", parts=[types.Part(text=self._audit.target_url)])
        async for _ in runner.run_async(user_id="audit", session_id=session.id, new_message=message):
            pass
        if self._error is not None:
            raise self._error
        assert self._report is not None, "the audit graph ended without a report"
        return self._report

    def _build(self) -> Workflow:
        audit = self._audit

        @node
        async def navigate(ctx: Context) -> None:
            try:
                await audit.navigate()
            except Exception as err:
                self._error = err
                ctx.route = "failed"
                return
            ctx.route = "walked"

        @node
        async def collect_reviews() -> None:
            await self._step(audit.collect_reviews)

        @node
        async def summarise() -> None:
            await self._step(audit.summarise)

        @node
        async def report() -> None:
            self._report = await self._step(audit.report)

        @node
        async def finish() -> None:
            return None

        return Workflow(
            name="audit",
            edges=[
                (START, navigate),
                (navigate, {"walked": collect_reviews, "failed": finish}),
                (collect_reviews, summarise, report),
            ],
        )

    async def _step(self, step: Any) -> Any:
        """Run a step after navigation; a failure is kept for run() to raise, and later steps are skipped."""
        if self._error is not None:
            return None
        try:
            return await step()
        except Exception as err:
            self._error = err
            return None
