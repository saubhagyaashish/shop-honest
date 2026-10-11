"""Reference data shared with the web app (exported by `npm run knowledge` into shared/)."""

import json
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Any


@dataclass(frozen=True)
class Knowledge:
    patterns: dict[str, dict[str, Any]]
    legal: dict[str, Any]

    def pattern(self, pattern_id: str) -> dict[str, Any]:
        return self.patterns[pattern_id]


@lru_cache
def load_knowledge(shared_dir: Path) -> Knowledge:
    def read(name: str) -> Any:
        return json.loads((shared_dir / name).read_text(encoding="utf-8"))

    return Knowledge(patterns=read("patterns.json"), legal=read("legal.json"))
