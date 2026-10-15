"""The screen_review agent graph judges like Judge.review, with an Adjudicator that checks evidence through tools."""

import pytest

from app.agents.checks import ALL_CHECKS
from app.agents.judge import Judge
from app.agents.review_graph import ReviewGraph
from app.config import REPO_DIR
from app.knowledge import load_knowledge
from app.models import ModelSet
from app.models.scripted import ScriptedLlm
from tests.conftest import load_walk, make_settings
from tests.judging import blank_jpeg, candidate, demo_store_analyst, scripted_models

KNOWLEDGE = load_knowledge(REPO_DIR / "shared")
SCREENS = ["product-popup", "product-first", "cart", "checkout", "payment"]


class FakeWalk:
    """What the review needs from a Walk, without a browser."""

    def __init__(self, store: str) -> None:
        self.evidence, _ = load_walk(store)
        self.findings = [f for check in ALL_CHECKS for f in check(self.evidence, KNOWLEDGE)]
        self.logs: list[tuple[str, str]] = []

    async def log(self, agent: str, message: str) -> None:
        self.logs.append((agent, message))

    async def add_finding(self, finding: dict) -> None:
        self.findings.append(finding)

    async def screenshot(self, capture) -> bytes:
        return blank_jpeg()

    def model_findings(self) -> list[tuple]:
        return [(f["id"], f["patternId"], f["status"], f.get("confidence")) for f in self.findings if f["id"].startswith("m-")]


async def judge_with(store: str, graph: bool, models: ModelSet | None = None, **settings) -> tuple[FakeWalk, Judge]:
    walk = FakeWalk(store)
    judge = Judge(models or scripted_models(), KNOWLEDGE, make_settings(**settings))
    reviewer = ReviewGraph(walk, judge) if graph else None  # type: ignore[arg-type]
    for label in [s for s in SCREENS if s in walk.evidence.captures]:
        capture = walk.evidence.captures[label]
        await (reviewer.review(capture) if reviewer else judge.review(walk, capture))  # type: ignore[arg-type]
    return walk, judge


@pytest.mark.parametrize("store", ["store-a", "store-b"])
async def test_the_graph_judges_like_the_pipeline(store: str):
    pipeline, before = await judge_with(store, graph=False)
    graph, after = await judge_with(store, graph=True)
    assert graph.model_findings() == pipeline.model_findings()
    assert (after.reviewed, after.failed) == (before.reviewed, before.failed)


async def test_store_a_model_findings_through_the_graph():
    walk, judge = await judge_with("store-a", graph=True)
    found = {(pattern, status) for _, pattern, status, _ in walk.model_findings()}
    assert found == {
        ("confirm_shaming", "confirmed"),
        ("interface_interference", "confirmed"),
        ("false_urgency", "needs_review"),
    }
    assert (judge.reviewed, judge.failed) == (5, 0)


async def test_the_adjudicator_measures_before_it_rules_and_says_so():
    walk, _ = await judge_with("store-a", graph=True)
    lines = [m for agent, m in walk.logs if agent == "adjudicator"]
    express = next(i for i, m in enumerate(lines) if "UPGRADE TO EXPRESS" in m and "× the space of" in m)
    assert lines[express + 1].startswith('Confirmed "Standard delivery is a tiny grey link"')
    # A claim citing one element gets its measured look.
    assert any(m.startswith('Measured "No thanks, I prefer paying full price": text link, grey text, 12 px') for m in lines)


async def test_unverifiable_claims_skip_the_adjudicator():
    def analyst(user: str) -> list[dict]:
        return [c for c in demo_store_analyst(user) if c["patternId"] == "false_urgency"]

    models = scripted_models(analyst=analyst)
    walk, _ = await judge_with("store-a", graph=True, models=models)
    assert [s for _, _, s, _ in walk.model_findings()] == ["needs_review"]
    assert models.fast.calls == 5  # one analyst call per screen, no adjudicator
    assert not any("takes up" in m for _, m in walk.logs)


async def test_the_tool_budget_caps_checks_per_claim():
    walk, _ = await judge_with("store-a", graph=True, adjudicator_max_tool_calls=0)
    assert not any("takes up" in m for _, m in walk.logs)
    assert {s for _, _, s, _ in walk.model_findings()} == {"confirmed", "needs_review"}


async def test_a_model_that_answers_nonsense_never_breaks_the_audit():
    model = ScriptedLlm(responder=lambda s, u, i: "I think the page is fine!")
    walk = FakeWalk("store-a")
    judge = Judge(ModelSet(smart=model, fast=model, name="broken"), KNOWLEDGE, make_settings())
    await ReviewGraph(walk, judge).review(walk.evidence.captures["checkout"])  # type: ignore[arg-type]
    assert walk.model_findings() == []
    assert (judge.reviewed, judge.failed) == (0, 1)
    assert model.calls == 2  # one retry
    assert any("Couldn't read the checkout page" in message for _, message in walk.logs)


async def test_a_spent_budget_sends_claims_to_human_review():
    walk, judge = await judge_with("store-a", graph=True, audit_max_model_calls=2)
    # The popup is read (call 1); its adjudicator measures (call 2) but has nothing left to rule with.
    assert (judge.reviewed, judge.failed) == (1, 4)
    shaming = next(f for f in walk.findings if f["patternId"] == "confirm_shaming")
    assert shaming["status"] == "needs_review"
    message = "Couldn't double-check this (the audit's model-call budget is used up). Sending it to human review."
    assert ("adjudicator", message) in walk.logs


async def test_a_claim_the_adjudicator_rejects_is_dropped():
    def analyst(user: str) -> list[dict]:
        return [c for c in demo_store_analyst(user) if c["patternId"] == "confirm_shaming"]

    walk, _ = await judge_with("store-a", graph=True, models=scripted_models(analyst=analyst, agreement=0.1))
    assert walk.model_findings() == []
    assert any(m.startswith('Rejected "The decline link shames the shopper"') for _, m in walk.logs)


async def test_the_analyst_sees_the_screen_exactly_as_the_pipeline_sends_it():
    seen: list[tuple[str, int]] = []

    def respond(system: str, user: str, images: int) -> str:
        if "Pattern Analyst" in system:
            seen.append((user, images))
        return '{"candidates": []}'

    model = ScriptedLlm(responder=respond)
    models = ModelSet(smart=model, fast=model, name="probe")
    walk = FakeWalk("store-a")
    await Judge(models, KNOWLEDGE, make_settings()).review(walk, walk.evidence.captures["checkout"])  # type: ignore[arg-type]
    walk = FakeWalk("store-a")
    await ReviewGraph(walk, Judge(models, KNOWLEDGE, make_settings())).review(walk.evidence.captures["checkout"])  # type: ignore[arg-type]
    assert len(seen) == 2 and seen[0] == seen[1] and seen[0][1] == 1


def test_candidate_helper_is_shared():
    # The graph tests reuse the scripted analyst; keep its claim shape in one place.
    assert candidate("nagging", ["e1"])["elementRefs"] == ["e1"]
