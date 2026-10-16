"""Models inside the agent graph count against the audit's budgets, concurrency and time limit."""

import asyncio
from collections.abc import AsyncGenerator

import pytest
from google.adk.agents import LlmAgent
from google.adk.models.base_llm import BaseLlm
from google.adk.models.llm_request import LlmRequest
from google.adk.models.llm_response import LlmResponse
from google.adk.runners import InMemoryRunner
from google.genai import types

from app.models.call import ModelCaller, ModelError
from app.models.scripted import ScriptedLlm
from tests.conftest import make_settings


class CountedLlm(BaseLlm):
    """Answers at once and reports token usage, like Gemini does."""

    model: str = "counted"

    async def generate_content_async(self, llm_request: LlmRequest, stream: bool = False) -> AsyncGenerator[LlmResponse, None]:
        usage = types.GenerateContentResponseUsageMetadata(
            prompt_token_count=100, candidates_token_count=20, thoughts_token_count=5
        )
        yield LlmResponse(content=types.Content(role="model", parts=[types.Part(text="ok")]), usage_metadata=usage)


def request() -> LlmRequest:
    return LlmRequest(contents=[types.Content(role="user", parts=[types.Part(text="hi")])])


async def ask(model: BaseLlm) -> list[LlmResponse]:
    return [r async for r in model.generate_content_async(request())]


async def test_every_call_and_its_tokens_are_counted():
    caller = ModelCaller(make_settings())
    model = caller.metered(CountedLlm())
    await ask(model)
    await ask(model)
    assert (caller.calls, caller.tokens_in, caller.tokens_out) == (2, 200, 50)


async def test_calls_stop_when_the_call_budget_is_spent():
    caller = ModelCaller(make_settings(audit_max_model_calls=1))
    model = caller.metered(CountedLlm())
    await ask(model)
    with pytest.raises(ModelError, match="model-call budget"):
        await ask(model)


async def test_calls_stop_when_the_token_budget_is_spent():
    caller = ModelCaller(make_settings(audit_max_tokens=100))
    caller.tokens_in, caller.tokens_out = 80, 30
    with pytest.raises(ModelError, match="token budget"):
        await ask(caller.metered(CountedLlm()))


async def test_a_slow_model_times_out():
    caller = ModelCaller(make_settings(model_timeout_s=0.05))
    slow = ScriptedLlm(responder=lambda s, u, i: "late", delay=1)
    with pytest.raises(ModelError, match="no answer within"):
        await ask(caller.metered(slow))


async def test_calls_share_the_audits_concurrency_limit():
    caller = ModelCaller(make_settings(model_concurrency=1))
    running = peak = 0

    def respond(system: str, user: str, images: int) -> str:
        return "ok"

    class Tracked(ScriptedLlm):
        async def generate_content_async(self, llm_request: LlmRequest, stream: bool = False):
            nonlocal running, peak
            running += 1
            peak = max(peak, running)
            await asyncio.sleep(0.05)
            running -= 1
            async for r in super().generate_content_async(llm_request, stream):
                yield r

    model = caller.metered(Tracked(responder=respond))
    await asyncio.gather(ask(model), ask(model), ask(model))
    assert peak == 1 and caller.calls == 3


async def test_an_adk_agent_runs_on_a_metered_model():
    caller = ModelCaller(make_settings())
    agent = LlmAgent(name="probe", model=caller.metered(CountedLlm()), instruction="Say ok.")
    runner = InMemoryRunner(agent=agent, app_name="test")
    session = await runner.session_service.create_session(app_name="test", user_id="u")
    texts = [
        p.text
        async for e in runner.run_async(
            user_id="u", session_id=session.id, new_message=types.Content(role="user", parts=[types.Part(text="hi")])
        )
        if e.content
        for p in e.content.parts or []
        if p.text
    ]
    assert texts == ["ok"] and caller.calls == 1 and caller.tokens_in == 100
