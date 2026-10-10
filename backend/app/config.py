"""Settings, read from environment variables (see docs/ARCHITECTURE.md §13)."""

from functools import lru_cache
from pathlib import Path
from typing import Annotated, Literal

from pydantic import field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parent.parent
REPO_DIR = BACKEND_DIR.parent

CommaList = Annotated[list[str], NoDecode]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=BACKEND_DIR / ".env", extra="ignore")

    version: str = "dev"
    # Only "replay" is implemented in Phase 1; agents arrive in Phases 2-3.
    model_provider: Literal["replay", "ollama", "gemini"] = "replay"
    store_backend: Literal["memory"] = "memory"

    allowed_hosts: CommaList = ["localhost", "127.0.0.1", "shop-honest.web.app", "shop-honest.firebaseapp.com"]
    # Lets allowlisted hosts resolve to private addresses (localhost in development). Off in production.
    allow_private_targets: bool = True

    # 1 = real time, 2 = twice as fast, 0 = instant.
    replay_speed: float = 1.0
    max_concurrent_audits: int = 20
    recordings_dir: Path = BACKEND_DIR / "app" / "replay" / "recordings"
    cors_origins: CommaList = []

    @field_validator("allowed_hosts", "cors_origins", mode="before")
    @classmethod
    def _split(cls, value: object) -> object:
        if isinstance(value, str):
            return [item.strip().lower() for item in value.split(",") if item.strip()]
        return value


@lru_cache
def get_settings() -> Settings:
    return Settings()
