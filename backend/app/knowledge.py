"""Reference data shared with the web app (exported by `npm run knowledge` into shared/)."""

import json
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Any
from urllib.parse import urlsplit


@dataclass(frozen=True)
class Knowledge:
    patterns: dict[str, dict[str, Any]]
    legal: dict[str, Any]
    price_history: dict[str, dict[str, Any]]

    def pattern(self, pattern_id: str) -> dict[str, Any]:
        return self.patterns[pattern_id]

    def history_for(self, url: str) -> dict[str, Any] | None:
        return self.price_history.get(urlsplit(url).path.rstrip("/"))


@lru_cache
def load_knowledge(shared_dir: Path) -> Knowledge:
    def read(name: str) -> Any:
        return json.loads((shared_dir / name).read_text(encoding="utf-8"))

    return Knowledge(patterns=read("patterns.json"), legal=read("legal.json"), price_history=read("price_history.json"))
