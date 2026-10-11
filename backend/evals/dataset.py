"""The Pattern Analyst on a public dark-pattern dataset (zero-shot).

    uv run python -m evals.dataset [--limit 200] [--batch 25]

Dataset: "Dark patterns in e-commerce: a dataset and its baseline evaluations"
(Yada et al., IEEE BigData 2022, https://github.com/yamanalab/ec-darkpattern, Apache-2.0),
built on Mathur et al.'s 2019 study of shopping sites. 2,356 texts, half of them
dark patterns, labelled with Mathur's categories. Downloaded on first use into
var/datasets/; it is not part of this repository.

The paper's baselines (BERT, RoBERTa: about 0.97 F1) were trained on this dataset.
Ours is zero-shot: the same model and pattern guidance the audits use, never
shown a single example from it. The two are reported side by side but are not
the same kind of result.
"""

import argparse
import asyncio
import csv
import io
import json
import random
import sys
import time
from collections import defaultdict
from datetime import UTC, datetime
from typing import Any

import httpx

from app.agents.text_judge import classify
from app.config import BACKEND_DIR, Settings
from app.knowledge import load_knowledge
from app.models import model_set
from app.models.call import ModelCaller, ModelError

URL = "https://raw.githubusercontent.com/yamanalab/ec-darkpattern/master/dataset/dataset.tsv"
CACHE = BACKEND_DIR / "var" / "datasets" / "ec-darkpattern.tsv"
# Best published results on this dataset (supervised, 5-fold cross-validation), from the paper's README.
BASELINES = {
    "RoBERTa-large (trained on it)": (0.975, 0.984, 0.967, 0.975),
    "Logistic regression (trained on it)": (0.961, 0.981, 0.940, 0.960),
}
# Which of our patterns correspond to Mathur et al.'s categories.
CATEGORY = {
    "Urgency": {"false_urgency"},
    "Scarcity": {"false_urgency"},
    "Social Proof": {"false_urgency", "disguised_advertisement"},
    "Misdirection": {
        "confirm_shaming",
        "interface_interference",
        "trick_question",
        "misleading_price",
        "disguised_advertisement",
    },
    "Sneaking": {"basket_sneaking", "drip_pricing", "subscription_trap", "saas_billing", "bait_and_switch"},
    "Obstruction": {"subscription_trap", "nagging", "interface_interference"},
    "Forced Action": {"forced_action"},
}


