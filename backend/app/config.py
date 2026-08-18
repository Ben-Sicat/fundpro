import logging
from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Environment configuration. See .env.example; never commit real values."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Supabase session-pooler URL (port 5432, sslmode=require). Long import
    # transactions do not belong on the transaction pooler.
    #
    # OPTIONAL. Consolidation currently runs against an in-process store, so
    # the service is fully functional without a database and this is only used
    # by the health check. Making it required meant the container could not
    # boot at all before Postgres existed, which blocked deploying the API and
    # the database independently.
    supabase_db_url: str | None = None
    # Which store to run on: 'auto' | 'memory' | 'postgres'.
    #
    # 'auto' means Postgres when supabase_db_url is set and memory otherwise,
    # so a deployment becomes persistent as soon as the database is configured
    # without a second variable to remember. Force 'memory' to run a throwaway
    # demo against a configured database without writing to it.
    store_backend: str = "auto"
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
