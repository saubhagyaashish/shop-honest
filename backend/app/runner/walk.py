"""What a journey drives during a live audit: captures, prices, steps and narration.

After every capture the rule-based checks run over everything seen so far,
so findings stream out as soon as their evidence exists.
"""

from collections.abc import Awaitable, Callable
from typing import Any

from playwright.async_api import Page

from app.agents.checks import ALL_CHECKS, Evidence
from app.browser.capture import Capture, read_signals, screenshot
from app.browser.session import RequestGuard
from app.config import Settings
from app.contract.models import JourneyStep
from app.knowledge import Knowledge
from app.stores.frames import FrameStore

Emit = Callable[[dict[str, Any]], Awaitable[None]]


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

    async def log(self, agent: str, message: str) -> None:
        await self._emit({"type": "agent.log", "agent": agent, "message": message})

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
        shot = self._frames.save(self.audit_id, self._n, jpeg)
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
        block = capture.signals.get("priceBlock") or {}
        if block.get("price"):
            total = block["price"] + sum(d["amount"] for d in capture.signals.get("feeDisclosures", []))
            await self._emit({"type": "price.observed", "step": capture.step, "label": "Product page", "total": inr(total)})

    async def price_from_summary(self, capture: Capture, label: str) -> None:
        total = ((capture.signals.get("summary") or {}).get("total") or {}).get("amount")
        if total is not None:
            await self._emit({"type": "price.observed", "step": capture.step, "label": label, "total": inr(total)})

    async def check(self) -> None:
        """Run every check over what's been seen so far and stream any new findings."""
        seen = {f["id"] for f in self.findings}
        for check in ALL_CHECKS:
            for finding in check(self.evidence, self._knowledge):
                if finding["id"] in seen:
                    continue
                seen.add(finding["id"])
                self.findings.append(finding)
                await self.log(finding["detectedBy"], f"{finding['title']}.")
                await self._emit({"type": "finding", "finding": finding})
