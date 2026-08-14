"""Dashboard widgets and team roll-ups. Every endpoint takes the same filters,
so the whole page always describes one slice of data."""

from __future__ import annotations

from decimal import Decimal

from fastapi import APIRouter

from app.domain.models import (
    AgeBand,
    BankPerformance,
    FundraiserPerformance,
    FundraiserRecord,
    InstrumentSplit,
    Kpis,
    LabelledCount,
    LeaderRecord,
    SitePerformance,
    SplitSlice,
    TimePoint,
)
from app.routes.deps import FiltersDep, StoreDep, TodayDep
from app.services import analytics

router = APIRouter(tags=["dashboard"])


@router.get("/kpis")
def kpis(store: StoreDep, filters: FiltersDep, today: TodayDep) -> Kpis:
    return analytics.kpis(store, analytics.select(store, filters), today=today)


@router.get("/timeseries")
def timeseries(store: StoreDep, filters: FiltersDep, today: TodayDep) -> list[TimePoint]:
    return analytics.time_series(analytics.select(store, filters), today=today)


@router.get("/results-split")
def results_split(store: StoreDep, filters: FiltersDep) -> list[SplitSlice]:
    return analytics.results_split(analytics.select(store, filters))


@router.get("/instrument-split")
def instrument_split(store: StoreDep, filters: FiltersDep) -> list[InstrumentSplit]:
    return analytics.instrument_split(analytics.select(store, filters))


@router.get("/age-bands")
def age_bands(store: StoreDep, filters: FiltersDep, today: TodayDep) -> list[AgeBand]:
    return analytics.age_bands(store, analytics.select(store, filters), today=today)


@router.get("/frequency-mix")
def frequency_mix(store: StoreDep, filters: FiltersDep) -> list[LabelledCount]:
    return analytics.frequency_mix(analytics.select(store, filters))


@router.get("/bank-performance")
def bank_performance(store: StoreDep, filters: FiltersDep) -> list[BankPerformance]:
    """Which banks approve and which fail — asked for on 2026-08-07."""
    return analytics.bank_performance(store, analytics.select(store, filters))


@router.get("/fundraisers")
def fundraisers(store: StoreDep, filters: FiltersDep) -> list[FundraiserRecord]:
    return analytics.fundraiser_records(store, analytics.select(store, filters))


@router.get("/fundraiser-performance")
def fundraiser_performance(
    store: StoreDep, filters: FiltersDep
) -> list[FundraiserPerformance]:
    multiplier = store.settings.commission_plans[0].pct_of_pledge / Decimal(100)
    return analytics.fundraiser_performance(
        store, analytics.select(store, filters), multiplier=multiplier
    )


@router.get("/leaders")
def leaders(store: StoreDep, filters: FiltersDep) -> list[LeaderRecord]:
    return analytics.leader_records(store, analytics.select(store, filters))


@router.get("/sites")
def sites(store: StoreDep, filters: FiltersDep) -> list[SitePerformance]:
    return analytics.site_performance(store, analytics.select(store, filters))


@router.get("/charities")
def charities(store: StoreDep, filters: FiltersDep) -> list[str]:
    return sorted(
        {p.charity_code for p in analytics.select(store, filters) if p.charity_code}
    )
