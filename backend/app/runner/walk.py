"""What a journey drives during a live audit: captures, prices, steps and narration.

After every capture the measured checks run over everything seen so far, so
findings stream out as soon as their evidence exists. Screens the journey
hands to analyse() are also reviewed by the model (Pattern Analyst →
Adjudicator) in the background, so navigation doesn't wait for it.
"""

import asyncio
import logging
from collections.abc import Awaitable, Callable
from typing import TYPE_CHECKING, Any

from playwright.async_api import Page

from app.agents.checks import ALL_CHECKS, Evidence
from app.agents.findings import money
from app.browser.capture import Capture, read_signals, screenshot
from app.browser.session import RequestGuard
from app.config import Settings
from app.contract.models import JourneyStep
from app.knowledge import Knowledge
from app.prices.facts import MIN_WEEKS, price_facts
from app.prices.history import Observation, PriceHistory
from app.prices.keys import product_key
from app.stores.frames import FrameStore

if TYPE_CHECKING:
    from app.agents.judge import Judge
    from app.agents.review_graph import ReviewGraph

log = logging.getLogger(__name__)

Emit = Callable[[dict[str, Any]], Awaitable[None]]

# Measured findings that rest on checks validated only on stores we built: reading a page's structure (cart rows,
# checkboxes, summary rows), or assuming each variant has its own stock. On other sites a person confirms them.
REVIEW_ON_THIRD_PARTY = {"f-sneaked-item", "f-pre-ticked-subscription", "f-late-fees", "f-frozen-stock"}


def inr(amount: float) -> dict[str, Any]:
    return {"amount": amount, "currency": "INR"}


