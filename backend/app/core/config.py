"""Global application settings, loaded from environment / .env file."""
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parent.parent.parent  # backend/
DATA_DIR = BASE_DIR / "data"
CONFIGS_DIR = BASE_DIR / "configs"
KB_DIR = DATA_DIR / "kb"
SKILLS_DIR = DATA_DIR / "skills"
DB_PATH = DATA_DIR / "db" / "app.db"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(BASE_DIR / ".env"), env_prefix="CTFAI_", extra="ignore")

    host: str = "0.0.0.0"
    port: int = 8900
    # Default LLM provider; per-agent overrides live in agent configs.
    llm_api_key: str = ""
    llm_base_url: str = "https://api.openai.com/v1"
    llm_model: str = "gpt-4o-mini"
    llm_temperature: float = 0.3
    llm_max_tokens: int = 4096

    kb_top_k: int = 5

    # Default env injected into stdio MCP servers (JSON object string)
    mcp_default_env: dict = {}


settings = Settings()

# Ensure data dirs exist
for d in (DATA_DIR, KB_DIR, CONFIGS_DIR / "agents", SKILLS_DIR, DB_PATH.parent):
    d.mkdir(parents=True, exist_ok=True)
