"""Model judgement on real signals (fixtures) with a scripted model: elements, evidence rules, adjudication, failures."""

import pytest
from google.genai import types
from pydantic import BaseModel

from app.agents import adjudicator, evidence
from app.agents.checks import ALL_CHECKS
from app.agents.elements import build_elements
from app.agents.judge import Judge
from app.agents.pattern_analyst import Candidate
from app.config import REPO_DIR
from app.contract.models import Finding
from app.knowledge import load_knowledge
from app.models.call import ModelCaller, ModelError
from app.models.scripted import ScriptedLlm
from tests.conftest import load_walk, make_settings
from tests.judging import blank_jpeg, candidate, scripted_models

KNOWLEDGE = load_knowledge(REPO_DIR / "shared")


class FakeWalk:
    """What Judge.review needs from a Walk, without a browser."""

    def __init__(self, store: str) -> None:
        self.ev, _ = load_walk(store)
        self.findings = [f for check in ALL_CHECKS for f in check(self.ev, KNOWLEDGE)]
        self.logs: list[tuple[str, str]] = []

    async def log(self, agent: str, message: str) -> None:
        self.logs.append((agent, message))

    async def add_finding(self, finding: dict) -> None:
        self.findings.append(finding)

    async def screenshot(self, capture) -> bytes:
        return blank_jpeg()

    def model_findings(self) -> list[dict]:
        return [f for f in self.findings if f["id"].startswith("m-")]


async def review(store: str, labels: list[str], **models) -> tuple[FakeWalk, Judge]:
    walk = FakeWalk(store)
    judge = Judge(scripted_models(**models), KNOWLEDGE, make_settings())
    for label in labels:
        await judge.review(walk, walk.ev.captures[label])  # type: ignore[arg-type]
    return walk, judge


# The element list


def test_popup_elements_carry_measured_prominence():
    ev, _ = load_walk("store-a")
    lines = [e.line() for e in build_elements(ev.captures["product-popup"], [])]
    decline = next(line for line in lines if "prefer paying full price" in line and "popup button" in line)
    assert "text link" in decline and "grey text" in decline and "12 px" in decline
    assert any("Unlock my 10% off" in line and "filled button" in line for line in lines)


def test_elements_already_reported_by_a_measured_check_are_left_out():
    walk = FakeWalk("store-a")
    checkout = walk.ev.captures["checkout"]
    with_checks = [e.text for e in build_elements(checkout, walk.findings)]
    without = [e.text for e in build_elements(checkout, [])]
    membership = next(t for t in without if "BazaarNest Plus" in t)
    assert membership not in with_checks
    assert any("UPGRADE TO EXPRESS" in t for t in with_checks) and any("standard delivery" in t for t in with_checks)


def test_measured_urgency_never_reaches_the_model():
    ev, _ = load_walk("store-a")
    texts = " ".join(e.text for e in build_elements(ev.captures["product-first"], []))
    assert "Deal ends" not in texts and "left in stock" not in texts and "₹3,999" not in texts
    assert "120+ bought" in texts


# Evidence rules


def elements_of(store: str, label: str):
    ev, _ = load_walk(store)
    return build_elements(ev.captures[label], [])


def ref_for(elements, text: str) -> str:
    """The most specific element with this text (a popup's own text includes its buttons')."""
    return next(e.ref for e in elements if text.lower() in e.text.lower() and e.kind != "popup")


def test_interface_interference_needs_two_options_of_clearly_different_size():
    a = elements_of("store-a", "checkout")
    express, standard = ref_for(a, "upgrade to express"), ref_for(a, "continue with standard")
    both = Candidate.model_validate(candidate("interface_interference", [express, standard]))
    alone = Candidate.model_validate(candidate("interface_interference", [express]))
    assert evidence.rules(both, evidence.cited(both, a)) is None
    assert "cited one" in evidence.rules(alone, evidence.cited(alone, a))

    b = elements_of("store-b", "checkout")
    cards = [e.ref for e in b if e.kind == "radio option" and "delivery" in e.text.lower()]
    even = Candidate.model_validate(candidate("interface_interference", cards))
    assert "similar" in evidence.rules(even, evidence.cited(even, b))


def test_patterns_must_rest_on_the_right_kind_of_element():
    a = elements_of("store-a", "payment")
    button = next(e.ref for e in a if e.kind == "button")
    for pattern in ("false_urgency", "disguised_advertisement"):
        claim = Candidate.model_validate(candidate(pattern, [button]))
        assert "can't rest on a button" in evidence.rules(claim, evidence.cited(claim, a))


def test_grounded_evidence_is_measured_not_written_by_the_model():
    a = elements_of("store-a", "product-popup")
    ev, _ = load_walk("store-a")
    claim = Candidate.model_validate(candidate("confirm_shaming", [ref_for(a, "prefer paying full price"), "e99"]))
    finding = evidence.ground(claim, a, ev.captures["product-popup"], "popup", KNOWLEDGE, "m-test")
    assert finding is not None
    assert finding["evidence"]["observations"] == [
        'Popup button: "No thanks, I prefer paying full price" (text link, grey text, 12 px, 198×16 px)'
    ]
    assert finding["evidence"]["frames"][0]["bbox"]["w"] > 0
    assert finding["rule"] == KNOWLEDGE.pattern("confirm_shaming")["rule"]


# Adjudication


