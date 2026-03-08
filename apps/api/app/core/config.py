from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="FINCEPT_", env_file=".env", extra="ignore")

    environment: str = "development"
    api_v1_prefix: str = "/api/v1"
    cors_origins: list[str] = Field(
        default_factory=lambda: ["http://localhost:5173", "http://localhost:1420"]
    )
    project_root: Path = Path(__file__).resolve().parents[3]
    legacy_frontend_root: Path = Field(
        default_factory=lambda: Path(__file__).resolve().parents[3] / "fincept-terminal-desktop"
    )
    legacy_scripts_root: Path = Field(
        default_factory=lambda: Path(__file__).resolve().parents[2] / "legacy_scripts"
    )
    upload_root: Path = Field(default_factory=lambda: Path(__file__).resolve().parents[1] / "data" / "uploads")
    job_poll_interval_ms: int = 1000


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    settings = Settings()
    settings.upload_root.mkdir(parents=True, exist_ok=True)
    return settings
