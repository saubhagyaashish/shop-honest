"""Fixer: proposes a fix for each finding of a finished audit ("Fix it"), as changes to the store's own settings
where the store's settings are ones we control.

The fixes the user switches on are applied to a copy of the store in the auditor's own browser only: the store reads
the patch before it renders (web/src/store/settings.ts), and the same audit runs on the copy ("Verify these fixes").
Whether a fix worked is then measured, not claimed (verify()). A real site is never changed: only the demo stores
listed in shared/store_settings.json have settings we can set. Elsewhere every fix is for the site's developers.
"""

import re
from dataclasses import dataclass, field
from functools import cache
from pathlib import Path
from typing import Any
from urllib.parse import urlsplit

from google.genai import types
from pydantic import BaseModel, Field

from app.agents.findings import money
from app.knowledge import Knowledge
from app.prices.keys import on_demo_host

PROMPTS = Path(__file__).parent / "prompts"
# Where the auditor's browser leaves the patch for the copy it audits (PATCH_STORAGE_KEY in store/settings.ts).
PATCH_STORAGE_KEY = "shophonest:settings"
STORE_PATH = re.compile(r"^/demo/([a-z0-9-]+)/")
MODEL_FINDING_N = re.compile(r"^(m-.+)-\d+$")


class Change(BaseModel):
    findingId: str
    setting: str
    value: str
    why: str = ""


class FixPlan(BaseModel):
    changes: list[Change] = Field(default_factory=list, max_length=30)


@dataclass
class Fix:
    """The patch for the store, the changes as the report shows them, and the findings left without a fix."""

    patch: dict[str, bool | int] = field(default_factory=dict)
    changes: list[dict[str, Any]] = field(default_factory=list)
    unfixed: list[str] = field(default_factory=list)


@cache
def instruction() -> str:
    return (PROMPTS / "fixer.md").read_text(encoding="utf-8")


def proposal(findings: list[dict[str, Any]], fix: Fix | None) -> list[dict[str, Any]]:
    """One item per finding: how it can be fixed, the settings changes that fix it, and the fix in words.

    `setting` when a change fixes it, `review` when it awaits a human's review (a change may still be offered),
    `code` when only the site's developers can fix it.
    """
    changes = fix.changes if fix else []
    items = []
    for f in findings:
        own = [c for c in changes if c["findingId"] == f["id"]]
        kind = "review" if f["status"] == "needs_review" else "setting" if own else "code"
        items.append(
            {
                "findingId": f["id"],
                "title": f["title"],
                "patternId": f["patternId"],
                "step": f["step"],
                "status": f["status"],
                "kind": kind,
                "changes": own,
                "suggestion": f["remediation"],
            }
        )
    return items


def current_settings(knowledge: Knowledge, target_url: str) -> dict[str, Any] | None:
    """The current settings of the store under audit, if it's one of ours whose settings we control; else None."""
    m = STORE_PATH.match(urlsplit(target_url).path)
    return knowledge.store_settings["stores"].get(m.group(1)) if m and on_demo_host(target_url) else None


def request_parts(findings: list[dict[str, Any]], knowledge: Knowledge, current: dict[str, Any]) -> list[types.Part]:
    lines = ["Findings:"]
    for f in findings:
        lines.append(f'- {f["id"]} · {f["patternId"]} at the {f["step"]} step · "{f["title"]}" ({f["status"]})')
        lines += [f"    observed: {o}" for o in f["evidence"].get("observations", [])[:4]]
        lines.append(f"    suggested fix: {f['remediation']}")
    lines += ["", "Settings you can change (current value in brackets):"]
    for s in knowledge.store_settings["settings"]:
        now = current.get(s["key"])
        shown = ("on" if now else "off") if s["type"] == "boolean" else now
        fixes = ", ".join(p.replace("_", " ") for p in s["fixes"])
        lines.append(f"- {s['key']} [{shown}] (for {fixes}): {s['description']}")
    return [types.Part(text="\n".join(lines))]


