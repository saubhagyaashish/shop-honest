"""Settings, read from environment variables (see docs/ARCHITECTURE.md §13)."""

from functools import lru_cache
from pathlib import Path
from typing import Annotated, Literal

from pydantic import SecretStr, field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parent.parent
REPO_DIR = BACKEND_DIR.parent

CommaList = Annotated[list[str], NoDecode]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=BACKEND_DIR / ".env", extra="ignore")

    version: str = "dev"
    # Which model judges live audits (ADR-0003). "replay": no model, live audits are measured-only.
    model_provider: Literal["replay", "ollama", "gemini"] = "replay"
    store_backend: Literal["memory"] = "memory"

    allowed_hosts: CommaList = ["localhost", "127.0.0.1", "shop-honest-ai.web.app", "shop-honest-ai.firebaseapp.com"]
    # Lets allowlisted hosts resolve to private addresses (localhost in development). Off in production.
    allow_private_targets: bool = True

    # 1 = real time, 2 = twice as fast, 0 = instant.
    replay_speed: float = 1.0
    max_concurrent_audits: int = 20
    recordings_dir: Path = BACKEND_DIR / "app" / "replay" / "recordings"
    cors_origins: CommaList = []

    # Live audits (a real browser walks the store). Off in deployments until the agents are ready.
    enable_live: bool = True
    max_live_audits: int = 2
    # Seconds the Navigator lingers on the product page before its second look.
    nav_linger_s: float = 8.0
    nav_step_timeout_s: float = 15.0
    audit_timeout_s: float = 360.0
    headless: bool = True
    frames_dir: Path = BACKEND_DIR / "var" / "frames"
    shared_dir: Path = REPO_DIR / "shared"

    # Models (Phase 3). Ollama serves both tiers locally.
    ollama_base_url: str = "http://127.0.0.1:11434"
    ollama_model: str = "gemma3:4b"
    # Provisional: confirm against the key's model list before relying on them.
    gemini_model_fast: str = "gemini-2.5-flash"
    gemini_model_smart: str = "gemini-2.5-pro"
    google_api_key: SecretStr | None = None
    model_timeout_s: float = 90.0
    audit_max_model_calls: int = 40
    model_concurrency: int = 2
    # Model findings at or above this confidence are confirmed; below it they go to human review.
    review_threshold: float = 0.75
    # A second model call checks each claim against a crop of its evidence before it's reported.
    adjudicator_verify: bool = True
    # Claims the verifier agrees with less than this are dropped.
    reject_below: float = 0.35

    @field_validator("allowed_hosts", "cors_origins", mode="before")
    @classmethod
    def _split(cls, value: object) -> object:
        if isinstance(value, str):
            return [item.strip().lower() for item in value.split(",") if item.strip()]
        return value


@lru_cache
def get_settings() -> Settings:
    return Settings()
