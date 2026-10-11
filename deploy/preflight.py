"""Pre-flight check of the deployed site before a demo (about 2–3 minutes, 2 live audits).

    uv run --project backend python deploy/preflight.py [--no-live]

Checks the site and the API, the three recorded runs, a live audit of the rigged
store (Gemini + BigQuery) and a live logged-out audit of a real store. Live
audits count toward the per-visitor limit; run `deploy/judging.sh on` first on
judging days.
"""

import argparse
import json
import sys
import time
from collections.abc import Callable
from typing import Any

import httpx

SITE = "https://shop-honest-ai.web.app"
API = "https://shop-honest-api-384726360574.asia-south1.run.app"
REAL_STORE = "https://automationexercise.com/product_details/1"


def audit(client: httpx.Client, target: str, live: bool) -> tuple[list[dict[str, Any]], float]:
    started = time.time()
    res = client.post(f"{SITE}/api/audits", json={"targetUrl": target, "mode": "live" if live else "auto"})
    res.raise_for_status()
    audit_id = res.json()["auditId"]
    if not live:
        client.post(f"{SITE}/api/audits/{audit_id}/fast-forward")
    events: list[dict[str, Any]] = []
    with client.stream("GET", f"{API}/api/audits/{audit_id}/events", timeout=httpx.Timeout(30, read=240)) as stream:
        for line in stream.iter_lines():
            if line.startswith("data:"):
                events.append(json.loads(line[5:]))
                if events[-1]["type"] in ("audit.completed", "audit.failed"):
                    break
    return events, time.time() - started


def report_of(events: list[dict[str, Any]]) -> dict[str, Any]:
    if not events or events[-1]["type"] != "audit.completed":
        raise AssertionError(events[-1].get("error", "no result") if events else "no events")
    return events[-1]["report"]


def counts(report: dict[str, Any]) -> tuple[int, int]:
    confirmed = sum(f["status"] == "confirmed" for f in report["findings"])
    return confirmed, len(report["findings"]) - confirmed


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--no-live", action="store_true", help="Skip the two live audits")
    args = parser.parse_args()
    results: list[tuple[str, bool, str]] = []

    def check(name: str, run: Callable[[], str]) -> None:
        try:
            results.append((name, True, run()))
        except Exception as err:
            results.append((name, False, f"{type(err).__name__}: {err}"))
        _, ok, detail = results[-1]
        print(f"{'PASS' if ok else 'FAIL'}  {name}: {detail}", flush=True)

    with httpx.Client(timeout=60, follow_redirects=True) as client:

        def health() -> str:
            site = client.get(f"{SITE}/api/health").json()
            direct = client.get(f"{API}/api/health").json()
            assert site["ok"] and direct["ok"] and site["version"] == direct["version"], (site, direct)
            assert client.get(SITE).status_code == 200
            return f"site and API up, version {site['version']}"

        def recorded(store: str, expect: Callable[[dict[str, Any]], str]) -> Callable[[], str]:
            def run() -> str:
                events, seconds = audit(client, f"{SITE}/demo/{store}/p/sonicbuds-pro", live=False)
                return f"{expect(report_of(events))} ({seconds:.0f}s with skip)"

            return run

        def rigged(report: dict[str, Any]) -> str:
            confirmed, review = counts(report)
            assert confirmed >= 8 and review >= 1, (confirmed, review)
            return f"{confirmed} confirmed, {review} for review"

        def honest(report: dict[str, Any]) -> str:
            assert not report["findings"], [f["title"] for f in report["findings"]]
            return "no findings"

        def walled(report: dict[str, Any]) -> str:
            last = report["steps"][-1]
            assert (last["step"], last.get("status")) == ("checkout", "blocked"), last
            return f"stopped at checkout ({last.get('blockedReason')}), {counts(report)[0]} confirmed before it"

        check("Site and API", health)
        check("Recorded run, Store A", recorded("store-a", rigged))
        check("Recorded run, Store B", recorded("store-b", honest))
        check("Recorded run, Store C", recorded("store-c", walled))

        if not args.no_live:

            def live_rigged() -> str:
                events, seconds = audit(client, f"{SITE}/demo/store-a/p/sonicbuds-pro", live=True)
                report = report_of(events)
                logs = " ".join(e.get("message", "") for e in events if e["type"] == "agent.log")
                assert "BigQuery" in logs, "the Price Historian didn't use BigQuery"
                assert "couldn't review" not in logs, "the model couldn't review a screen"
                frame = next(e["screenshotUrl"] for e in events if e["type"] == "step.captured")
                assert client.get(f"{SITE}{frame}").status_code == 200, f"frame {frame} not served"
                confirmed, review = counts(report)
                assert confirmed >= 6, (confirmed, review)
                return f"{confirmed} confirmed, {review} for review, in {seconds:.0f}s; BigQuery and frames OK"

            def live_real() -> str:
                events, seconds = audit(client, REAL_STORE, live=True)
                report = report_of(events)
                last = report["steps"][-1]
                stopped = (last["step"], last.get("status"), last.get("blockedReason"))
                assert stopped == ("checkout", "blocked", "Sign-in required"), last
                return f"logged out: reached the cart, stopped at the sign-in wall, in {seconds:.0f}s"

            check("Live audit, Store A (Gemini)", live_rigged)
            check("Live audit, real store (AutomationExercise)", live_real)

    failed = [name for name, ok, _ in results if not ok]
    print(f"\n{len(results) - len(failed)}/{len(results)} checks passed" + (f"; failed: {', '.join(failed)}" if failed else ""))
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
