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
    # memory: in-process log and local frames (development, tests). gcp: Firestore + Cloud Storage.
    store_backend: Literal["memory", "gcp"] = "memory"
    frames_bucket: str = "shop-honest-72fd8-audits"
    # Prefix for Firestore collections and Storage objects (tests use one, then clean up).
    store_prefix: str = ""
    # Live audits per visitor per hour and for the whole site per day; 0 = no limit.
    live_per_ip_per_hour: int = 0
    live_per_day: int = 0

    # Sites that can be audited: "*" is any public site (since 15 Oct 2026, ADR-0005); hosts listed by name
    # may also resolve to private addresses when allow_private_targets is on (localhost in development).
    allowed_hosts: CommaList = ["*", "localhost", "127.0.0.1"]
    # Lets allowlisted hosts resolve to private addresses (localhost in development). Off in production.
    allow_private_targets: bool = True

    # 1 = real time, 2 = twice as fast, 0 = instant.
    replay_speed: float = 1.0
    max_concurrent_audits: int = 20
    recordings_dir: Path = BACKEND_DIR / "app" / "replay" / "recordings"
    cors_origins: CommaList = []
    # Also allow origins matching this pattern (the site's Firebase preview channels).
    cors_origin_regex: str | None = None

    # Live audits (a real browser walks the store). Off in deployments until the agents are ready.
    enable_live: bool = True
    max_live_audits: int = 2
    # Seconds the Navigator lingers on the product page before its second look.
    nav_linger_s: float = 8.0
    nav_step_timeout_s: float = 15.0
    audit_timeout_s: float = 360.0
    headless: bool = True
    # Multi-instance: how often the instance running an audit says it's alive, and how long
    # without that before another instance takes over (a replay continues; a live audit fails).
    heartbeat_s: float = 10.0
    abandoned_after_s: float = 45.0
    frames_dir: Path = BACKEND_DIR / "var" / "frames"
    shared_dir: Path = REPO_DIR / "shared"
    # Price history: the demo catalog file (local, tests) or BigQuery (deployed).
    price_history_backend: Literal["json", "bigquery"] = "json"
    bq_dataset: str = "shop_honest"
    bq_table: str = "price_history"
    # Model tokens (input + output) one audit may spend.
    audit_max_tokens: int = 400_000

    # Models (Phase 3). Ollama serves both tiers locally.
    ollama_base_url: str = "http://127.0.0.1:11434"
    ollama_model: str = "gemma3:4b"
    # Context window asked of Ollama, in tokens (a real store's element list can run to several thousand).
    ollama_num_ctx: int = 32768
    # Gemini through Vertex AI (credentials from ADC locally, the service account on Cloud Run),
    # or through Google AI Studio with GOOGLE_API_KEY. Models are served on the global endpoint.
    gemini_backend: Literal["vertex", "ai_studio"] = "vertex"
    google_cloud_project: str = "shop-honest-72fd8"
    google_cloud_location: str = "global"
    gemini_model_fast: str = "gemini-3.6-flash"
    gemini_model_smart: str = "gemini-3.6-flash"
    # Asked when the main model is out of capacity (429/503) even after retries; empty = no fallback.
    gemini_model_fallback: str = "gemini-3.1-flash-lite"
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
    # Run the live audit as ADK agent graphs, with an Adjudicator that checks evidence through tools (ADR-0014).
    # Off: the same steps run one after another in plain Python.
    agent_graph: bool = True
    # Evidence tools the Adjudicator may call per claim before it rules; 0 offers none, for models without
    # tool support (Gemma 3 on Ollama).
    adjudicator_max_tool_calls: int = 2

    @field_validator("allowed_hosts", "cors_origins", mode="before")
    @classmethod
    def _split(cls, value: object) -> object:
        if isinstance(value, str):
            return [item.strip().lower() for item in value.split(",") if item.strip()]
        return value


@lru_cache
def get_settings() -> Settings:
    return Settings()
