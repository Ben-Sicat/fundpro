"""Team roster: add, edit and retire fundraisers.

Mirrors the frontend's team management, including its validation rules, so the
two cannot disagree about what a valid roster entry is.
"""

from __future__ import annotations

from datetime import date

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.domain.models import FundraiserRecord
from app.routes.deps import ActorDep, FiltersDep, StoreDep
from app.services import analytics
from app.store.memory import FundraiserSeed

router = APIRouter(tags=["team"])


class FundraiserIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    code: str = Field(min_length=1, max_length=40)
    leader_names: list[str] = Field(default_factory=list, alias="leaderNames")
    active: bool = True
    start_date: date | None = Field(default=None, alias="startDate")
    end_date: date | None = Field(default=None, alias="endDate")

    model_config = {"populate_by_name": True}


def _validate(store, body: FundraiserIn, *, existing_code: str | None = None) -> None:
    if any(
        f.code.casefold() == body.code.casefold() and f.code != existing_code
        for f in store.fundraisers
    ):
        raise HTTPException(409, f"ID number {body.code} already belongs to someone else")

    if not body.leader_names:
        raise HTTPException(422, "Assign at least one leader")
    unknown = [n for n in body.leader_names if n not in store.leaders]
    if unknown:
        raise HTTPException(422, f"Unknown leader: {unknown[0]}")

    if body.start_date is None:
        raise HTTPException(422, "Start date is required")
    # The end date is what stops commission accruing, so a retired person
    # without one is a payroll problem rather than a cosmetic gap.
    if not body.active and body.end_date is None:
        raise HTTPException(422, "A retired fundraiser needs an end date")
    if body.active and body.end_date is not None:
        raise HTTPException(422, "An active fundraiser should not have an end date")
    if body.end_date and body.end_date < body.start_date:
        raise HTTPException(422, "End date cannot be before the start date")


def _record(store, code: str, filters) -> FundraiserRecord:
    rows = analytics.select(store, filters)
    found = next(
        (f for f in analytics.fundraiser_records(store, rows) if f.code == code), None
    )
    if found is None:
        raise HTTPException(404, "No such fundraiser")
    return found


@router.get("/team/fundraisers")
def list_fundraisers(store: StoreDep, filters: FiltersDep) -> list[FundraiserRecord]:
    return analytics.fundraiser_records(store, analytics.select(store, filters))


@router.get("/team/fundraisers/{code}")
def get_fundraiser(code: str, store: StoreDep, filters: FiltersDep) -> FundraiserRecord:
    return _record(store, code, filters)


@router.post("/team/fundraisers", status_code=201)
def create_fundraiser(
    body: FundraiserIn, store: StoreDep, filters: FiltersDep, actor: ActorDep
) -> FundraiserRecord:
    _validate(store, body)
    store.fundraisers.append(
        FundraiserSeed(
            name=body.name.strip(),
            code=body.code.strip(),
            leader_names=list(body.leader_names),
            active=body.active,
            start_date=body.start_date.isoformat() if body.start_date else None,
            end_date=body.end_date.isoformat() if body.end_date else None,
        )
    )
    store.log(actor, "team.create", f"added fundraiser {body.code}")
    return _record(store, body.code.strip(), filters)


@router.put("/team/fundraisers/{code}")
def update_fundraiser(
    code: str, body: FundraiserIn, store: StoreDep, filters: FiltersDep, actor: ActorDep
) -> FundraiserRecord:
    seed = store.find_fundraiser(code)
    if seed is None:
        raise HTTPException(404, "No such fundraiser")
    _validate(store, body, existing_code=code)

    # Pledges reference a fundraiser by NAME, so a rename must carry their
    # history with them or every sign-up they made is orphaned.
    if seed.name != body.name.strip():
        for pledge in store.all_pledges():
            if pledge.fundraiser_name == seed.name:
                store.upsert_pledge(
                    pledge.model_copy(update={"fundraiser_name": body.name.strip()})
                )

    seed.name = body.name.strip()
    seed.code = body.code.strip()
    seed.leader_names = list(body.leader_names)
    seed.active = body.active
    seed.start_date = body.start_date.isoformat() if body.start_date else None
    seed.end_date = body.end_date.isoformat() if body.end_date else None

    store.log(actor, "team.update", f"updated fundraiser {seed.code}")
    return _record(store, seed.code, filters)


@router.get("/team/leaders")
def list_leaders(store: StoreDep) -> list[str]:
    return sorted(store.leaders)


@router.post("/team/leaders", status_code=201)
def add_leader(name: str, store: StoreDep, actor: ActorDep) -> list[str]:
    cleaned = name.strip()
    if not cleaned:
        raise HTTPException(422, "Leader name is required")
    if cleaned not in store.leaders:
        store.leaders.append(cleaned)
        store.log(actor, "team.leader.create", f"added leader {cleaned}")
    return sorted(store.leaders)
