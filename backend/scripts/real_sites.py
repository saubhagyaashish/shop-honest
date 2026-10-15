"""Live audits of real stores, with everything the agents saw and said recorded for a person to review.

    uv run python -m scripts.real_sites URL [URL …] [--provider ollama|gemini|replay] [--linger 8] [--out DIR]

The default provider is the local model (Ollama), so nothing is spent. Per audit, in var/real-sites/<run>/<n>-<host>/:

  summary.md        how far the journey got, the findings, the agents' narration, model calls and timing
  events.jsonl      every event the audit emitted, with seconds since it started
  frames/           every screenshot, in order
  screens/          what the agent read on each screen: URL, title, the measured signals, and the page's visible text
  controls.jsonl    the clickable controls the general navigator listed on each page
  model.jsonl       every model call: the agent, the prompt, the images sent, the answer (text or tool call), tokens, time
  blocked.jsonl     requests the URL guard refused
  log.txt           warnings and errors from the backend and the libraries
  report.json       the final report (or the failure)

and summary.md for the whole run.
"""

import argparse
import asyncio
import json
import logging
import re
import shutil
import time
from collections import Counter
from contextlib import contextmanager
from datetime import datetime
from pathlib import Path
from typing import Any
from urllib.parse import urlsplit

from app.browser.session import RequestGuard
from app.config import BACKEND_DIR, Settings
from app.journeys.generic import GenericJourney
from app.models import call as model_call
from app.models.metered import MeteredLlm
from app.runner.walk import Walk
from scripts.live import run_live

# Visible page text kept per screen (characters).
TEXT_LIMIT = 60_000


class Recorder:
    """Where the current audit's records go. Audits run one at a time, so one folder is current."""

    def __init__(self) -> None:
        self.folder: Path | None = None
        self.t0 = 0.0

    def start(self, folder: Path) -> None:
        self.folder = folder
        self.t0 = time.monotonic()
        (folder / "screens").mkdir(parents=True, exist_ok=True)

    def now(self) -> float:
        return round(time.monotonic() - self.t0, 2)

    def append(self, name: str, record: dict[str, Any]) -> None:
        if self.folder is not None:
            with (self.folder / name).open("a", encoding="utf-8") as f:
                f.write(json.dumps({"t": self.now(), **record}, ensure_ascii=False) + "\n")

    def write(self, name: str, data: Any) -> None:
        if self.folder is not None:
            (self.folder / name).write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


REC = Recorder()


def install_hooks() -> None:
    """Wrap the points where the agents see and say things, so each is recorded as it happens."""
    capture = Walk.capture

    async def recorded_capture(self: Walk, label: str, *, primary: bool = True, check: bool = True):  # type: ignore[no-untyped-def]
        c = await capture(self, label, primary=primary, check=check)
        try:
            title = await self.page.title()
            text = await self.page.evaluate("() => document.body ? document.body.innerText : ''")
        except Exception as err:
            title, text = "", f"(couldn't read the page: {err})"
        screen = {"n": c.n, "step": c.step, "label": c.label, "url": c.url, "title": title, "signals": c.signals}
        REC.write(f"screens/{c.n:02d}-{c.label}.json", {**screen, "text": text[:TEXT_LIMIT]})
        return c

    Walk.capture = recorded_capture  # type: ignore[method-assign]

    controls = GenericJourney._controls

    async def recorded_controls(self: GenericJourney, page):  # type: ignore[no-untyped-def]
        found = await controls(self, page)
        REC.append("controls.jsonl", {"url": page.url, "count": len(found), "controls": found})
        return found

    GenericJourney._controls = recorded_controls  # type: ignore[method-assign]

    allows = RequestGuard.allows

    async def recorded_allows(self: RequestGuard, url: str, navigation: bool) -> bool:
        ok = await allows(self, url, navigation)
        if not ok:
            REC.append("blocked.jsonl", {"url": url, "navigation": navigation})
        return ok

    RequestGuard.allows = recorded_allows  # type: ignore[method-assign]

    # Agents inside the agent graph call the model through MeteredLlm.
    generate = MeteredLlm.generate_content_async

    async def recorded_generate(self: MeteredLlm, llm_request, stream: bool = False):  # type: ignore[no-untyped-def]
        start = time.monotonic()
        request = describe_request(llm_request)
        answer: list[dict[str, Any]] = []
        usage: dict[str, int] = {}
        error = None
        try:
            async for response in generate(self, llm_request, stream):
                answer += describe_parts(response.content.parts if response.content else [])
                if u := response.usage_metadata:
                    out = (u.candidates_token_count or 0) + (u.thoughts_token_count or 0)
                    usage = {"in": u.prompt_token_count or 0, "out": out}
                yield response
        except Exception as err:
            error = f"{type(err).__name__}: {err}"
            raise
        finally:
            REC.append(
                "model.jsonl",
                {
                    "via": "agent graph",
                    "model": self.model,
                    **request,
                    "answer": answer,
                    "usage": usage,
                    "seconds": round(time.monotonic() - start, 1),
                    "error": error,
                },
            )

    MeteredLlm.generate_content_async = recorded_generate  # type: ignore[method-assign]

    # The navigator's fallback (and the pipeline path) call the model through ModelCaller.ask → _run.
    run = model_call._run

    async def recorded_run(name, model, instruction, schema, parts, usage):  # type: ignore[no-untyped-def]
        start = time.monotonic()
        before = (usage.tokens_in, usage.tokens_out)
        text, error = None, None
        try:
            text = await run(name, model, instruction, schema, parts, usage)
            return text
        except Exception as err:
            error = f"{type(err).__name__}: {err}"
            raise
        finally:
            REC.append(
                "model.jsonl",
                {
                    "via": "model caller",
                    "model": getattr(model, "model", str(model)),
                    "agent": name,
                    "system": instruction[:300],
                    "user": "\n".join(p.text for p in parts if p.text),
                    "images": sum(1 for p in parts if p.inline_data),
                    "answer": [{"text": text}] if text is not None else [],
                    "usage": {"in": usage.tokens_in - before[0], "out": usage.tokens_out - before[1]},
                    "seconds": round(time.monotonic() - start, 1),
                    "error": error,
                },
            )

    model_call._run = recorded_run


