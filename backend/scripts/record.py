"""Record a real live audit of a demo store as a replayable recording.

    uv run python -m scripts.record store-a [store-c …] [--base URL] [--publish]

Without --base it serves web/dist (build it first). The recording's
screenshots are referenced as /recordings/<store>/<n>.jpg:

- default: writes var/recordings/<store>.json and the frames to var/recordings/<store>/
- --publish: writes app/replay/recordings/<store>.json (replacing the mock-based
  one) and the frames to web/public/recordings/<store>/, ready to commit and deploy

With a model, the Fixer's plan for the run's findings is recorded too ("fixPlan"),
so "Fix it" on the replay answers without asking a model.
"""

import argparse
import asyncio
import json
import shutil
import tempfile
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from app.agents import fixer
from app.config import BACKEND_DIR, REPO_DIR, Settings
from app.knowledge import load_knowledge
from app.models import model_set
from app.models.call import ModelCaller
from app.replay.player import origin_of
from scripts.live import run_live, serve_dist

PLACEHOLDERS = {"auditId": "__AUDIT_ID__", "origin": "__ORIGIN__"}


def to_recording(store: str, target_url: str, run: Any, fix_plan: fixer.FixPlan | None = None) -> dict[str, Any]:
    raw = json.dumps(run.events, ensure_ascii=False)
    raw = raw.replace(f"/api/audits/{run.audit_id}/frames/", f"/recordings/{store}/")
    raw = raw.replace(run.audit_id, PLACEHOLDERS["auditId"]).replace(origin_of(target_url), PLACEHOLDERS["origin"])
    events = json.loads(raw)
    delays = [0, *(round((b - a) * 1000) for a, b in zip(run.times, run.times[1:], strict=False))]
    out = {
        "version": 1,
        "store": store,
        "pathPrefix": f"/demo/{store}/",
        "source": "live",
        "recordedAt": datetime.now(UTC).isoformat().replace("+00:00", "Z"),
        "placeholders": PLACEHOLDERS,
        "events": [{"delayMs": d, "event": e} for d, e in zip(delays, events, strict=True)],
    }
    if fix_plan is not None:
        out["fixPlan"] = [c.model_dump() for c in fix_plan.changes]
    return out


async def record(base: str, store: str, recordings_dir: Path, frames_root: Path, linger: float) -> Path:
    target = f"{base}/demo/{store}/p/sonicbuds-pro"
    with tempfile.TemporaryDirectory() as tmp:
        settings = Settings(nav_linger_s=linger, frames_dir=Path(tmp))
        run = await run_live(target, settings)
        if run.events[-1]["type"] != "audit.completed":
            raise SystemExit(f"{store}: the live audit didn't complete: {run.events[-1]}")
        return save(store, target, run, recordings_dir, frames_root, await plan_fixes(target, run, settings))


async def plan_fixes(target: str, run: Any, settings: Settings) -> fixer.FixPlan | None:
    """The Fixer's plan for the run's findings, when there are findings and a model to ask."""
    knowledge, models = load_knowledge(settings.shared_dir), model_set(settings)
    findings = run.events[-1]["report"]["findings"]
    current = fixer.current_settings(knowledge, target)
    if not (findings and models and current is not None):
        return None
    plan = await fixer.write_plan(ModelCaller(settings), models, findings, knowledge, current)
    kept = fixer.apply_plan(plan, findings, knowledge, current)
    print(f"Fixer: {len(kept.changes)} changes for {len(findings) - len(kept.unfixed)} of {len(findings)} findings")
    return plan


def save(
    store: str, target: str, run: Any, recordings_dir: Path, frames_root: Path, fix_plan: fixer.FixPlan | None = None
) -> Path:
    frames = frames_root / store
    shutil.rmtree(frames, ignore_errors=True)
    shutil.copytree(run.frames_dir, frames)
    recordings_dir.mkdir(parents=True, exist_ok=True)
    out = recordings_dir / f"{store}.json"
    recording = to_recording(store, target, run, fix_plan)
    out.write_text(json.dumps(recording, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    findings = len(run.events[-1]["report"]["findings"])
    print(f"Wrote {out} ({len(run.events)} events, {findings} findings) and {len(list(frames.iterdir()))} frames to {frames}")
    return out


async def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("stores", nargs="+", choices=["store-a", "store-b", "store-c"])
    parser.add_argument("--base", help="A running web app, e.g. http://localhost:5173 (default: serve web/dist)")
    parser.add_argument("--publish", action="store_true")
    parser.add_argument("--linger", type=float, default=8.0, help="Seconds on the product page before the reload")
    args = parser.parse_args()
    if args.publish:
        recordings_dir, frames_root = BACKEND_DIR / "app" / "replay" / "recordings", REPO_DIR / "web" / "public" / "recordings"
    else:
        recordings_dir = frames_root = BACKEND_DIR / "var" / "recordings"

    async def record_all(base: str) -> None:
        for store in args.stores:
            await record(base, store, recordings_dir, frames_root, args.linger)

    if args.base:
        await record_all(args.base.rstrip("/"))
    else:
        with serve_dist() as base:
            await record_all(base)


if __name__ == "__main__":
    asyncio.run(main())
