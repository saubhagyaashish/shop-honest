"""Model providers (ADR-0003): agents ask for a *fast* or *smart* model, never a vendor.

replay  no model; live audits are measured-only
ollama  a local model (Gemma 3 4B by default) through ADK's LiteLLM connector
gemini  Gemini through Google AI Studio (GOOGLE_API_KEY) or Vertex AI
"""

import os
from dataclasses import dataclass
from typing import Literal

from google.adk.models.base_llm import BaseLlm

from app.config import Settings

Tier = Literal["fast", "smart"]
Model = BaseLlm | str


def model_for(tier: Tier, settings: Settings) -> Model | None:
    if settings.model_provider == "ollama":
        from google.adk.models.lite_llm import LiteLlm

        return LiteLlm(model=f"ollama_chat/{settings.ollama_model}", api_base=settings.ollama_base_url)
    if settings.model_provider == "gemini":
        # ADK's Gemini client reads its backend from the environment; backend/.env only reaches Settings.
        # (GOOGLE_GENAI_USE_ENTERPRISE replaces the deprecated GOOGLE_GENAI_USE_VERTEXAI.)
        os.environ.pop("GOOGLE_GENAI_USE_VERTEXAI", None)
        if settings.gemini_backend == "vertex":
            os.environ["GOOGLE_GENAI_USE_ENTERPRISE"] = "TRUE"
            os.environ["GOOGLE_CLOUD_PROJECT"] = settings.google_cloud_project
            os.environ["GOOGLE_CLOUD_LOCATION"] = settings.google_cloud_location
        else:
            os.environ["GOOGLE_GENAI_USE_ENTERPRISE"] = "FALSE"
            if settings.google_api_key:
                os.environ["GOOGLE_API_KEY"] = settings.google_api_key.get_secret_value()
        name = settings.gemini_model_smart if tier == "smart" else settings.gemini_model_fast
        model = _gemini(name)
        if settings.gemini_model_fallback and settings.gemini_model_fallback != name:
            from app.models.fallback import FallbackLlm

            return FallbackLlm(model=name, primary=model, fallback=_gemini(settings.gemini_model_fallback))
        return model
    return None


def _gemini(name: str) -> BaseLlm:
    """A Gemini model that retries busy (429) and unavailable (5xx) answers with backoff: 2, 4, 8 s, plus jitter."""
    from google.adk.models.google_llm import Gemini
    from google.genai import types

    retry = types.HttpRetryOptions(
        attempts=4, initial_delay=2.0, max_delay=16.0, exp_base=2.0, jitter=1.0, http_status_codes=[408, 429, 500, 502, 503, 504]
    )
    return Gemini(model=name, retry_options=retry)


@dataclass(frozen=True)
class ModelSet:
    smart: Model
    fast: Model
    # How the audit trail names it, e.g. "gemma3:4b (local, Ollama)".
    name: str


def model_set(settings: Settings) -> ModelSet | None:
    smart = model_for("smart", settings)
    fast = model_for("fast", settings)
    if smart is None or fast is None:
        return None
    return ModelSet(smart=smart, fast=fast, name=describe(settings))


def describe(settings: Settings) -> str:
    """How the audit trail names the model that judged a run."""
    if settings.model_provider == "ollama":
        return f"{settings.ollama_model} (local, Ollama)"
    if settings.model_provider == "gemini":
        if settings.gemini_model_smart == settings.gemini_model_fast:
            return f"Gemini ({settings.gemini_model_smart})"
        return f"Gemini ({settings.gemini_model_smart} + {settings.gemini_model_fast})"
    return "no model"
