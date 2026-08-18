"""Persistence seam.

`Store` is the only thing the services talk to, and they talk to it only
through its METHODS. That second half was not true until 2026-08-18: roughly
thirty call sites read and mutated the underlying lists directly
(`store.uploads.append(...)`, `store.uploads[-1] = ...`,
`store.leaders.append(...)`), and one mutated the dataclass handed back by
`find_fundraiser` and relied on it being the same object the store held. None
of that can be honoured by a database, which cannot hand out a live mutable
Python list, so the swap was blocked on closing it.

`tests/test_store_seam.py` now fails the build if direct attribute access
comes back. Add a method rather than reaching past one.

Backend integration is deliberately pinned for now (owner's call, 2026-08-07):
the API, the parsing and every business rule are finished and tested against
the in-memory store. Note that merge semantics deliberately live in the
service layer (`merge_application`), not here, so a second implementation
inherits them instead of restating them.
"""

from app.store.memory import Store, get_store, reset_store

__all__ = ["Store", "get_store", "reset_store"]
