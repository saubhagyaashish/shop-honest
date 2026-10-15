"""The steps of a live audit: navigate, collect the model reviews, summarise, report.

AuditRunner runs them in order, or as the nodes of the audit agent graph
(audit_graph.py) when settings.agent_graph is on. Either way the runner keeps
what surrounds an audit: the heartbeat, takeover, the event log and turning
failures into messages.
"""

import asyncio
import logging
from typing import TYPE_CHECKING, Any

from playwright.async_api import Error as PlaywrightError

from app.agents.judge import Judge
from app.agents.reporter import build_report
from app.browser.session import browser_page
from app.browser.url_guard import Resolver
from app.config import Settings
from app.knowledge import Knowledge
from app.prices.history import PriceHistory
from app.runner.walk import Emit, Walk
from app.stores.events import now_iso
from app.stores.frames import FrameStore

if TYPE_CHECKING:
    from app.journeys import Journey

log = logging.getLogger(__name__)


class LiveAudit:
    def __init__(
        self,
        *,
        audit_id: str,
        target_url: str,
        started_at: str,
        journey: "Journey",
        settings: Settings,
        knowledge: Knowledge,
        judge: Judge | None,
        frames: FrameStore,
        resolver: Resolver,
        prices: PriceHistory | None,
        emit: Emit,
        deadline: float,
    ) -> None:
        self.audit_id = audit_id
        self.target_url = target_url
        self.started_at = started_at
        self.journey = journey
        self.settings = settings
        self.knowledge = knowledge
        self.judge = judge
        self.frames = frames
        self.resolver = resolver
        self.prices = prices
        self.emit = emit
        # Event-loop time by which the whole audit must be done.
        self.deadline = deadline
        # Set once navigation starts; the runner cancels its model reviews when the audit ends.
        self.walk: Walk | None = None

    async def run(self) -> dict[str, Any]:
        """Every step in order; the report."""
        await self.navigate()
        await self.collect_reviews()
        await self.summarise()
        return await self.report()

    async def navigate(self) -> None:
        """Walk the journey in a fresh browser. Model reviews of the screens run in the background meanwhile."""
        async with asyncio.timeout_at(self.deadline):
            async with browser_page(self.settings, self.resolver) as (page, guard):
                walk = self.walk = Walk(
                    audit_id=self.audit_id,
                    target_url=self.target_url,
                    page=page,
                    guard=guard,
                    frames=self.frames,
                    knowledge=self.knowledge,
                    settings=self.settings,
                    emit=self.emit,
                    judge=self.judge,
                    prices=self.prices,
                )
                await walk.log("navigator", "Launching a fresh browser: 1280×800, no cookies, not signed in.")
                try:
                    await self.journey.walk(walk)
                except PlaywrightError as err:
                    if not walk.steps:
                        raise
                    # Keep what was audited: the report covers the steps reached.
                    reason = "Left the approved site" if guard.blocked else "The page stopped responding"
                    log.warning("audit %s stopped at %s: %s", self.audit_id, walk.step, err)
                    await walk.log("navigator", f"Couldn't go further: {reason.lower()}. Reporting what I reached.")
                    await walk.blocked(reason)

    async def collect_reviews(self) -> None:
        """The browser is closed; model reviews may still be running. They get what's left of the time limit."""
        walk = self._walked()
        try:
            async with asyncio.timeout_at(self.deadline):
                await walk.drain()
        except TimeoutError:
            await walk.cancel_reviews()
            await walk.log("adjudicator", "Ran out of time before every screen was reviewed. Reporting what was decided.")

    async def summarise(self) -> None:
        walk, judge = self._walked(), self.judge
        await walk.log("adjudicator", closing_line(walk.findings, judge))
        if judge is not None:
            c = judge.caller
            log.info(
                "audit %s model usage: %d calls, %d input tokens, %d output tokens",
                self.audit_id,
                c.calls,
                c.tokens_in,
                c.tokens_out,
            )

    async def report(self) -> dict[str, Any]:
        walk = self._walked()
        await walk.log("reporter", "Building the audit report…")
        return build_report(
            audit_id=self.audit_id,
            target_url=self.target_url,
            started_at=self.started_at,
            completed_at=now_iso(),
            steps=walk.steps,
            findings=walk.findings,
            ev=walk.evidence,
            knowledge=self.knowledge,
        )

    def _walked(self) -> Walk:
        assert self.walk is not None, "navigate() first"
        return self.walk


def closing_line(findings: list[dict[str, Any]], judge: Judge | None) -> str:
    """The adjudicator's summary of who decided what in this run."""
    confirmed = sum(f["status"] == "confirmed" for f in findings)
    review = len(findings) - confirmed
    if judge is None:
        verdict = (
            f"{confirmed} finding{'s' if confirmed != 1 else ''} confirmed by measurement, "
            "each with a screenshot and a rule citation."
            if confirmed
            else "Every measured check passed: nothing to confirm."
        )
        return f"{verdict} Wording and design checks need a model's judgement and aren't part of this run."
    screens = judge.reviewed + judge.failed
    if judge.reviewed == 0:
        coverage = f"{judge.model_name} couldn't review any screen, so only the measured checks count in this run."
    elif judge.failed:
        coverage = (
            f"{judge.model_name} reviewed {judge.reviewed} of {screens} screens; the others count on the measured checks only."
        )
    else:
        reviewed = "the 1 screen" if screens == 1 else f"all {screens} screens"
        coverage = f"{judge.model_name} reviewed {reviewed} and its claims were checked against their evidence."
    if not findings:
        return f"Every check passed: nothing to confirm. {coverage}"
    counts = f"{confirmed} finding{'s' if confirmed != 1 else ''} confirmed"
    if review:
        counts += f", {review} sent to human review"
    return f"{counts}, each with a screenshot and a rule citation. {coverage}"
