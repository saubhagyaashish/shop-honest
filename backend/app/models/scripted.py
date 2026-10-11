"""A stand-in model for tests: answers from a Python function instead of a network call."""

import asyncio
from collections.abc import AsyncGenerator, Callable

from google.adk.models.base_llm import BaseLlm
from google.adk.models.llm_request import LlmRequest
from google.adk.models.llm_response import LlmResponse
from google.genai import types

# (system instruction, user text, number of images) -> the model's reply text
Responder = Callable[[str, str, int], str]


class ScriptedLlm(BaseLlm):
    model: str = "scripted"
    responder: Responder
    # Seconds to wait before answering (to test timeouts).
    delay: float = 0
    calls: int = 0

    async def generate_content_async(self, llm_request: LlmRequest, stream: bool = False) -> AsyncGenerator[LlmResponse, None]:
        self.calls += 1
        if self.delay:
            await asyncio.sleep(self.delay)
        system = _text(llm_request.config.system_instruction) if llm_request.config else ""
        parts = [p for c in llm_request.contents for p in (c.parts or [])]
        user = "\n".join(p.text for p in parts if p.text)
        images = sum(1 for p in parts if p.inline_data)
        reply = self.responder(system, user, images)
        yield LlmResponse(content=types.Content(role="model", parts=[types.Part(text=reply)]), turn_complete=True)


def _text(value: object) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value
    if isinstance(value, types.Content):
        return "\n".join(p.text or "" for p in value.parts or [])
    if isinstance(value, list):
        return "\n".join(_text(v) for v in value)
    if isinstance(value, types.Part):
        return value.text or ""
    return str(value)