def describe_request(llm_request) -> dict[str, Any]:  # type: ignore[no-untyped-def]
    system = llm_request.config.system_instruction if llm_request.config else ""
    system = system if isinstance(system, str) else str(system)
    agent = next((a for a in ("Pattern Analyst", "Adjudicator", "Navigator") if a in system), "?")
    parts = [p for c in llm_request.contents for p in (c.parts or [])]
    return {
        "agent": agent,
        "system": system[:300],
        "user": "\n".join(p.text for p in parts if p.text),
        "images": sum(1 for p in parts if p.inline_data),
        "toolResults": [
            {"name": p.function_response.name, "response": p.function_response.response} for p in parts if p.function_response
        ],
        "tools": sorted((llm_request.tools_dict or {}).keys()),
    }


def describe_parts(parts) -> list[dict[str, Any]]:  # type: ignore[no-untyped-def]
    out: list[dict[str, Any]] = []
    for p in parts or []:
        if p.function_call:
            out.append({"call": p.function_call.name, "args": dict(p.function_call.args or {})})
        elif p.text and not p.thought:
            out.append({"text": p.text})
    return out


@contextmanager
def log_file(path: Path):  # type: ignore[no-untyped-def]
    handler = logging.FileHandler(path, encoding="utf-8")
    handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(name)s: %(message)s"))
    handler.setLevel(logging.INFO)
    loggers = [logging.getLogger(name) for name in ("app", "google_adk", "LiteLLM", "httpx")]
    levels = [lg.level for lg in loggers]
    for lg, level in zip(loggers, (logging.INFO, logging.WARNING, logging.WARNING, logging.WARNING), strict=True):
        lg.addHandler(handler)
        lg.setLevel(level)
    try:
        yield
    finally:
        for lg, level in zip(loggers, levels, strict=True):
            lg.removeHandler(handler)
            lg.setLevel(level)
        handler.close()


