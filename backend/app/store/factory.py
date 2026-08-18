"""Which store the service runs on.

One selection point, so nothing else in the codebase has to know whether it is
talking to Postgres or to memory. `app/routes/deps.py` depends on `get_store`
from here and the tests override that same symbol.

`store_backend` defaults to `auto`: Postgres when `SUPABASE_DB_URL` is set,
memory otherwise. That keeps the container bootable before a database exists —
the reason the URL is optional in the first place — while making a configured
deployment persistent without a second env var to remember.

The Postgres store is built LAZILY, on first use. Constructing it opens a
connection pool, and doing that at import time would mean an unreachable
database prevented the process from starting at all, turning a recoverable
outage into a crash loop.
"""

from __future__ import annotations

import logging
import threading

from app.config import Settings, get_settings
from app.store.memory import Store, seed_demo
from app.store.postgres import PostgresStore

logger = logging.getLogger(__name__)

#: Either implementation. They share a surface but no base class — the memory
#: one is a plain dataclass-ish object and inheritance would invite sharing
#: implementation that must not be shared.
StoreLike = Store | PostgresStore

_lock = threading.Lock()
_instance: StoreLike | None = None


def _build(settings: Settings) -> StoreLike:
    backend = (settings.store_backend or "auto").lower()

    if backend == "memory" or (backend == "auto" and not settings.supabase_db_url):
        logger.warning(
            "using the IN-MEMORY store: uploads are lost on restart and a second "
            "worker would serve a different copy of the data"
        )
        store = Store()
        seed_demo(store)
        return store

    if not settings.supabase_db_url:
        raise RuntimeError("store_backend=postgres requires SUPABASE_DB_URL")

    logger.info("using the Postgres store")
    return PostgresStore(settings.supabase_db_url)


def get_store() -> StoreLike:
    """FastAPI dependency. Overridden in tests with a fresh instance."""
    global _instance
    if _instance is None:
        with _lock:
            # Re-check inside the lock: two requests arriving together must not
            # each build a store, or one of them opens a pool nobody closes.
            if _instance is None:
                _instance = _build(get_settings())
    return _instance


def reset_store() -> StoreLike:
    """Drop the current store and build a fresh one. Tests and CLI only."""
    global _instance
    with _lock:
        previous = _instance
        _instance = None
    if isinstance(previous, PostgresStore):
        previous.close()
    return get_store()


__all__ = ["StoreLike", "get_store", "reset_store"]
