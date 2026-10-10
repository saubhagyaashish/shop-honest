import json
from collections.abc import AsyncIterator
from pathlib import Path
from typing import TYPE_CHECKING

import httpx
import pytest
from jsonschema import Draft7Validator

from app.config import REPO_DIR, Settings
from app.main import create_app

if TYPE_CHECKING:
    from app.agents.checks import Evidence

SCHEMA = json.loads((REPO_DIR / "shared" / "contract.schema.json").read_text(encoding="utf-8"))
EVENT_VALIDATOR = Draft7Validator({"$ref": "#/definitions/AuditEvent", "definitions": SCHEMA["definitions"]})

STORE_A = "http://localhost:5173/demo/store-a/p/sonicbuds-pro"
STORE_B = "http://localhost:5173/demo/store-b/p/sonicbuds-pro"


async def fake_resolver(host: str) -> list[str]:
    return {"localhost": ["127.0.0.1"], "shop-honest.web.app": ["199.36.158.100"]}.get(host, ["93.184.215.14"])


def make_settings(**overrides: object) -> Settings:
    return Settings(_env_file=None, **{"replay_speed": 0, "enable_live": False, **overrides})


@pytest.fixture
def settings() -> Settings:
    return make_settings()


@pytest.fixture
async def client(settings: Settings) -> AsyncIterator[httpx.AsyncClient]:
    app = create_app(settings, resolver=fake_resolver)
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as c:
        yield c
    await app.state.runner.shutdown()


def parse_sse(text: str) -> list[tuple[int, dict]]:
    """[(id, event)] from a text/event-stream body, ignoring comments/pings."""
    out = []
    for block in text.replace("\r\n", "\n").split("\n\n"):
        fields = dict(line.split(": ", 1) for line in block.split("\n") if line and not line.startswith(":") and ": " in line)
        if "data" in fields:
            out.append((int(fields["id"]), json.loads(fields["data"])))
    return out


async def run_audit(client: httpx.AsyncClient, url: str = STORE_A) -> tuple[str, list[tuple[int, dict]]]:
    res = await client.post("/api/audits", json={"targetUrl": url})
    assert res.status_code == 202, res.text
    audit_id = res.json()["auditId"]
    stream = await client.get(f"/api/audits/{audit_id}/events")
    assert stream.status_code == 200
    assert stream.headers["content-type"].startswith("text/event-stream")
    return audit_id, parse_sse(stream.text)


FIXTURES = Path(__file__).parent / "fixtures"


def load_walk(store: str) -> tuple["Evidence", list[dict]]:
    """Evidence and steps from a real walk of a demo store (tests/fixtures, made by scripts/capture_signals.py)."""
    from app.agents.checks import Evidence
    from app.browser.capture import Capture

    data = json.loads((FIXTURES / f"signals-{store}.json").read_text(encoding="utf-8"))
    captures = {
        label: Capture(
            n=c["n"], step=c["step"], label=label, url=c["url"], screenshot_url=f"/frames/{c['n']}.jpg", signals=c["signals"]
        )
        for label, c in data["captures"].items()
    }
    return Evidence(captures=captures, added_items=data["addedItems"]), data["steps"]
