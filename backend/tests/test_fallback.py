"""The Gemini fallback: a model out of capacity hands over to the backup; other errors don't."""

import pytest
from google.genai import errors, types
from pydantic import BaseModel

from app.config import Settings
from app.models import model_for
from app.models.call import ModelCaller, ModelError
from app.models.fallback import FallbackLlm
from app.models.scripted import ScriptedLlm
from tests.conftest import make_settings


class Answer(BaseModel):
    ok: bool


class Failing(ScriptedLlm):
    error: Exception

    async def generate_content_async(self, llm_request, stream=False):
        self.calls += 1
        raise self.error
        yield  # pragma: no cover


def busy() -> errors.ClientError:
    return errors.ClientError(429, {"error": {"code": 429, "message": "Resource exhausted", "status": "RESOURCE_EXHAUSTED"}})


async def ask(model) -> Answer:
    return await ModelCaller(make_settings()).ask(
        name="t", model=model, instruction="x", schema=Answer, parts=[types.Part(text="hi")]
    )


async def test_a_busy_model_hands_over_to_the_fallback():
    primary = Failing(model="primary", responder=lambda s, u, i: "", error=busy())
    backup = ScriptedLlm(model="backup", responder=lambda s, u, i: '{"ok": true}')
    assert (await ask(FallbackLlm(model="primary", primary=primary, fallback=backup))).ok
    assert backup.calls >= 1


async def test_other_errors_are_not_masked_by_the_fallback():
    bad_request = errors.ClientError(400, {"error": {"code": 400, "message": "Bad request", "status": "INVALID_ARGUMENT"}})
    primary = Failing(model="primary", responder=lambda s, u, i: "", error=bad_request)
    backup = ScriptedLlm(model="backup", responder=lambda s, u, i: '{"ok": true}')
    with pytest.raises(ModelError):
        await ask(FallbackLlm(model="primary", primary=primary, fallback=backup))
    assert backup.calls == 0


def test_gemini_models_retry_with_backoff_and_have_a_fallback():
    model = model_for("smart", Settings(_env_file=None, model_provider="gemini"))
    assert isinstance(model, FallbackLlm)
    assert (model.primary.model, model.fallback.model) == ("gemini-3.8-flash", "gemini-2.5-flash")
    retry = model.primary.retry_options
    assert retry.attempts == 4 and 429 in retry.http_status_codes and 503 in retry.http_status_codes
    no_fallback = model_for("smart", Settings(_env_file=None, model_provider="gemini", gemini_model_fallback=""))
    assert not isinstance(no_fallback, FallbackLlm)