class Walk:
    def __init__(
        self,
        *,
        audit_id: str,
        target_url: str,
        page: Page,
        guard: RequestGuard,
        frames: FrameStore,
        knowledge: Knowledge,
        settings: Settings,
        emit: Emit,
        judge: "Judge | None" = None,
        prices: PriceHistory | None = None,
    ) -> None:
        self.audit_id = audit_id
        self.target_url = target_url
        self.page = page
        self.guard = guard
        self.settings = settings
        self.evidence = Evidence(captures={})
        self.steps: list[dict[str, Any]] = []
        self.findings: list[dict[str, Any]] = []
        self.step: JourneyStep | None = None
        self._frames = frames
        self._knowledge = knowledge
        self._emit = emit
        self._n = 0
        self.judge = judge
        self.prices = prices
        # A site we didn't build: structural checks were validated only on our stores (see add_finding).
        self.third_party = False
        self._reviews: set[asyncio.Task[None]] = set()
        # The screen_review agent graph (settings.agent_graph), built on the first screen it reviews.
        self._graph: ReviewGraph | None = None

    async def log(self, agent: str, message: str, tool: dict[str, str] | None = None) -> None:
        """A line of narration; `tool` is the tool call it reports, {"name", "input"}."""
        event: dict[str, Any] = {"type": "agent.log", "agent": agent, "message": message}
        if tool:
            event["tool"] = tool
        await self._emit(event)

    async def start_step(self, step: JourneyStep, url: str | None = None) -> None:
        self.step = step
        await self._emit({"type": "step.started", "step": step, "url": url or self.page.url})

    async def capture(self, label: str, *, primary: bool = True, check: bool = True) -> Capture:
        """Screenshot + signals for the current screen.

        `primary` makes it the step's picture in the report; `check=False` holds the checks
        back until the journey calls check() (so its narration comes first).
        """
        assert self.step is not None, "start_step() before capture()"
        await self.page.wait_for_timeout(250)
        jpeg = await screenshot(self.page)
        self._n += 1
        shot = await asyncio.to_thread(self._frames.save, self.audit_id, self._n, jpeg)
        capture = Capture(
            n=self._n, step=self.step, label=label, url=self.page.url, screenshot_url=shot, signals=await read_signals(self.page)
        )
        self.evidence.captures[label] = capture
        await self._emit({"type": "step.captured", "step": capture.step, "url": capture.url, "screenshotUrl": shot})
        if primary:
            self.mark_audited(capture)
        if check:
            await self.check()
        return capture

    def note_step(self, step: JourneyStep, capture: Capture) -> None:
        """Count a step as audited on an earlier screen (e.g. a product with no other variants)."""
        if not any(s["step"] == step for s in self.steps):
            self.steps.append({"step": step, "url": capture.url, "screenshotUrl": capture.screenshot_url, "status": "audited"})

    def mark_audited(self, capture: Capture) -> None:
        if not any(s["step"] == capture.step for s in self.steps):
            self.steps.append(
                {"step": capture.step, "url": capture.url, "screenshotUrl": capture.screenshot_url, "status": "audited"}
            )

    async def blocked(self, reason: str, capture: Capture | None = None) -> None:
        """The journey can't go on from the current step (a sign-in wall, a dead page)."""
        assert self.step is not None
        url = capture.url if capture else self.page.url
        event: dict[str, Any] = {"type": "step.blocked", "step": self.step, "url": url, "reason": reason}
        step: dict[str, Any] = {"step": self.step, "url": url, "status": "blocked", "blockedReason": reason}
        if capture:
            event["screenshotUrl"] = step["screenshotUrl"] = capture.screenshot_url
        self.steps = [s for s in self.steps if s["step"] != self.step] + [step]
        await self._emit(event)

    async def price_on_product_page(self, capture: Capture) -> None:
        block = capture.signals.get("priceBlock") or capture.signals.get("mainPrice") or {}
        if block.get("price"):
            total = block["price"] + sum(d["amount"] for d in capture.signals.get("feeDisclosures", []))
            await self._emit({"type": "price.observed", "step": capture.step, "label": "Product page", "total": inr(total)})
            await self._price_history(capture, block)

    async def _price_history(self, capture: Capture, block: dict[str, Any]) -> None:
        """Price Historian: what has this product really sold at? Then record today's price for future audits."""
        if self.prices is None:
            return
        key = product_key(capture.url)
        if block.get("mrp"):
            await self.log("price_historian", f"Looking up this product's price history in {self.prices.name}…")
            try:
                self.evidence.price_history = await self.prices.lookup(key)
            except Exception:
                log.warning("price history lookup failed for %s", key, exc_info=True)
                await self.log(
                    "price_historian", "Couldn't reach the price history, so the MRP claim can't be checked this time."
                )
            else:
                await self.log("price_historian", self._history_story(block))
                await self.check()
        try:
            await self.prices.record(
                Observation(key=key, price=block["price"], mrp=block.get("mrp"), currency="INR", audit_id=self.audit_id)
            )
        except Exception:
            log.warning("couldn't record the observed price for %s", key, exc_info=True)

    def _history_story(self, block: dict[str, Any]) -> str:
        history = self.evidence.price_history
        if history is None:
            return (
                "No price history for this product yet, so the MRP claim can't be checked. "
                "Recording today's price so future audits can."
            )
        facts = price_facts(block["price"], block["mrp"], history)
        if not facts.enough_history:
            return (
                f"Only {facts.weeks} weeks of prices so far; at least {MIN_WEEKS} are needed to judge the MRP claim. "
                "Recording today's."
            )
        mrp = money(block["mrp"])
        sold = f"{money(facts.lowest_sold)}–{money(facts.highest_sold)}"
        if facts.prior_mrp is not None and facts.mrp_changed_days_ago is not None:
            mrp_story = f"MRP {money(facts.prior_mrp)} until {facts.mrp_changed_days_ago} days ago, {mrp} since"
        else:
            mrp_story = f"MRP {mrp} throughout" if not facts.ever_sold_at_mrp else f"it has sold at the {mrp} MRP"
        return f"{facts.weeks} weeks of prices: sold at {sold}; {mrp_story}."

    async def price_from_summary(self, capture: Capture, label: str) -> None:
        total = ((capture.signals.get("summary") or {}).get("total") or {}).get("amount")
        if total is not None:
            await self._emit({"type": "price.observed", "step": capture.step, "label": label, "total": inr(total)})

    async def check(self) -> None:
        """Run every check over what's been seen so far and stream any new findings."""
        for check in ALL_CHECKS:
            for finding in check(self.evidence, self._knowledge):
                if any(f["id"] == finding["id"] for f in self.findings):
                    continue
                await self.log(finding["detectedBy"], f"{finding['title']}.")
                await self.add_finding(finding)

    async def add_finding(self, finding: dict[str, Any]) -> None:
        if self.third_party and finding["id"] in REVIEW_ON_THIRD_PARTY and finding["status"] == "confirmed":
            finding = {**finding, "status": "needs_review"}
            title = finding["title"]
            await self.log(
                "adjudicator", f'"{title}" relies on a check validated only on stores we built, so it goes to human review.'
            )
        self.findings.append(finding)
        await self._emit({"type": "finding", "finding": finding})

    async def screenshot(self, capture: Capture) -> bytes:
        jpeg = await asyncio.to_thread(self._frames.read, self.audit_id, capture.n)
        if jpeg is None:
            raise FileNotFoundError(f"frame {capture.n} of {self.audit_id}")
        return jpeg

    def analyse(self, capture: Capture) -> None:
        """Have the model review this screen in the background (no-op without a model)."""
        if self.judge is None:
            return
        task = asyncio.create_task(self._review(capture), name=f"review-{self.audit_id}-{capture.label}")
        self._reviews.add(task)
        task.add_done_callback(self._reviews.discard)

    async def drain(self) -> None:
        """Wait for every model review still running."""
        while self._reviews:
            await asyncio.gather(*list(self._reviews), return_exceptions=True)

    async def cancel_reviews(self) -> None:
        for task in list(self._reviews):
            task.cancel()
        await asyncio.gather(*list(self._reviews), return_exceptions=True)

    async def _review(self, capture: Capture) -> None:
        assert self.judge is not None
        try:
            if self.settings.agent_graph:
                if self._graph is None:
                    from app.agents.review_graph import ReviewGraph

                    self._graph = ReviewGraph(self, self.judge)
                await self._graph.review(capture)
            else:
                await self.judge.review(self, capture)
        except asyncio.CancelledError:
            raise
        except Exception:
            # A model problem must never sink the audit: the measured checks still stand.
            log.exception("review of %s failed", capture.label)
            self.judge.failed += 1
            await self.log("pattern_analyst", "Something went wrong reading this screen. The measured checks still apply.")
