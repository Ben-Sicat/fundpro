"""Shared route dependencies: filter parsing and charity scoping."""

from __future__ import annotations

from datetime import UTC, date, datetime
from typing import Annotated

from fastapi import Depends, Header, HTTPException, Query

from app.services.analytics import DATE_BASES, PledgeFilters
from app.store.factory import StoreLike, get_store

StoreDep = Annotated[StoreLike, Depends(get_store)]


def today_dep(
    x_as_of: Annotated[str | None, Header(alias="X-As-Of")] = None,
) -> date:
    """The service's idea of 'today'.

    Overridable by a header so tests and demos are reproducible against a
    fixed dataset. Any unparseable value is rejected rather than silently
    falling back, which would make a wrong date look like a real result.
    """
    if x_as_of is None:
        return datetime.now(UTC).date()
    try:
        return date.fromisoformat(x_as_of)
    except ValueError as exc:
        raise HTTPException(422, "X-As-Of must be an ISO date") from exc


def filters_dep(
    q: str | None = None,
    charity: str | None = None,
    status: Annotated[
        str | None,
        Query(pattern="^(realized|retrying|failed|cancelled|pending)$"),
    ] = None,
    fundraiser: str | None = None,
    site: str | None = None,
    leader: str | None = None,
    verified: bool | None = None,
    basis: str | None = None,
    date_from: Annotated[date | None, Query(alias="from")] = None,
    date_to: Annotated[date | None, Query(alias="to")] = None,
    x_charity_scope: Annotated[str | None, Header(alias="X-Charity-Scope")] = None,
) -> PledgeFilters:
    """Parse query filters, including the date-basis selector.

    `X-Charity-Scope` is the charity_viewer restriction. It is applied as
    `force_charity`, which `matches()` checks FIRST and which no query
    parameter can widen — the scoping is enforced in the service layer, not by
    hiding controls in the UI.
    """
    if basis is not None and basis not in DATE_BASES:
        raise HTTPException(422, f"basis must be one of {', '.join(DATE_BASES)}")

    return PledgeFilters(
        q=q,
        charity_code=charity,
        status=status,
        fundraiser_name=fundraiser,
        site_name=site,
        leader_name=leader,
        verified=verified,
        basis=basis or "signupDate",
        date_from=date_from,
        date_to=date_to,
        force_charity=x_charity_scope,
    )


FiltersDep = Annotated[PledgeFilters, Depends(filters_dep)]
TodayDep = Annotated[date, Depends(today_dep)]


def actor_dep(
    x_actor: Annotated[str | None, Header(alias="X-Actor")] = None,
) -> str:
    """Who is acting, for the audit log. The Next.js server passes the user."""
    return x_actor or "system"


ActorDep = Annotated[str, Depends(actor_dep)]
