from fastapi import FastAPI

from app.auth import BearerAuthMiddleware
from app.config import Settings, configure_logging, get_settings
from app.routes.dashboard import router as dashboard_router
from app.routes.exports import router as exports_router
from app.routes.health import router as health_router
from app.routes.payroll import router as payroll_router
from app.routes.pledges import router as pledges_router
from app.routes.settings import router as settings_router
from app.routes.team import router as team_router
from app.routes.uploads import router as uploads_router


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

    for router in (
        health_router,
        pledges_router,
        dashboard_router,
        team_router,
        uploads_router,
        exports_router,
        payroll_router,
        settings_router,
    ):
        application.include_router(router)

    application.add_middleware(BearerAuthMiddleware, api_key=settings.api_key)
    return application
