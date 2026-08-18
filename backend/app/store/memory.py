"""In-memory store.

Holds exactly what the Postgres schema holds, with the same invariants
enforced in code rather than by constraints:

- `billing_events` is APPEND-ONLY and deduped on the natural key
  `(serial_no, status_id, status_date)`, which is what makes re-uploading the
  same bank file a no-op.
- A pledge's current status is DERIVED from the latest event, never written
  directly by a caller.
- Nothing here can hold a full card number.
"""

from __future__ import annotations

import itertools
from dataclasses import dataclass, field
from datetime import UTC, datetime

from app.domain.models import (
    AuditEntry,
    BillingEvent,
    ExportRun,
    ImportException,
    Pledge,
    PledgeNote,
    Upload,
)
from app.domain.reference import Settings


@dataclass
class FundraiserSeed:
    """Roster entry. Mirrors the frontend's team management fields."""

    name: str
    code: str
    leader_names: list[str] = field(default_factory=list)
    active: bool = True
    start_date: str | None = None
    end_date: str | None = None
    #: Performance tier (their STOPLIGHT). None until someone grades them.
    tier: str | None = None


@dataclass
class SiteSeed:
    name: str
    location_name: str
    country: str
    charity_code: str
    starts_on: str | None = None
    ends_on: str | None = None


