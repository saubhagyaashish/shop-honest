"""Helpers for scripts that run real live audits in-process (record, evals, tests)."""

import http.server
import json
import threading
import time
from collections.abc import Iterator
from contextlib import contextmanager
from dataclasses import dataclass
from functools import partial
from pathlib import Path
from typing import Any

import httpx

from app.browser.url_guard import Resolver, system_resolver
from app.config import REPO_DIR, Settings
from app.main import create_app

DIST = REPO_DIR / "web" / "dist"


class SpaHandler(http.server.SimpleHTTPRequestHandler):
    """Static files from web/dist; any other path gets index.html, like Firebase Hosting's rewrite."""

    def send_head(self):  # type: ignore[override]
        if not Path(self.translate_path(self.path)).exists():
            self.path = "/index.html"
        return super().send_head()

    def log_message(self, *args: object) -> None:
        pass


@contextmanager
def serve_dist(directory: Path = DIST) -> Iterator[str]:
    """Serve the built web app on a free local port; yields its base URL."""
    if not (directory / "index.html").exists():
        raise SystemExit(f"{directory} isn't built. Run: npm --prefix web run build")
    server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), partial(SpaHandler, directory=str(directory)))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    try:
        yield f"http://127.0.0.1:{server.server_address[1]}"
    finally:
        server.shutdown()


@dataclass
class LiveRun:
    audit_id: str
    events: list[dict[str, Any]]
    # Seconds since the audit was created, per event.
    times: list[float]
    frames_dir: Path


async def run_live(target_url: str, settings: Settings, resolver: Resolver = system_resolver) -> LiveRun:
    """One live audit through the real API, with the time each event was written."""
    app = create_app(settings.model_copy(update={"enable_live": True}), resolver=resolver)
    log = app.state.events
    append = log.append
    stamps: list[float] = []
    t0 = time.monotonic()

    async def timed_append(audit_id: str, event: dict[str, Any]) -> int:
        stamps.append(time.monotonic() - t0)
        return await append(audit_id, event)

    log.append = timed_append
    try:
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://local", timeout=600) as client:
            res = await client.post("/api/audits", json={"targetUrl": target_url, "mode": "live"})
            res.raise_for_status()
            audit_id = res.json()["auditId"]
            body = (await client.get(f"/api/audits/{audit_id}/events")).text
    finally:
        await app.state.runner.shutdown()
    events = [json.loads(line[5:]) for line in body.splitlines() if line.startswith("data:")]
    return LiveRun(audit_id=audit_id, events=events, times=stamps[: len(events)], frames_dir=settings.frames_dir / audit_id)
