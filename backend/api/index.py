"""Vercel entry point.

Vercel's Python runtime looks for an ASGI app in `api/`, and `vercel.json`
rewrites every path here so FastAPI keeps its own routing. Nothing but the
import belongs in this file — the app is built in `app.main.create_app`, which
`app.asgi` calls, so the container and the serverless deployment run the exact
same application.

This works only because the store is out of the process. On serverless each
invocation may land on a different instance with no shared memory, so the
in-memory store would put an upload in one instance and read from another —
losing data BETWEEN consecutive requests, not just on restart. Keep
SUPABASE_DB_URL set here; without it `app.store.factory` falls back to memory
and the deployment misbehaves in a way that looks random.
"""

from app.asgi import app

__all__ = ["app"]
