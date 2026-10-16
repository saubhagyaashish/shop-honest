"""A model that falls back to a second one when the first is out of capacity.

Gemini on Vertex's global endpoint runs on shared capacity and answers 429
(resource exhausted) or 503 under load. Each Gemini model already retries
those with backoff (see model_for); if it still can't answer, this asks the
fallback model instead, so a busy minute costs a little quality, not a screen.
"""

import logging
from collections.abc import AsyncGenerator

from google.adk.models import LlmCapabilities
from google.adk.models.base_llm import BaseLlm
from google.adk.models.llm_request import LlmRequest
from google.adk.models.llm_response import LlmResponse
from google.genai import errors

log = logging.getLogger(__name__)


def out_of_capacity(err: BaseException) -> bool:
    return isinstance(err, errors.ServerError) or (isinstance(err, errors.ClientError) and err.code == 429)


class FallbackLlm(BaseLlm):
    primary: BaseLlm
    fallback: BaseLlm

    @property
    def capabilities(self) -> LlmCapabilities:
        # What both models can do: a request built for the primary must also suit the fallback.
        primary, fallback = self.primary.capabilities, self.fallback.capabilities
        return LlmCapabilities(output_schema_and_tools=primary.output_schema_and_tools and fallback.output_schema_and_tools)

    async def generate_content_async(self, llm_request: LlmRequest, stream: bool = False) -> AsyncGenerator[LlmResponse, None]:
        backup = llm_request.model_copy(deep=True)
        try:
            llm_request.model = self.primary.model
            async for response in self.primary.generate_content_async(llm_request, stream):
                yield response
            return
        except Exception as err:
            if not out_of_capacity(err):
                raise
            log.warning("%s out of capacity (%s); asking %s", self.primary.model, getattr(err, "code", "?"), self.fallback.model)
        backup.model = self.fallback.model
        async for response in self.fallback.generate_content_async(backup, stream):
            yield response