def apply_plan(plan: FixPlan, findings: list[dict[str, Any]], knowledge: Knowledge, current: dict[str, Any]) -> Fix:
    """Keep the changes that name a real finding, a setting meant for that kind of dark pattern and a value of the
    right type; build the patch."""
    settings = {s["key"]: s for s in knowledge.store_settings["settings"]}
    patterns = {f["id"]: f["patternId"] for f in findings}
    fix = Fix()
    for change in plan.changes:
        setting = settings.get(change.setting)
        kind = setting["type"] if setting else None
        value = _value(change.value, kind) if kind else None
        if value is None or patterns.get(change.findingId) not in setting["fixes"]:
            continue
        if value == current.get(change.setting):
            continue
        fix.patch[change.setting] = value
        fix.changes.append(
            {
                "findingId": change.findingId,
                "setting": change.setting,
                "from": _shown(current.get(change.setting), kind),
                "to": _shown(value, kind),
                "why": change.why.strip() or "Changed to remove this dark pattern.",
            }
        )
    fixed = {c["findingId"] for c in fix.changes}
    fix.unfixed = [f["id"] for f in findings if f["id"] not in fixed]
    return fix


def verify(
    before: list[dict[str, Any]],
    after: list[dict[str, Any]],
    *,
    trust_before: float,
    trust_after: float,
    payable_before: dict[str, Any] | None,
    payable_after: dict[str, Any] | None,
) -> dict[str, Any]:
    """Each earlier finding: did the later audit find it again (same_finding)? Plus anything new."""
    seen_after = {same_finding(f) for f in after}
    seen_before = {same_finding(f) for f in before}
    out: dict[str, Any] = {
        "trustBefore": trust_before,
        "trustAfter": trust_after,
        "results": [
            {
                "findingId": f["id"],
                "title": f["title"],
                "patternId": f["patternId"],
                "step": f["step"],
                "outcome": "still_present" if same_finding(f) in seen_after else "resolved",
            }
            for f in before
        ],
        "newFindings": [
            {"title": f["title"], "patternId": f["patternId"], "step": f["step"]}
            for f in after
            if same_finding(f) not in seen_before
        ],
    }
    if payable_before:
        out["payableBefore"] = payable_before
    if payable_after:
        out["payableAfter"] = payable_after
    return out


def same_finding(finding: dict[str, Any]) -> str:
    """What makes two audits' findings the same one: a measured check's id (e.g. "f-frozen-stock"), or for a model's
    finding the screen it was seen on and its pattern (ids are "m-<screen>-<pattern>-<n>")."""
    return MODEL_FINDING_N.sub(r"\1", finding["id"])


def outcome_line(verification: dict[str, Any], fixed: set[str]) -> str:
    """The Fixer's closing line: how many of the fixed findings are gone, the trust score and what the shopper pays."""
    resolved = sum(r["outcome"] == "resolved" and r["findingId"] in fixed for r in verification["results"])
    line = f"Verified on the fixed copy: {resolved} of {len(fixed)} fixed finding{'s' if len(fixed) != 1 else ''} are gone."
    line += f" Trust score {verification['trustBefore']:g} → {verification['trustAfter']:g}"
    before, after = verification.get("payableBefore"), verification.get("payableAfter")
    if before and after and before["amount"] != after["amount"]:
        line += f"; the shopper now pays {money(after['amount'])} instead of {money(before['amount'])}"
    line += "."
    if new := verification["newFindings"]:
        line += f" {len(new)} new finding{'s' if len(new) != 1 else ''} turned up: {', '.join(n['title'] for n in new[:3])}."
    return line


def _value(raw: str, kind: str) -> bool | int | None:
    text = raw.strip().lower().lstrip("₹").replace(",", "")
    if kind == "boolean":
        return {"true": True, "on": True, "false": False, "off": False}.get(text)
    try:
        number = round(float(text))
    except ValueError:
        return None
    return number if number >= 0 else None


def _shown(value: Any, kind: str | None) -> str:
    if kind == "boolean":
        return "on" if value else "off"
    return money(value) if isinstance(value, int | float) else str(value)
