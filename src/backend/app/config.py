from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

# Absolute path so DB location does not depend on process CWD (e.g. uvicorn).
_BACKEND_DIR = Path(__file__).resolve().parent.parent
_DEFAULT_DB_PATH = _BACKEND_DIR / "conversation_orchestrator.db"
DEFAULT_DATABASE_URL = f"sqlite:///{_DEFAULT_DB_PATH}"


class Settings(BaseSettings):
    """Application configuration."""

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    app_name: str = "Conversation Orchestrator"
    database_url: str = DEFAULT_DATABASE_URL

    llm_model_name: str = "stub-echo"


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()

