"""Recorded audit runs, played back as if live (docs/decisions/0004-replay-and-run-live.md).

Recordings are exported by `npm run recordings` in web/ (today from the
scripted mock; from Phase 2 onwards from real agent runs). They contain
placeholders for the audit id and the site origin, filled in per audit.
"""

import json
from collections.abc import Iterator
from dataclasses import dataclass
from pathlib import Path
from typing import Any
from urllib.parse import urlsplit


@dataclass(frozen=True)
class Recording:
    store: str
    path_prefix: str
    source: str
    recorded_at: str
    placeholders: dict[str, str]
    events: list[dict[str, Any]]

    def matches(self, url: str) -> bool:
        path = urlsplit(url).path
        return path.startswith(self.path_prefix) or path == self.path_prefix.rstrip("/")

    def play(self, audit_id: str, origin: str) -> Iterator[tuple[float, dict[str, Any]]]:
        """Yield (delay in seconds, event) with the placeholders filled in."""
        for item in self.events:
            raw = json.dumps(item["event"], ensure_ascii=False)
            raw = raw.replace(self.placeholders["auditId"], audit_id).replace(self.placeholders["origin"], origin)
            yield item["delayMs"] / 1000, json.loads(raw)


class RecordingLibrary:
    def __init__(self, recordings: list[Recording]) -> None:
        self.recordings = recordings

    @classmethod
    def load(cls, directory: Path) -> "RecordingLibrary":
        recordings = []
        for file in sorted(directory.glob("*.json")):
            data = json.loads(file.read_text(encoding="utf-8"))
            recordings.append(
                Recording(
                    store=data["store"],
                    path_prefix=data["pathPrefix"],
                    source=data["source"],
                    recorded_at=data["recordedAt"],
                    placeholders=data["placeholders"],
                    events=data["events"],
                )
            )
        return cls(recordings)

    def match(self, url: str) -> Recording | None:
        return next((r for r in self.recordings if r.matches(url)), None)


def origin_of(url: str) -> str:
    parts = urlsplit(url)
    return f"{parts.scheme}://{parts.netloc}"