def test_decide_thresholds():
    finding = {"title": "x", "confidence": 0.9}
    sure = Candidate.model_validate(candidate("confirm_shaming", ["e1"], confidence=0.9))
    unsure = Candidate.model_validate(candidate("confirm_shaming", ["e1"], confidence=0.6))
    unverifiable = Candidate.model_validate(candidate("false_urgency", ["e1"], confidence=0.95, verifiable=False))
    verdict = lambda a: adjudicator.Verdict(reason="r", agreement=a)  # noqa: E731
    assert adjudicator.decide(finding, sure, verdict(0.85), 0.75, 0.35)[0]["status"] == "confirmed"
    assert adjudicator.decide(finding, sure, verdict(0.6), 0.75, 0.35)[0] == {
        **finding,
        "confidence": 0.6,
        "status": "needs_review",
    }
    assert adjudicator.decide(finding, unsure, verdict(0.9), 0.75, 0.35)[0]["status"] == "needs_review"
    assert adjudicator.decide(finding, sure, verdict(0.2), 0.75, 0.35)[0] is None
    review, message = adjudicator.decide(finding, unverifiable, None, 0.75, 0.35)
    assert review["status"] == "needs_review" and review["confidence"] < 0.75 and "human review" in message


def test_crop_frames_the_evidence():
    import io

    from PIL import Image

    region = adjudicator.crop(blank_jpeg(1280, 2000), {"x": 0.5, "y": 0.5, "w": 0.05, "h": 0.01})
    with Image.open(io.BytesIO(region)) as image:
        assert image.size == (560, 280)


# The whole judge on real screens


async def test_store_a_judgement():
    walk, judge = await review("store-a", ["product-popup", "product-first", "cart", "checkout", "payment"])
    found = {f["patternId"]: f for f in walk.model_findings()}
    assert set(found) == {"confirm_shaming", "false_urgency", "interface_interference"}
    assert found["confirm_shaming"]["status"] == "confirmed" and found["interface_interference"]["status"] == "confirmed"
    assert found["false_urgency"]["status"] == "needs_review" and found["false_urgency"]["severity"] == "low"
    for f in walk.model_findings():
        Finding.model_validate(f)
    assert (judge.reviewed, judge.failed) == (5, 0)
    # The popup and the product page both show "120+ bought": it's judged once.
    assert sum(1 for f in walk.model_findings() if f["patternId"] == "false_urgency") == 1


async def test_store_b_even_choices_are_ruled_out_by_measurement():
    walk, _ = await review("store-b", ["product-first", "cart", "checkout", "payment"])
    assert walk.model_findings() == []
    assert any(agent == "evidence" and "similar" in message for agent, message in walk.logs)


async def test_unverifiable_claims_skip_the_verifier():
    model_calls_before = 0
    walk, judge = await review("store-a", ["product-first"])
    assert [f["status"] for f in walk.model_findings()] == ["needs_review"]
    assert judge.caller.calls == model_calls_before + 1  # the analyst only


async def test_a_verifier_that_disagrees_drops_the_claim():
    walk, _ = await review("store-a", ["product-popup"], agreement=0.1)
    kept = [f["patternId"] for f in walk.model_findings()]
    assert "confirm_shaming" not in kept
    assert any(agent == "adjudicator" and message.startswith("Rejected") for agent, message in walk.logs)


async def test_a_model_that_answers_nonsense_never_breaks_the_audit():
    def nonsense(system: str, user: str, images: int) -> str:
        return "I think the page is fine!"

    walk = FakeWalk("store-a")
    model = ScriptedLlm(responder=nonsense)
    from app.models import ModelSet

    judge = Judge(ModelSet(smart=model, fast=model, name="broken"), KNOWLEDGE, make_settings())
    await judge.review(walk, walk.ev.captures["checkout"])  # type: ignore[arg-type]
    assert walk.model_findings() == []
    assert (judge.reviewed, judge.failed) == (0, 1)
    assert model.calls == 2  # one retry
    assert any("Couldn't read the checkout page" in message for _, message in walk.logs)


# The model call helper


class Answer(BaseModel):
    ok: bool


async def test_calls_time_out_and_respect_the_budget():
    settings = make_settings(model_timeout_s=0.05, audit_max_model_calls=3)
    caller = ModelCaller(settings)
    slow = ScriptedLlm(responder=lambda s, u, i: '{"ok": true}', delay=1)
    with pytest.raises(ModelError, match="no answer within"):
        await caller.ask(name="t", model=slow, instruction="x", schema=Answer, parts=[types.Part(text="hi")])

    fast = ScriptedLlm(responder=lambda s, u, i: '```json\n{"ok": true}\n```')
    assert (await caller.ask(name="t", model=fast, instruction="x", schema=Answer, parts=[types.Part(text="hi")])).ok
    assert (await caller.ask(name="t", model=fast, instruction="x", schema=Answer, parts=[types.Part(text="hi")])).ok
    with pytest.raises(ModelError, match="budget"):
        await caller.ask(name="t", model=fast, instruction="x", schema=Answer, parts=[types.Part(text="hi")])


async def test_the_prompt_reaches_the_model_untemplated():
    seen = {}

    def respond(system: str, user: str, images: int) -> str:
        seen.update(system=system, images=images)
        return '{"ok": true}'

    caller = ModelCaller(make_settings())
    parts = [types.Part(text="hi"), types.Part(inline_data=types.Blob(mime_type="image/jpeg", data=blank_jpeg(10, 10)))]
    await caller.ask(name="t", model=ScriptedLlm(responder=respond), instruction='Reply {"ok": true}', schema=Answer, parts=parts)
    assert 'Reply {"ok": true}' in seen["system"] and seen["images"] == 1
