import logging
from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Environment configuration. See .env.example; never commit real values."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Supabase session-pooler URL (port 5432, sslmode=require). Long import
    # transactions do not belong on the transaction pooler.
    supabase_db_url: str
    # Bearer token the Next.js server sends on every request.
    api_key: str
    log_level: str = "INFO"


@lru_cache
def get_settings() -> Settings:
    return Settings()


def configure_logging(settings: Settings) -> None:
    # PII rule (RA 10173): log serials and counts, never names/emails/cards.
    logging.basicConfig(
        level=settings.log_level.upper(),
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )
