"""Applications: list, detail, billing history, caller notes."""

from __future__ import annotations

from datetime import UTC, datetime

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.domain.models import BillingEvent, Donor, Pledge, PledgeNote
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
