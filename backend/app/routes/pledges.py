"""Applications: list, detail, billing history, caller notes."""

from __future__ import annotations

from datetime import UTC, date, datetime

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.domain.models import BillingEvent, Donor, Pledge, PledgeNote, Wire
from app.routes.deps import ActorDep, FiltersDep, StoreDep
from app.services import analytics

router = APIRouter(tags=["pledges"])


@router.get("/pledges")
def list_pledges(store: StoreDep, filters: FiltersDep) -> list[Pledge]:
    return analytics.select(store, filters)


@router.get("/pledges/{serial_no}")
def get_pledge(serial_no: str, store: StoreDep, filters: FiltersDep) -> Pledge:
    pledge = store.get_pledge(serial_no)
    # A charity_viewer asking for a pledge outside their scope gets the same
    # 404 as one that does not exist. A 403 would confirm it is real.
    if pledge is None or not analytics.matches(store, pledge, filters):
        raise HTTPException(404, "No such application")
    return pledge


@router.get("/pledges/{serial_no}/events")
def get_events(serial_no: str, store: StoreDep, filters: FiltersDep) -> list[BillingEvent]:
    get_pledge(serial_no, store, filters)
    return store.events_for(serial_no)


@router.get("/pledges/{serial_no}/notes")
def get_notes(serial_no: str, store: StoreDep, filters: FiltersDep) -> list[PledgeNote]:
    get_pledge(serial_no, store, filters)
    return store.notes_for(serial_no)


class NoteIn(BaseModel):
    text: str = Field(min_length=1, max_length=2000)
    author: str = Field(default="", max_length=120)


@router.post("/pledges/{serial_no}/notes", status_code=201)
def add_note(
    serial_no: str,
    body: NoteIn,
    store: StoreDep,
    filters: FiltersDep,
    actor: ActorDep,
) -> PledgeNote:
    """Append a caller remark.

    Append-only: there is deliberately no edit or delete endpoint. A
    correction is a new note, so the trail of what was believed and when
    survives.
    """
    get_pledge(serial_no, store, filters)
    note = PledgeNote(
        id=store.next_id("note"),
        serial_no=serial_no,
        author=body.author or actor,
        created_at=datetime.now(UTC),
        text=body.text.strip(),
    )
    store.add_note(note)
    # The note body quotes a donor conversation, so it never enters the log.
    store.log(actor, "note.add", f"note added to {serial_no}")
    return note


@router.get("/donors")
def list_donors(store: StoreDep, filters: FiltersDep, q: str | None = None) -> list[Donor]:
    rows = analytics.donors(analytics.select(store, filters))
    if q:
        needle = q.casefold()
        rows = [
            d
            for d in rows
            if needle in d.full_name.casefold() or needle in d.email.casefold()
        ]
    return rows


class CancellationIn(Wire):
    """Record — or clear — a cancellation by hand.

    Bank Status Reports carry cancellations for the pledges the bank knows
    about, but plenty of cancellations reach the agency another way: the donor
    phones the office, the charity pulls a campaign, a fundraiser reports a
    signature was withdrawn on the spot. Those need recording against the
    pledge with a reason, and the reason has to survive the next import.
    """

    #: null clears the cancellation — for correcting a mistaken entry.
    cancellation_date: date | None = None
    reason: str = Field(default="", max_length=500)


@router.patch("/pledges/{serial_no}/cancellation")
def set_cancellation(
    serial_no: str,
    body: CancellationIn,
    store: StoreDep,
    filters: FiltersDep,
    actor: ActorDep,
) -> Pledge:
    """Set or clear a manual cancellation.

    A reason is required when cancelling. "Cancelled, no reason given" is not
    a record anybody can act on later, and the whole point of capturing this
    by hand is the reason.

    Marking it `manual` is what stops the next Status Report import from
    recomputing the date away — see `recompute_pledge_state`.
    """
    pledge = get_pledge(serial_no, store, filters)

    if body.cancellation_date is None:
        # Clearing. Only a manual cancellation can be cleared here: a bank
        # cancellation is a fact in the billing history, not an entry to undo.
        if pledge.cancellation_source == "bank":
            raise HTTPException(
                409,
                "This cancellation came from the bank's own status file and "
                "cannot be cleared here. Correct it with a new status import.",
            )
        updated = pledge.model_copy(
            update={
                "cancellation_date": None,
                "cancellation_reason": None,
                "cancellation_source": None,
                "cancelled_by": None,
                "cancelled_at": None,
                "cancelled": False,
            }
        )
        store.upsert_pledge(updated)
        store.log(actor, "pledge.cancellation.clear", f"{serial_no} cancellation cleared")
        return updated

    reason = body.reason.strip()
    if not reason:
        raise HTTPException(422, "Give a reason for the cancellation.")
    if pledge.signup_date and body.cancellation_date < pledge.signup_date:
        raise HTTPException(422, "A pledge cannot be cancelled before it was signed up.")

    updated = pledge.model_copy(
        update={
            "cancellation_date": body.cancellation_date,
            "cancellation_reason": reason,
            "cancellation_source": "manual",
            "cancelled_by": actor,
            "cancelled_at": datetime.now(UTC),
            "cancelled": True,
        }
    )
    store.upsert_pledge(updated)
    # The reason can name a donor's circumstances, so it stays out of the log.
    store.log(
        actor,
        "pledge.cancellation.set",
        f"{serial_no} cancelled {body.cancellation_date.isoformat()}",
    )
    return updated
