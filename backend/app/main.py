from fastapi import FastAPI

from app.auth import BearerAuthMiddleware
from app.config import Settings, configure_logging, get_settings
from app.routes.health import router as health_router


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()
    configure_logging(settings)

    application = FastAPI(
        title="FundPro preprocessing service",
        # Server-to-server API: no docs surface, no CORS.
        docs_url=None,
        redoc_url=None,
        openapi_url=None,
    )
    application.state.settings = settings
    application.include_router(health_router)
    application.add_middleware(BearerAuthMiddleware, api_key=settings.api_key)
    return application
