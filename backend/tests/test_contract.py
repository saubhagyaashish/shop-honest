"""Keeps the hand-written Pydantic models and the recordings honest against the TS contract."""

import json

import pytest

from app.config import Settings
from app.contract.models import AUDIT_EVENT, dump
from app.replay.player import RecordingLibrary
from tests.conftest import EVENT_VALIDATOR

LIBRARY = RecordingLibrary.load(Settings(_env_file=None).recordings_dir)


def test_every_demo_store_has_a_recording():
    assert {r.store for r in LIBRARY.recordings} == {"store-a", "store-b", "store-c"}


@pytest.mark.parametrize("recording", LIBRARY.recordings, ids=lambda r: r.store)
def test_recorded_events_round_trip_through_the_models(recording):
    for _, event in recording.play("aud_test", "http://localhost:5173"):
        assert not list(EVENT_VALIDATOR.iter_errors(event)), event["type"]
        model = AUDIT_EVENT.validate_python(event)
        assert json.loads(json.dumps(dump(model))) == event, f"{event['type']} lost or changed fields"


def test_models_reject_unknown_fields():
    with pytest.raises(ValueError):
        AUDIT_EVENT.validate_python({"type": "agent.log", "agent": "navigator", "message": "hi", "extra": 1})
