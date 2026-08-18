import logging

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from starlette.concurrency import run_in_threadpool

from app.db import count_public_tables

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("/health")
async def health(request: Request):
    """DB reachability check. Never leaks error details to the response."""
    settings = request.app.state.settings

    # No database configured is a valid state, not a failure: the service runs
    # on an in-process store. Returning 503 here made every platform health
    # check fail and put the container in a restart loop before Postgres
    # existed.
    if not settings.supabase_db_url:
        return {"status": "ok", "database": "not configured"}

    try:
        tables = await run_in_threadpool(count_public_tables, settings)
    except Exception:
        # Full detail goes to the server log only; the connection string in a
        # psycopg error would expose host/user to the caller.
        logger.exception("health check: database unreachable")
        return JSONResponse({"status": "unavailable"}, status_code=503)
    return {"status": "ok", "database": "reachable", "tables": tables}
