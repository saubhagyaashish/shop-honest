"""The one way agents call a model: ADK LlmAgent, schema-checked JSON, budget and timeout.

A model problem never fails an audit: `ask` returns None and the caller carries
on without that model's opinion (the measured checks still stand).
"""

import asyncio
import json
import logging
import re
from typing import TypeVar

from google.adk.agents import LlmAgent
from google.adk.runners import InMemoryRunner
from google.genai import types
from pydantic import BaseModel, ValidationError

from app.config import Settings
from app.models import Model

log = logging.getLogger(__name__)

T = TypeVar("T", bound=BaseModel)
APP = "shophonest"
FENCE = re.compile(r"^\s*```(?:json)?\s*|\s*```\s*$")


class ModelError(Exception):
    """Why a call produced no usable answer (for the audit trail)."""


class ModelCaller:
    """One per audit: shares the call budget and the concurrency limit across its agents."""

    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._slots = asyncio.Semaphore(settings.model_concurrency)
        self.calls = 0
        # Tokens reported by the model across this audit (for cost tracking).
        self.tokens_in = 0
        self.tokens_out = 0

    @property
    def budget_left(self) -> int:
        return self._settings.audit_max_model_calls - self.calls

    async def ask(self, *, name: str, model: Model, instruction: str, schema: type[T], parts: list[types.Part]) -> T:
        """Ask once, retry once on an unusable answer; raises ModelError when there's still none."""
        last: Exception | None = None
        for _ in range(2):
            if self.budget_left <= 0:
                raise ModelError("the audit's model-call budget is used up")
            if self.tokens_in + self.tokens_out >= self._settings.audit_max_tokens:
                raise ModelError("the audit's token budget is used up")
            self.calls += 1
            try:
                async with self._slots:
                    async with asyncio.timeout(self._settings.model_timeout_s):
                        text = await _run(name, model, instruction, schema, parts, self)
                return schema.model_validate_json(_clean(text))
            except TimeoutError as err:
                raise ModelError(f"no answer within {self._settings.model_timeout_s:g} s") from err
            except (ValidationError, json.JSONDecodeError, ValueError) as err:
                log.warning("%s: unusable answer (%s)", name, err)
                last = err
            except Exception as err:
                log.warning("%s: model call failed: %s", name, err)
                last = err
        raise ModelError(f"no usable answer ({type(last).__name__})") from last


async def _run(
    name: str, model: Model, instruction: str, schema: type[BaseModel], parts: list[types.Part], usage: "ModelCaller"
) -> str:
    agent = LlmAgent(
        name=name,
        model=model,
        static_instruction=instruction,
        output_schema=schema,
        generate_content_config=types.GenerateContentConfig(temperature=0),
    )
    runner = InMemoryRunner(agent=agent, app_name=APP)
    session = await runner.session_service.create_session(app_name=APP, user_id="audit")
    text = ""
    async for event in runner.run_async(
        user_id="audit", session_id=session.id, new_message=types.Content(role="user", parts=parts)
    ):
        if event.usage_metadata:
            usage.tokens_in += event.usage_metadata.prompt_token_count or 0
            usage.tokens_out += (event.usage_metadata.candidates_token_count or 0) + (
                event.usage_metadata.thoughts_token_count or 0
            )
        if event.is_final_response() and event.content and event.content.parts:
            text = "".join(p.text or "" for p in event.content.parts)
    if not text:
        raise ValueError("empty answer")
    return text


def _clean(text: str) -> str:
    return FENCE.sub("", text.strip())
