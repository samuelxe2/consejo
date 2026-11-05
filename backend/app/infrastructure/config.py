from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "sqlite:///./helpdesk.db"
    classifier: Literal["rules", "llm"] = "rules"
    faq_threshold: float = 0.6
    token_ttl_min: int = 480
    cors_origins: str = "http://localhost:4200"
    seed_demo_tickets: bool = True

    llm_api_key: str = ""
    llm_model: str = "claude-haiku-5-5"
    llm_timeout_s: float = 3.0
    llm_min_confidence: float = 0.6

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]