def load(limit: int | None, seed: int = 7) -> list[dict[str, Any]]:
    if not CACHE.exists():
        CACHE.parent.mkdir(parents=True, exist_ok=True)
        CACHE.write_bytes(httpx.get(URL, timeout=60, follow_redirects=True).raise_for_status().content)
    rows = [
        {"id": n, "text": r["text"].strip(), "dark": r["label"].strip() == "1", "category": r["Pattern Category"].strip()}
        for n, r in enumerate(csv.DictReader(io.StringIO(CACHE.read_text(encoding="utf-8")), delimiter="\t"), start=1)
        if r.get("text", "").strip()
    ]
    if limit and limit < len(rows):
        rng = random.Random(seed)
        dark = [r for r in rows if r["dark"]]
        clean = [r for r in rows if not r["dark"]]
        rows = rng.sample(dark, limit // 2) + rng.sample(clean, limit - limit // 2)
        rng.shuffle(rows)
    return rows


async def run(rows: list[dict[str, Any]], batch: int, settings: Settings) -> dict[int, Any]:
    models = model_set(settings)
    if models is None:
        sys.exit("Set --provider gemini (or ollama): this eval needs a model.")
    caller = ModelCaller(settings)
    knowledge = load_knowledge(settings.shared_dir)
    verdicts: dict[int, Any] = {}

    async def one(chunk: list[dict[str, Any]]) -> None:
        try:
            verdicts.update(await classify(caller, models.smart, knowledge, [(r["id"], r["text"]) for r in chunk]))
        except ModelError as err:
            print(f"  a batch failed ({err}); its texts count as unanswered", flush=True)

    chunks = [rows[i : i + batch] for i in range(0, len(rows), batch)]
    for i in range(0, len(chunks), 4):
        await asyncio.gather(*(one(c) for c in chunks[i : i + 4]))
        print(f"  {min(len(rows), (i + 4) * batch)}/{len(rows)} texts", flush=True)
    print(f"  model calls {caller.calls}, tokens {caller.tokens_in:,} in + {caller.tokens_out:,} out", flush=True)
    return {"verdicts": verdicts, "tokens_in": caller.tokens_in, "tokens_out": caller.tokens_out, "calls": caller.calls}


def score(rows: list[dict[str, Any]], verdicts: dict[int, Any]) -> dict[str, Any]:
    answered = [r for r in rows if r["id"] in verdicts]
    tp = sum(r["dark"] and verdicts[r["id"]].dark for r in answered)
    fp = sum(not r["dark"] and verdicts[r["id"]].dark for r in answered)
    fn = sum(r["dark"] and not verdicts[r["id"]].dark for r in answered)
    tn = sum(not r["dark"] and not verdicts[r["id"]].dark for r in answered)
    precision = tp / (tp + fp) if tp + fp else 0.0
    recall = tp / (tp + fn) if tp + fn else 0.0
    by_category: dict[str, list[bool]] = defaultdict(list)
    agree: dict[str, list[bool]] = defaultdict(list)
    for r in answered:
        if r["dark"]:
            v = verdicts[r["id"]]
            by_category[r["category"]].append(v.dark)
            if v.dark:
                agree[r["category"]].append(v.pattern in CATEGORY.get(r["category"], set()))
    return {
        "texts": len(rows),
        "answered": len(answered),
        "accuracy": (tp + tn) / len(answered) if answered else 0.0,
        "precision": precision,
        "recall": recall,
        "f1": 2 * precision * recall / (precision + recall) if precision + recall else 0.0,
        "confusion": {"tp": tp, "fp": fp, "fn": fn, "tn": tn},
        "recall_by_category": {c: (sum(v), len(v)) for c, v in sorted(by_category.items())},
        "pattern_agreement_by_category": {c: (sum(v), len(v)) for c, v in sorted(agree.items())},
        "false_alarm_examples": [r["text"][:120] for r in answered if not r["dark"] and verdicts[r["id"]].dark][:8],
        "missed_examples": [f"[{r['category']}] {r['text'][:110]}" for r in answered if r["dark"] and not verdicts[r["id"]].dark][
            :8
        ],
    }


def show(result: dict[str, Any], label: str) -> None:
    print(f"\n{label}: {result['answered']}/{result['texts']} texts answered")
    print(f"{'':38} {'accuracy':>8} {'precision':>9} {'recall':>7} {'F1':>6}")
    ours = (result["accuracy"], result["precision"], result["recall"], result["f1"])
    for name, (acc, p, r, f1) in {"Shop Honest (zero-shot)": ours, **BASELINES}.items():
        print(f"{name:38} {acc:8.3f} {p:9.3f} {r:7.3f} {f1:6.3f}")
    print("recall by category:", ", ".join(f"{c} {h}/{n}" for c, (h, n) in result["recall_by_category"].items()))
    print(
        "our pattern matched the category:",
        ", ".join(f"{c} {h}/{n}" for c, (h, n) in result["pattern_agreement_by_category"].items()),
    )
    print("false alarms (sample):", *result["false_alarm_examples"][:5], sep="\n  ")
    print("missed (sample):", *result["missed_examples"][:5], sep="\n  ")


async def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--limit", type=int, help="A balanced random sample of this many texts (default: all)")
    parser.add_argument("--batch", type=int, default=25)
    parser.add_argument("--provider", choices=["ollama", "gemini"], default="gemini")
    args = parser.parse_args()
    settings = Settings(
        model_provider=args.provider, audit_max_model_calls=10_000, audit_max_tokens=50_000_000, model_concurrency=4
    )
    rows = load(args.limit)
    print(f"{len(rows)} texts ({sum(r['dark'] for r in rows)} dark patterns) · {args.provider}", flush=True)
    started = time.time()
    outcome = await run(rows, args.batch, settings)
    result = score(rows, outcome["verdicts"])
    result.update({k: outcome[k] for k in ("tokens_in", "tokens_out", "calls")}, seconds=round(time.time() - started))
    from app.models import describe

    show(result, describe(settings))
    out = BACKEND_DIR / "var" / "evals" / f"dataset-{args.provider}-{datetime.now(UTC):%Y%m%d-%H%M%S}.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps({"model": describe(settings), "limit": args.limit, **result}, indent=2) + "\n", encoding="utf-8")
    print(f"\nSaved {out}")


if __name__ == "__main__":
    asyncio.run(main())
