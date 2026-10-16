"""A model that counts against one audit's budgets, for agents that run inside an ADK graph.

ModelCaller.ask enforces the budgets around a single call it makes itself. In
the agent graph, ADK calls the model (an agent may call it several times while
it uses tools), so the budgets move into the model: every call is counted,
refused once the call or token budget is spent, limited to the audit's
concurrency and given the same time limit.
"""

import asyncio
from collections.abc import AsyncGenerator
from typing import TYPE_CHECKING

from google.adk.models import LlmCapabilities
from google.adk.models.base_llm import BaseLlm
from google.adk.models.llm_request import LlmRequest
from google.adk.models.llm_response import LlmResponse
from google.adk.models.registry import LLMRegistry
from pydantic import PrivateAttr

from app.models import Model
from app.models.call import ModelError

if TYPE_CHECKING:
    from app.models.call import ModelCaller


class MeteredLlm(BaseLlm):
    inner: BaseLlm
    _caller: "ModelCaller" = PrivateAttr()

    @classmethod
    def wrap(cls, model: Model, caller: "ModelCaller") -> "MeteredLlm":
        inner = model if isinstance(model, BaseLlm) else LLMRegistry.new_llm(model)
        metered = cls(model=inner.model, inner=inner)
        metered._caller = caller
        return metered

    @property
    def capabilities(self) -> LlmCapabilities:
        # What the wrapped model supports (e.g. Gemini on Vertex pairs an output schema with tools natively).
        return self.inner.capabilities

    async def generate_content_async(self, llm_request: LlmRequest, stream: bool = False) -> AsyncGenerator[LlmResponse, None]:
        caller = self._caller
        caller.claim()
        try:
            async with caller.slots:
                async with asyncio.timeout(caller.timeout_s):
                    # Collected before yielding: the time limit must not run on while ADK handles a response.
                    responses = [r async for r in self.inner.generate_content_async(llm_request, stream=False)]
        except TimeoutError as err:
            raise ModelError(f"no answer within {caller.timeout_s:g} s") from err
        for response in responses:
            caller.add_usage(response.usage_metadata)
            yield response
