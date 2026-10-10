"""Save what the Navigator sees on each demo store as test fixtures.

Walks every BazaarNest store with the live journey (no checks, no API) and
writes tests/fixtures/signals-<store>.json: per capture, its step, URL and
signals. The unit tests for checks and the reporter run on these.

    uv run python -m scripts.capture_signals [--base http://localhost:5173]
"""

import argparse
import asyncio
import json
import tempfile
from pathlib import Path
from typing import Any

from app.browser.session import browser_page
from app.browser.url_guard import system_resolver
from app.config import Settings
from app.journeys.bazaarnest import BazaarNestJourney
from app.knowledge import load_knowledge
from app.runner.walk import Walk
from app.stores.frames import LocalFrameStore

FIXTURES = Path(__file__).resolve().parent.parent / "tests" / "fixtures"
STORES = ("store-a", "store-b", "store-c")


async def capture(base: str, store: str, settings: Settings) -> dict[str, Any]:
    async def emit(_: dict[str, Any]) -> None:
        pass

    with tempfile.TemporaryDirectory() as tmp:
        async with browser_page(settings, system_resolver) as (page, guard):
            walk = Walk(
                audit_id="fixture",
                target_url=f"{base}/demo/{store}/p/sonicbuds-pro",
                page=page,
                guard=guard,
                frames=LocalFrameStore(Path(tmp)),
                knowledge=load_knowledge(settings.shared_dir),
                settings=settings,
                emit=emit,
            )
            await BazaarNestJourney().walk(walk)
    return {
        "addedItems": walk.evidence.added_items,
        "captures": {
            label: {"n": c.n, "step": c.step, "url": c.url.replace(base, "http://localhost:5173"), "signals": c.signals}
            for label, c in walk.evidence.captures.items()
        },
        "steps": walk.steps,
    }


async def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base", default="http://localhost:5173")
    args = parser.parse_args()
    settings = Settings(nav_linger_s=2)
    for store in STORES:
        data = await capture(args.base, store, settings)
        data = json.loads(json.dumps(data).replace(args.base, "http://localhost:5173"))
        out = FIXTURES / f"signals-{store}.json"
        out.write_text(json.dumps(data, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
        print(f"Wrote {out} ({len(data['captures'])} captures)")


if __name__ == "__main__":
    asyncio.run(main())
