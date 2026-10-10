"""How well live audits find the planted patterns (shared/answer_key.json).

    uv run python -m evals.answer_key [--base URL] [--linger 2]

Runs a live audit per demo store and matches findings to the answer key by
(pattern, step). Recall = planted patterns found; precision = findings that
are planted (a finding on Store B is a false alarm). Exits 1 on any false alarm.
"""

import argparse
import asyncio
import json
import sys
import tempfile
from collections import Counter
from pathlib import Path

from app.config import REPO_DIR, Settings
from scripts.live import run_live, serve_dist

KEY = json.loads((REPO_DIR / "shared" / "answer_key.json").read_text(encoding="utf-8"))


def score(store: str, findings: list[dict]) -> dict:
    expected = Counter((f["patternId"], f["step"]) for f in KEY[store]["findings"])
    found = Counter((f["patternId"], f["step"]) for f in findings)
    hits = expected & found
    return {
        "store": store,
        "expected": sum(expected.values()),
        "found": sum(found.values()),
        "hits": sum(hits.values()),
        "missed": sorted((expected - found).elements()),
        "false_alarms": sorted((found - expected).elements()),
    }


async def evaluate(base: str, linger: float) -> list[dict]:
    results = []
    for store in KEY:
        with tempfile.TemporaryDirectory() as tmp:
            run = await run_live(f"{base}/demo/{store}/p/sonicbuds-pro", Settings(nav_linger_s=linger, frames_dir=Path(tmp)))
        last = run.events[-1]
        if last["type"] != "audit.completed":
            raise SystemExit(f"{store}: {last}")
        result = score(store, last["report"]["findings"])
        result["blocked"] = next((s["step"] for s in last["report"]["steps"] if s.get("status") == "blocked"), None)
        results.append(result)
    return results


def show(results: list[dict]) -> None:
    print(f"{'store':<9} {'recall':>8} {'precision':>10}  blocked at   missed")
    for r in results:
        recall = f"{r['hits']}/{r['expected']}" if r["expected"] else "n/a"
        precision = f"{r['hits']}/{r['found']}" if r["found"] else ("n/a" if not r["expected"] else "0/0")
        missed = ", ".join(f"{p}@{s}" for p, s in r["missed"]) or "-"
        print(f"{r['store']:<9} {recall:>8} {precision:>10}  {r['blocked'] or '-':<11}  {missed}")
        for p, s in r["false_alarms"]:
            print(f"          FALSE ALARM: {p}@{s}")


async def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base", help="A running web app (default: serve web/dist)")
    parser.add_argument("--linger", type=float, default=2.0)
    args = parser.parse_args()
    if args.base:
        results = await evaluate(args.base.rstrip("/"), args.linger)
    else:
        with serve_dist() as base:
            results = await evaluate(base, args.linger)
    show(results)
    sys.exit(1 if any(r["false_alarms"] for r in results) else 0)


if __name__ == "__main__":
    asyncio.run(main())
