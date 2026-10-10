"""Capture a screen: full-page screenshot plus the page signals (signals.js)."""

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from playwright.async_api import Page

from app.contract.models import JourneyStep

SIGNALS_JS = (Path(__file__).parent / "signals.js").read_text(encoding="utf-8")


@dataclass
class Capture:
    n: int
    step: JourneyStep
    label: str
    url: str
    screenshot_url: str
    signals: dict[str, Any] = field(default_factory=dict)


async def read_signals(page: Page) -> dict[str, Any]:
    return await page.evaluate(SIGNALS_JS)


async def screenshot(page: Page) -> bytes:
    return await page.screenshot(full_page=True, type="jpeg", quality=82)
