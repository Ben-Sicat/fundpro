"""Payroll drafts and the settings that drive them."""

from __future__ import annotations

from datetime import date
from decimal import Decimal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.domain.models import Cutoff, PayrollRunDetail, StatusClassification, StatusCode
from app.routes.deps import ActorDep, StoreDep, TodayDep
from app.services import payroll, payroll_runs

router = APIRouter(tags=["payroll"])


@router.get("/payroll/run")
def payroll_run(
    store: StoreDep, today: TodayDep, as_of: date | None = None
) -> PayrollRunDetail:
    """The draft run for the cutoff containing `as_of` (default: today)."""
    return payroll_runs.derive_run(store, as_of=as_of or today)


@router.get("/payroll/cutoff")
def cutoff(today: TodayDep, as_of: date | None = None) -> Cutoff:
    return payroll.cutoff_for(as_of or today)


# ---------------------------------------------------------------------------
# Settings — every unconfirmed rule is data, editable without a deploy
# ---------------------------------------------------------------------------


@router.get("/settings/status-codes")
def status_codes(store: StoreDep) -> list[StatusCode]:
    return sorted(store.settings.status_codes, key=lambda c: c.status_id)


class StatusCodeIn(BaseModel):
    """Request body for a status-code edit.

    Aliases are assigned per field rather than generated: an alias_generator on
    a FastAPI *body* model is applied in a context pydantic warns about, and
    the warnings drown out real ones.
    """

    model_config = {"populate_by_name": True}

    status_id: int = Field(alias="statusId", ge=0)
    description: str = Field(min_length=1, max_length=200)
    classification: StatusClassification


@router.put("/settings/status-codes")
def upsert_status_code(body: StatusCodeIn, store: StoreDep, actor: ActorDep) -> StatusCode:
    """Add or reclassify a bank code.

    This is the escape hatch that keeps a new code from being a deploy: logic
    branches on `classification`, so teaching the service about status 77 is
    a 30-second settings edit.
    """
    code = StatusCode(
        status_id=body.status_id,
        description=body.description,
        classification=body.classification,
    )
    store.settings.upsert_status_code(code)
    store.log(actor, "settings.status_code", f"{code.status_id} → {code.classification}")
    return code


class PlanIn(BaseModel):
    id: str = "default"
    pct_of_pledge: Decimal = Field(default=Decimal(300), ge=0)
    flat_amount: Decimal | None = None
    trigger_rule: str = Field(
        default="on_first_approval",
        pattern="^(on_submission|on_first_approval|on_n_billings)$",
    )
    trigger_n: int | None = Field(default=None, ge=1)
    realization_window_days: int = Field(default=90, ge=0)
    effective_from: date = date(2000, 1, 1)
    charity_code: str | None = None


@router.get("/settings/commission-plans")
def commission_plans(store: StoreDep) -> list[dict]:
    return [
        {
            "id": p.id,
            "pctOfPledge": float(p.pct_of_pledge),
            "flatAmount": float(p.flat_amount) if p.flat_amount is not None else None,
            "triggerRule": p.trigger_rule,
            "triggerN": p.trigger_n,
            "realizationWindowDays": p.realization_window_days,
            "effectiveFrom": p.effective_from.isoformat(),
            "charityCode": p.charity_code,
        }
        for p in store.settings.commission_plans
    ]


@router.put("/settings/commission-plans")
def upsert_plan(body: PlanIn, store: StoreDep, actor: ActorDep) -> dict:
    from app.domain.reference import CommissionPlan

    if body.trigger_rule == "on_n_billings" and not body.trigger_n:
        raise HTTPException(422, "triggerN is required for on_n_billings")

    plan = CommissionPlan(
        id=body.id,
        pct_of_pledge=body.pct_of_pledge,
        flat_amount=body.flat_amount,
        trigger_rule=body.trigger_rule,
        trigger_n=body.trigger_n,
        realization_window_days=body.realization_window_days,
        effective_from=body.effective_from,
        charity_code=body.charity_code,
    )
    plans = store.settings.commission_plans
    for index, existing in enumerate(plans):
        if existing.id == plan.id:
            plans[index] = plan
            break
    else:
        plans.append(plan)

    store.log(actor, "settings.commission_plan", f"{plan.id} · {plan.trigger_rule}")
    return commission_plans(store)[0]


@router.get("/settings/frequency-map")
def frequency_map(store: StoreDep) -> dict[str, str]:
    return store.settings.frequency_map


@router.put("/settings/frequency-map")
def set_frequency_map(mapping: dict[str, str], store: StoreDep, actor: ActorDep) -> dict[str, str]:
    store.settings.frequency_map.update({k.casefold(): v for k, v in mapping.items()})
    store.log(actor, "settings.frequency_map", f"{len(mapping)} entries updated")
    return store.settings.frequency_map


@router.get("/settings/charity-aliases")
def charity_aliases(store: StoreDep) -> dict[str, str]:
    return store.settings.charity_aliases


@router.put("/settings/charity-aliases")
def set_charity_aliases(
    mapping: dict[str, str], store: StoreDep, actor: ActorDep
) -> dict[str, str]:
    store.settings.charity_aliases.update({k.casefold(): v for k, v in mapping.items()})
    store.log(actor, "settings.charity_aliases", f"{len(mapping)} entries updated")
    return store.settings.charity_aliases