def summarise(url: str, events: list[dict[str, Any]], times: list[float], folder: Path) -> dict[str, Any]:
    last = events[-1] if events else {"type": "audit.failed", "error": "no events"}
    report = last.get("report")
    calls = folder / "model.jsonl"
    model = [json.loads(line) for line in calls.read_text().splitlines()] if calls.exists() else []
    blocked = (folder / "blocked.jsonl").read_text().count("\n") if (folder / "blocked.jsonl").exists() else 0
    steps = report["steps"] if report else []
    journey = (
        " → ".join(f"{s['step']} {'✗ ' + s.get('blockedReason', '') if s.get('status') == 'blocked' else '✓'}" for s in steps)
        or "(no step reached)"
    )
    findings = report["findings"] if report else []
    agents = Counter(m.get("agent", "?") for m in model)
    errors = [m for m in model if m.get("error")]
    tokens_in = sum(m.get("usage", {}).get("in", 0) for m in model)
    tokens_out = sum(m.get("usage", {}).get("out", 0) for m in model)
    seconds = round(times[-1], 1) if times else 0

    lines = [
        f"# {urlsplit(url).hostname}",
        "",
        f"<{url}>",
        "",
        f"- **Result:** {'completed' if report else 'failed: ' + last.get('error', '?')}",
        f"- **Journey:** {journey}",
        f"- **Time:** {seconds} s · **model calls:** {len(model)} ({', '.join(f'{a} {n}' for a, n in agents.items()) or 'none'}),"
        f" {len(errors)} failed · **tokens:** {tokens_in:,} in, {tokens_out:,} out",
        f"- **Requests the URL guard refused:** {blocked}",
    ]
    if report:
        lines += ["", f"**Trust score {report['trustScore']}.** {report['summary']}", ""]
        if findings:
            lines += ["| Pattern | Step | Status | Confidence | Finding |", "|---|---|---|---|---|"]
            lines += [
                f"| {f['patternId']} | {f['step']} | {f['status']} | {f['confidence']:.2f} | {f['title']} |" for f in findings
            ]
        else:
            lines.append("No findings.")
    if errors:
        lines += ["", "## Model calls that failed", ""] + [f"- {m.get('agent')}: {m['error'][:300]}" for m in errors]
    lines += ["", "## What the agents said", ""]
    for t, e in zip(times, events, strict=False):
        if e["type"] == "agent.log":
            tool = f" `{e['tool']['name']}({e['tool']['input']})`" if e.get("tool") else ""
            lines.append(f"- `{t:6.1f}s` **{e['agent']}**{tool}: {e['message']}")
        elif e["type"] in ("step.started", "step.blocked"):
            lines.append(f"- `{t:6.1f}s` _{e['type']} {e['step']}: {e.get('reason') or e.get('url', '')}_")
    (folder / "summary.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
    return {
        "url": url,
        "folder": folder.name,
        "ok": bool(report),
        "journey": journey,
        "findings": len(findings),
        "confirmed": sum(f["status"] == "confirmed" for f in findings),
        "seconds": seconds,
        "calls": len(model),
        "failed_calls": len(errors),
        "error": None if report else last.get("error"),
    }


async def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("urls", nargs="+")
    parser.add_argument("--provider", choices=["ollama", "gemini", "replay"], default="ollama")
    parser.add_argument("--linger", type=float, default=8.0, help="Seconds on the product page before the reload")
    parser.add_argument("--out", type=Path, default=BACKEND_DIR / "var" / "real-sites")
    args = parser.parse_args()

    run_dir = args.out / datetime.now().strftime("%Y%m%d-%H%M%S")
    run_dir.mkdir(parents=True)
    settings = Settings(
        model_provider=args.provider,
        nav_linger_s=args.linger,
        # A local model is slower, and Gemma 3 on Ollama can't call tools.
        audit_timeout_s=900 if args.provider == "ollama" else 360,
        model_timeout_s=240 if args.provider == "ollama" else 90,
        adjudicator_max_tool_calls=0 if args.provider == "ollama" else 2,
    )
    install_hooks()
    print(f"Recording to {run_dir} · model provider: {args.provider}", flush=True)
    rows = []
    for n, url in enumerate(args.urls, start=1):
        host = urlsplit(url).hostname or "site"
        folder = run_dir / f"{n:02d}-{re.sub(r'[^a-z0-9.]+', '-', host.lower())}"
        REC.start(folder)
        print(f"[{n}/{len(args.urls)}] {url}", flush=True)
        with log_file(folder / "log.txt"):
            try:
                live = await run_live(url, settings.model_copy(update={"frames_dir": folder / "frames-raw"}))
                events, times = live.events, live.times
            except Exception as err:
                logging.getLogger("app").exception("the audit couldn't run")
                events, times = [{"type": "audit.failed", "error": f"{type(err).__name__}: {err}"}], [REC.now()]
        with (folder / "events.jsonl").open("w", encoding="utf-8") as f:
            for t, e in zip(times, events, strict=False):
                f.write(json.dumps({"t": round(t, 2), **e}, ensure_ascii=False) + "\n")
        REC.write("report.json", events[-1])
        raw = folder / "frames-raw"
        if raw.exists():
            frames = next((d for d in raw.iterdir() if d.is_dir()), None)
            if frames:
                shutil.move(str(frames), folder / "frames")
            shutil.rmtree(raw, ignore_errors=True)
        row = summarise(url, events, times, folder)
        rows.append(row)
        print(
            f"   {row['journey']} · {row['findings']} findings ({row['confirmed']} confirmed) · {row['seconds']} s"
            f"{' · ' + row['error'] if row['error'] else ''}",
            flush=True,
        )
        REC.folder = None

    lines = [
        f"# Real-site audits · {run_dir.name} · model provider: {args.provider}",
        "",
        "| # | Site | Journey | Findings (confirmed) | Time | Model calls (failed) |",
        "|---|---|---|---|---|---|",
    ]
    for n, r in enumerate(rows, start=1):
        lines.append(
            f"| {n} | [{urlsplit(r['url']).hostname}]({r['folder']}/summary.md) | {r['journey']}"
            f"{' · ' + r['error'] if r['error'] else ''} | {r['findings']} ({r['confirmed']}) | {r['seconds']} s |"
            f" {r['calls']} ({r['failed_calls']}) |"
        )
    (run_dir / "summary.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"Done: {run_dir / 'summary.md'}", flush=True)


if __name__ == "__main__":
    asyncio.run(main())
