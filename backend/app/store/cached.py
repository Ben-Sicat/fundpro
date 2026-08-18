"""A request-scoped read cache in front of a Store.

Several endpoints read the same collection many times while answering one
request. The export catalogue was the worst case: it looped over fourteen
templates and, for each, built the whole report to count its columns and
re-counted every billing event and exception — so a single request issued
fourteen full table reads. Against the in-memory store those are dictionary
lookups and cost nothing, which is why it survived review; against Postgres
each one is a network round trip, and the endpoint took over eighty seconds.

Wrapping the store for the duration of ONE call collapses that back to one read
per collection. Deliberately NOT a cache on the store itself: the store is a
process-wide singleton, so memoising there would serve stale data to later
requests and be invisible when it did. A wrapper that lives only as long as the
call it was created for cannot go stale.

Reads only. Every write passes straight through and clears the affected entry,
so a caller that writes and then re-reads within the same request still sees its
own write.
"""

from __future__ import annotations

from typing import Any

from app.domain.models import BillingEvent, ImportException, Pledge


class CachedStore:
    """Delegates everything; memoises the three expensive whole-table reads."""

    #: Only collections that are read repeatedly AND read whole. Anything
    #: keyed by argument (events_for, get_pledge) is left alone — caching those
    #: means holding a dict per key, for reads that are already indexed.
    def __init__(self, inner: Any) -> None:
        self._inner = inner
        self._pledges: list[Pledge] | None = None
        self._events: list[BillingEvent] | None = None
        self._exceptions: list[ImportException] | None = None

    # -- memoised reads -----------------------------------------------------

    def all_pledges(self) -> list[Pledge]:
        if self._pledges is None:
            self._pledges = self._inner.all_pledges()
        return self._pledges

    def all_billing_events(self) -> list[BillingEvent]:
        if self._events is None:
            self._events = self._inner.all_billing_events()
        return self._events

    def all_exceptions(self) -> list[ImportException]:
        if self._exceptions is None:
            self._exceptions = self._inner.all_exceptions()
        return self._exceptions

    # -- writes invalidate what they touch ----------------------------------

    def upsert_pledge(self, pledge: Pledge) -> None:
        self._pledges = None
        self._inner.upsert_pledge(pledge)

    def add_billing_event(self, event: BillingEvent) -> bool:
        self._events = None
        return self._inner.add_billing_event(event)

    def add_exception(self, exception: ImportException) -> bool:
        self._exceptions = None
        return self._inner.add_exception(exception)

    def clear_exceptions_for(self, serial_no: str) -> int:
        self._exceptions = None
        return self._inner.clear_exceptions_for(serial_no)

    def resolve_exception(self, exception_id: str) -> ImportException | None:
        self._exceptions = None
        return self._inner.resolve_exception(exception_id)

    # -- everything else -----------------------------------------------------

    def __getattr__(self, name: str) -> Any:
        """Pass through, so this stays a drop-in for the full Store surface.

        Only reached for names not defined above, and `_inner` is set in
        __init__ before any lookup can miss, so this cannot recurse.
        """
        return getattr(self._inner, name)


__all__ = ["CachedStore"]
