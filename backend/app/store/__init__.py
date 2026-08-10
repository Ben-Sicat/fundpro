"""Persistence seam.

`Store` is the only thing the services talk to. Today it is an in-memory
implementation; the Postgres one implements the same surface, so wiring the
database later touches this package and nothing else.

Backend integration is deliberately pinned for now (owner's call, 2026-08-07):
the API, the parsing and every business rule are finished and tested against
the in-memory store, and swapping in psycopg is a contained follow-up.
"""

from app.store.memory import Store, get_store, reset_store

__all__ = ["Store", "get_store", "reset_store"]
