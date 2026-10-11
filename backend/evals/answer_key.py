"""How well live audits find the planted patterns (shared/answer_key.json).

    uv run python -m evals.answer_key [--provider replay|ollama|gemini] [--runs 3] [--base URL] [--linger 2]

Runs live audits of every demo store and matches findings to the answer key by
(pattern, step). Recall = planted patterns found; a finding that matches
nothing is a false alarm (any finding on Store B is one). "Review" counts the
planted claims that should go to human review and did. Model output varies,
so --runs repeats each store and reports the spread.

Accuracy is only claimed with Gemini (ADR-0003); local-model numbers are for
development. Results are also saved to var/evals/.
"""

import argparse
import asyncio
import json
import logging
import re
import statistics
import sys
import tempfile
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from app.config import BACKEND_DIR, REPO_DIR, Settings
from scripts.live import run_live, serve_dist

KEY = json.loads((REPO_DIR / "shared" / "answer_key.json").read_text(encoding="utf-8"))


def score(store: str, findings: list[dict[str, Any]]) -> dict[str, Any]:
    expected = KEY[store]["findings"]
    acceptable = {(a["patternId"], a["step"]) for a in KEY[store].get("alsoAcceptable", [])}
    unused = list(findings)
    hits, review_expected, review_agreed, missed = 0, 0, 0, []
    for entry in expected:
        candidates = [f for f in unused if (f["patternId"], f["step"]) == (entry["patternId"], entry["step"])]
        match = next((f for f in candidates if f["status"] == entry["status"]), candidates[0] if candidates else None)
        if entry["status"] == "needs_review":
            review_expected += 1
        if match is None:
            missed.append(f"{entry['patternId']}@{entry['step']}")
            continue
        unused.remove(match)
        hits += 1
        if entry["status"] == "needs_review" and match["status"] == "needs_review":
            review_agreed += 1
    return {
        "expected": len(expected),
        "found": len(findings),
        "hits": hits,
        "missed": missed,
        "false_alarms": [
            f"{f['patternId']}@{f['step']} ({f['status']}): {f['title']}"
            for f in unused
            if (f["patternId"], f["step"]) not in acceptable
        ],
        "extras": [f"{f['patternId']}@{f['step']} ({f['status']})" for f in unused if (f["patternId"], f["step"]) in acceptable],
        "review_expected": review_expected,
        "review_agreed": review_agreed,
    }


async def evaluate(base: str, settings: Settings, runs: int) -> dict[str, list[dict[str, Any]]]:
    results: dict[str, list[dict[str, Any]]] = {store: [] for store in KEY}
    for n in range(runs):
        for store in KEY:
            with tempfile.TemporaryDirectory() as tmp:
                run = await run_live(
                    f"{base}/demo/{store}/p/sonicbuds-pro", settings.model_copy(update={"frames_dir": Path(tmp)})
                )
            last = run.events[-1]
            if last["type"] != "audit.completed":
                raise SystemExit(f"{store}: {last}")
            result = score(store, last["report"]["findings"])
            result["blocked"] = next((s["step"] for s in last["report"]["steps"] if s.get("status") == "blocked"), None)
            result["seconds"] = round(run.times[-1], 1)
            result["tokens_in"], result["tokens_out"] = USAGE.take()
            results[store].append(result)
            alarms = len(result["false_alarms"])
            print(f"  run {n + 1}/{runs} {store}: {result['hits']}/{result['expected']} found, {alarms} false alarms")
    return results


class Usage(logging.Handler):
    """Collects the model usage the runner logs at the end of each live audit."""

    LINE = re.compile(r"model usage: (\d+) calls, (\d+) input tokens, (\d+) output tokens")

    def __init__(self) -> None:
        super().__init__(logging.INFO)
        self.tokens_in = self.tokens_out = 0

    def emit(self, record: logging.LogRecord) -> None:
        if m := self.LINE.search(record.getMessage()):
            self.tokens_in += int(m.group(2))
            self.tokens_out += int(m.group(3))

    def take(self) -> tuple[int, int]:
        out = (self.tokens_in, self.tokens_out)
        self.tokens_in = self.tokens_out = 0
        return out


USAGE = Usage()
logging.getLogger("app.runner.runner").addHandler(USAGE)
logging.getLogger("app.runner.runner").setLevel(logging.INFO)


def show(results: dict[str, list[dict[str, Any]]], label: str) -> None:
    print(f"\n{label}")
    print(
        f"{'store':<9} {'recall (min/median/max)':>24} {'false alarms':>13} {'review':>7}  {'blocked at':<10}  missed (any run)"
    )
    for store, runs in results.items():
        r0 = runs[0]
        recall = [r["hits"] for r in runs]
        spread = f"{min(recall)}/{statistics.median(recall):g}/{max(recall)} of {r0['expected']}" if r0["expected"] else "n/a"
        alarms = sum(len(r["false_alarms"]) for r in runs)
        review = (
            f"{sum(r['review_agreed'] for r in runs)}/{sum(r['review_expected'] for r in runs)}" if r0["review_expected"] else "-"
        )
        missed = ", ".join(sorted({m for r in runs for m in r["missed"]})) or "-"
        print(f"{store:<9} {spread:>24} {alarms:>13} {review:>7}  {r0['blocked'] or '-':<10}  {missed}")
        for alarm in sorted({a for r in runs for a in r["false_alarms"]}):
            print(f"          FALSE ALARM: {alarm}")
        for extra in sorted({e for r in runs for e in r["extras"]}):
            print(f"          also found (acceptable, on a planted element): {extra}")
        tokens_in = statistics.mean(r["tokens_in"] for r in runs)
        tokens_out = statistics.mean(r["tokens_out"] for r in runs)
        seconds = statistics.mean(r["seconds"] for r in runs)
        if tokens_in or tokens_out:
            print(f"          per audit: {tokens_in:,.0f} input + {tokens_out:,.0f} output tokens, {seconds:.0f} s")


def save(results: dict[str, Any], settings: Settings, runs: int) -> Path:
    out = BACKEND_DIR / "var" / "evals" / f"{settings.model_provider}-{datetime.now(UTC):%Y%m%d-%H%M%S}.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    meta = {
        "provider": settings.model_provider,
        "model": model_label(settings),
        "runs": runs,
        "at": datetime.now(UTC).isoformat(),
    }
    out.write_text(json.dumps({**meta, "results": results}, indent=2) + "\n", encoding="utf-8")
    return out


def model_label(settings: Settings) -> str:
    from app.models import describe

    return describe(settings)


async def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument(
        "--provider", choices=["replay", "ollama", "gemini"], help="Overrides MODEL_PROVIDER (replay = measured only)"
    )
    parser.add_argument("--runs", type=int, default=1)
    parser.add_argument("--base", help="A running web app (default: serve web/dist)")
    parser.add_argument("--linger", type=float, default=2.0)
    args = parser.parse_args()
    overrides: dict[str, Any] = {"nav_linger_s": args.linger}
    if args.provider:
        overrides["model_provider"] = args.provider
    settings = Settings(**overrides)
    label = f"{model_label(settings)} · {args.runs} run{'s' if args.runs != 1 else ''} per store"
    print(f"Evaluating with {label}…")
    if args.base:
        results = await evaluate(args.base.rstrip("/"), settings, args.runs)
    else:
        with serve_dist() as base:
            results = await evaluate(base, settings, args.runs)
    show(results, label)
    print(f"\nSaved {save(results, settings, args.runs)}")
    sys.exit(1 if any(r["false_alarms"] for runs in results.values() for r in runs) else 0)


if __name__ == "__main__":
    asyncio.run(main())