class Store:
    """Everything the service layer reads and writes."""

    def __init__(self) -> None:
        self.settings = Settings()
        self.pledges: dict[str, Pledge] = {}
        self.billing_events: list[BillingEvent] = []
        self.notes: list[PledgeNote] = []
        self.uploads: list[Upload] = []
        self.exceptions: list[ImportException] = []
        self.fundraisers: list[FundraiserSeed] = []
        self.leaders: list[str] = []
        self.sites: list[SiteSeed] = []
        self.export_runs: list[ExportRun] = []
        self.audit: list[AuditEntry] = []
        self._counter = itertools.count(1)
        #: Natural keys already seen, so a re-upload cannot duplicate history.
        self._event_keys: set[tuple[str, int, str]] = set()

    # -- ids ----------------------------------------------------------------

    def next_id(self, prefix: str) -> str:
        return f"{prefix}_{next(self._counter):06d}"

    # -- pledges ------------------------------------------------------------

    def upsert_pledge(self, pledge: Pledge) -> None:
        self.pledges[pledge.serial_no] = pledge

    def get_pledge(self, serial_no: str) -> Pledge | None:
        return self.pledges.get(serial_no)

    def all_pledges(self) -> list[Pledge]:
        return list(self.pledges.values())

    # -- billing events (append-only) ---------------------------------------

    def add_billing_event(self, event: BillingEvent) -> bool:
        """Append one event. Returns False if it was already on file.

        The dedupe key is the natural key from the schema. Without it, the
        daily Status Report — which repeats yesterday's rows — would double
        every pledge's history on each upload.
        """
        key = (event.serial_no, event.status_id, event.status_date.isoformat())
        if key in self._event_keys:
            return False
        self._event_keys.add(key)
        self.billing_events.append(event)
        return True

    # -- exceptions ---------------------------------------------------------

    def add_exception(self, exception: ImportException) -> bool:
        """Add a review-queue row, unless the same problem is already open.

        Re-uploading yesterday's bank file is routine, and every unmatched row
        in it would otherwise appear on the review list again. Billing events
        dedupe for exactly this reason; the review queue has to as well, or the
        count grows every morning and stops meaning anything.

        Keyed on (serial, problem) among UNRESOLVED rows only: if someone
        resolved it and the same problem recurs, that is worth surfacing again.
        """
        key = (exception.serial_no, exception.problem)
        if any((e.serial_no, e.problem) == key and not e.resolved for e in self.exceptions):
            return False
        self.exceptions.append(exception)
        return True

    def clear_exceptions_for(self, serial_no: str) -> int:
        """Close any open review item for a serial that has now consolidated.

        Without this, fixing the underlying problem leaves the original
        complaint sitting in the queue: the operator classifies the unknown
        bank code, re-uploads, the rows go through — and the review list still
        shows the same seven items. Resolving them is bookkeeping the system
        can do for itself.
        """
        closed = 0
        for index, exception in enumerate(self.exceptions):
            if exception.serial_no == serial_no and not exception.resolved:
                self.exceptions[index] = exception.model_copy(update={"resolved": True})
                closed += 1
        return closed

    def events_for(self, serial_no: str) -> list[BillingEvent]:
        return sorted(
            (e for e in self.billing_events if e.serial_no == serial_no),
            key=lambda e: (e.status_date, e.attempt_no),
        )

    def events_from_upload(self, upload_id: str) -> list[BillingEvent]:
        return [e for e in self.billing_events if e.upload_id == upload_id]

    # -- notes --------------------------------------------------------------

    def add_note(self, note: PledgeNote) -> None:
        self.notes.append(note)

    def notes_for(self, serial_no: str) -> list[PledgeNote]:
        return sorted(
            (n for n in self.notes if n.serial_no == serial_no),
            key=lambda n: n.created_at,
            reverse=True,
        )

    # -- uploads ------------------------------------------------------------
    #
    # Callers used to append to and index into `self.uploads` directly. A
    # Postgres-backed store cannot hand out a live mutable list, so every
    # read and write goes through a method.

    def add_upload(self, upload: Upload) -> None:
        self.uploads.append(upload)

    def replace_upload(self, upload: Upload) -> None:
        """Overwrite an upload row in place, matched on id.

        Consolidation writes the upload, dedupes its exceptions, then restates
        the count — previously by assigning to `uploads[-1]`, which only worked
        because nothing else could append in between.
        """
        for index, existing in enumerate(self.uploads):
            if existing.id == upload.id:
                self.uploads[index] = upload
                return
        self.uploads.append(upload)

    def all_uploads(self) -> list[Upload]:
        return list(self.uploads)

    def get_upload(self, upload_id: str) -> Upload | None:
        return next((u for u in self.uploads if u.id == upload_id), None)

    # -- exceptions (reads) -------------------------------------------------

    def all_exceptions(self) -> list[ImportException]:
        return list(self.exceptions)

    def resolve_exception(self, exception_id: str) -> ImportException | None:
        """Mark one review item resolved and return it, or None if unknown."""
        for index, existing in enumerate(self.exceptions):
            if existing.id == exception_id:
                resolved = existing.model_copy(update={"resolved": True})
                self.exceptions[index] = resolved
                return resolved
        return None

    def open_exception_count(self, upload_id: str) -> int:
        return sum(
            1 for e in self.exceptions if e.upload_id == upload_id and not e.resolved
        )

    # -- billing events (reads) ---------------------------------------------

    def all_billing_events(self) -> list[BillingEvent]:
        return list(self.billing_events)

    # -- export runs --------------------------------------------------------

    def add_export_run(self, run: ExportRun) -> None:
        self.export_runs.append(run)

    def all_export_runs(self) -> list[ExportRun]:
        return list(self.export_runs)

    # -- audit (reads) ------------------------------------------------------

    def all_audit(self) -> list[AuditEntry]:
        return list(self.audit)

    # -- team ---------------------------------------------------------------

    def all_fundraisers(self) -> list[FundraiserSeed]:
        return list(self.fundraisers)

    def add_fundraiser(self, seed: FundraiserSeed) -> None:
        self.fundraisers.append(seed)

    def save_fundraiser(self, seed: FundraiserSeed) -> None:
        """Persist edits to a roster entry, matched on identity then code.

        Callers used to mutate the dataclass returned by `find_fundraiser` and
        rely on it being the same object the store holds. That is true here and
        false for any database, so the write is now explicit. Matching on
        identity first means a rename that changes `code` still lands.
        """
        for index, existing in enumerate(self.fundraisers):
            if existing is seed or existing.code == seed.code:
                self.fundraisers[index] = seed
                return
        self.fundraisers.append(seed)

    def all_leaders(self) -> list[str]:
        return list(self.leaders)

    def add_leader(self, name: str) -> bool:
        """Add a leader. Returns False if already on the roster."""
        if name in self.leaders:
            return False
        self.leaders.append(name)
        return True

    def all_sites(self) -> list[SiteSeed]:
        return list(self.sites)

    def find_fundraiser(self, code: str) -> FundraiserSeed | None:
        return next((f for f in self.fundraisers if f.code == code), None)

    def leaders_of(self, name: str) -> list[str]:
        found = next((f for f in self.fundraisers if f.name == name), None)
        return list(found.leader_names) if found else []

    def ensure_fundraiser(self, name: str) -> FundraiserSeed:
        """Create a roster entry for a name seen in an import.

        An imported pledge naming someone who is not on the roster would
        otherwise vanish from every per-fundraiser roll-up.
        """
        existing = next((f for f in self.fundraisers if f.name == name), None)
        if existing:
            return existing
        seed = FundraiserSeed(name=name, code=self.next_id("FR"), leader_names=[])
        self.fundraisers.append(seed)
        return seed

    def ensure_site(self, name: str, *, location_name: str, country: str, charity: str) -> None:
        if any(s.name == name for s in self.sites):
            return
        self.sites.append(
            SiteSeed(
                name=name,
                location_name=location_name or name,
                country=country,
                charity_code=charity,
            )
        )

    # -- audit --------------------------------------------------------------

    def log(self, actor: str, action: str, detail: str, *, contains_pii: bool = False) -> None:
        """Audit trail. Detail must never contain donor PII (RA 10173)."""
        self.audit.append(
            AuditEntry(
                id=self.next_id("aud"),
                at=datetime.now(UTC),
                actor=actor,
                action=action,
                detail=detail,
                contains_pii=contains_pii,
            )
        )


_store: Store | None = None


def get_store() -> Store:
    """FastAPI dependency. Overridden in tests with a fresh instance."""
    global _store
    if _store is None:
        _store = Store()
    return _store


def reset_store() -> Store:
    global _store
    _store = Store()
    return _store


def seed_demo(store: Store) -> None:
    """Minimal reference rows so an empty deployment is navigable.

    Deliberately tiny and synthetic — no donor data. Real content arrives by
    uploading the trackers.
    """
    store.leaders = ["Adora Lumbre", "Mark Ramayrat", "Jhon Magno"]
    if not store.fundraisers:
        store.fundraisers = [
            FundraiserSeed(
                name="Almara Pasco",
                code="FR001",
                leader_names=["Adora Lumbre"],
                start_date="2024-03-04",
            )
        ]


__all__ = [
    "FundraiserSeed",
    "SiteSeed",
    "Store",
    "get_store",
    "reset_store",
    "seed_demo",
]
