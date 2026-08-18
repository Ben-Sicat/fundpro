"""Every adjustable business rule, and a report of what they are set to.

The client has not finally confirmed several rules, so each one lives here as
data with an explicit status. `GET /settings/configuration` returns the whole
lot in one call — what the value is, whether it is CONFIRMED by the client or
still our ASSUMPTION, and what goes wrong if the assumption is wrong.

That endpoint is the thing to put on screen in a review meeting: it turns
"trust us" into a list they can correct line by line.
"""

from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import Literal

from fastapi import APIRouter, HTTPException
from pydantic import Field

from app.domain.models import Wire
from app.domain.reference import (
    BONUS_BASES,
    BONUS_PERIODS,
    CLAWBACK_REASONS,
    BonusRule,
    BonusTier,
)
from app.routes.deps import ActorDep, StoreDep

router = APIRouter(tags=["settings"], prefix="/settings")


# ---------------------------------------------------------------------------
# Bonuses
# ---------------------------------------------------------------------------


class BonusTierIn(Wire):
    threshold: Decimal = Field(ge=0)
    flat_amount: Decimal | None = Field(default=None, ge=0)
    pct_of_commission: Decimal | None = Field(default=None, ge=0)


class BonusRuleIn(Wire):
    id: str = Field(min_length=1, max_length=60)
    name: str = Field(min_length=1, max_length=120)
    basis: Literal["realized_count", "realized_value", "realization_rate", "signup_count"] = (
        "realized_count"
    )
    period: Literal["cutoff", "month"] = "cutoff"
    tiers: list[BonusTierIn] = Field(default_factory=list)
    charity_code: str | None = None
    effective_from: date = date(2000, 1, 1)
    active: bool = True
    min_realization_rate: Decimal | None = Field(default=None, ge=0, le=1)


def _rule_out(rule: BonusRule) -> dict:
    return {
        "id": rule.id,
        "name": rule.name,
        "basis": rule.basis,
        "period": rule.period,
        "charityCode": rule.charity_code,
        "effectiveFrom": rule.effective_from.isoformat(),
        "active": rule.active,
        "minRealizationRate": (
            float(rule.min_realization_rate) if rule.min_realization_rate is not None else None
        ),
        "tiers": [
            {
                "threshold": float(t.threshold),
                "flatAmount": float(t.flat_amount) if t.flat_amount is not None else None,
                "pctOfCommission": (
                    float(t.pct_of_commission) if t.pct_of_commission is not None else None
                ),
            }
            for t in sorted(rule.tiers, key=lambda t: t.threshold)
        ],
    }


@router.get("/bonus-rules")
def list_bonus_rules(store: StoreDep) -> list[dict]:
    return [_rule_out(r) for r in store.settings.bonus_rules]


@router.get("/bonus-options")
def bonus_options() -> dict:
    """What a bonus can be measured on — so the UI never hard-codes the list."""
    return {
        "bases": list(BONUS_BASES),
        "periods": list(BONUS_PERIODS),
        "clawbackReasons": list(CLAWBACK_REASONS),
    }


@router.put("/bonus-rules")
def upsert_bonus_rule(body: BonusRuleIn, store: StoreDep, actor: ActorDep) -> dict:
    if not body.tiers:
        raise HTTPException(422, "A bonus rule needs at least one tier")
    for tier in body.tiers:
        if tier.flat_amount is None and tier.pct_of_commission is None:
            raise HTTPException(
                422, "Each tier needs a flat amount, a percentage of commission, or both"
            )
    thresholds = [t.threshold for t in body.tiers]
    if len(set(thresholds)) != len(thresholds):
        raise HTTPException(422, "Two tiers cannot share a threshold")

    rule = BonusRule(
        id=body.id,
        name=body.name,
        basis=body.basis,
        period=body.period,
        tiers=[
            BonusTier(
                threshold=t.threshold,
                flat_amount=t.flat_amount,
                pct_of_commission=t.pct_of_commission,
            )
            for t in body.tiers
        ],
        charity_code=body.charity_code,
        effective_from=body.effective_from,
        active=body.active,
        min_realization_rate=body.min_realization_rate,
    )

    rules = store.settings.bonus_rules
    for index, existing in enumerate(rules):
        if existing.id == rule.id:
            rules[index] = rule
            break
    else:
        rules.append(rule)

    store.save_settings()
    store.log(actor, "settings.bonus_rule", f"{rule.id} · {rule.basis} · {len(rule.tiers)} tiers")
    return _rule_out(rule)


@router.delete("/bonus-rules/{rule_id}")
def delete_bonus_rule(rule_id: str, store: StoreDep, actor: ActorDep) -> dict:
    before = len(store.settings.bonus_rules)
    store.settings.bonus_rules = [r for r in store.settings.bonus_rules if r.id != rule_id]
    if len(store.settings.bonus_rules) == before:
        raise HTTPException(404, "No such bonus rule")
    store.save_settings()
    store.log(actor, "settings.bonus_rule.delete", rule_id)
    return {"deleted": rule_id}


# ---------------------------------------------------------------------------
# The remaining knobs
# ---------------------------------------------------------------------------


class RulesIn(Wire):
    """The handful of settings that are single values rather than tables.

    Extends `Wire`, not `BaseModel`. GET /rules returns camelCase, so anything
    that reads the rules and writes them back sends camelCase — and on a plain
    BaseModel none of those names bind, every field stays None, and the
    handler's `if value is not None` guard skips all of them. The write
    returned 200 with the OLD values echoed back, so it looked like it worked.
    """

    realization_basis: Literal["submitted", "signups"] | None = None
    pay_date_rule: Literal["eom_or_30", "nearest_business_day"] | None = None
    require_verification_for_payroll: bool | None = None
    create_missing_from_bank: bool | None = None
    myr_to_php_rate: Decimal | None = Field(default=None, ge=0)


@router.get("/rules")
def get_rules(store: StoreDep) -> dict:
    s = store.settings
    return {
        "realizationBasis": s.realization_basis,
        "payDateRule": s.pay_date_rule,
        "requireVerificationForPayroll": s.require_verification_for_payroll,
        "createMissingFromBank": s.create_missing_from_bank,
        "myrToPhpRate": float(s.myr_to_php_rate) if s.myr_to_php_rate is not None else None,
    }


@router.put("/rules")
def set_rules(body: RulesIn, store: StoreDep, actor: ActorDep) -> dict:
    s = store.settings
    changed: list[str] = []
    for field_name in (
        "realization_basis",
        "pay_date_rule",
        "require_verification_for_payroll",
        "create_missing_from_bank",
        "myr_to_php_rate",
    ):
        value = getattr(body, field_name)
        if value is not None:
            setattr(s, field_name, value)
            changed.append(f"{field_name}={value}")

    if changed:
        store.save_settings()
        store.log(actor, "settings.rules", ", ".join(changed))
    return get_rules(store)


@router.get("/location-aliases")
def location_aliases(store: StoreDep) -> dict[str, str]:
    return store.settings.location_aliases


@router.put("/location-aliases")
def set_location_aliases(
    mapping: dict[str, str], store: StoreDep, actor: ActorDep
) -> dict[str, str]:
    store.settings.location_aliases.update({k.strip().casefold(): v for k, v in mapping.items()})
    store.save_settings()
    store.log(actor, "settings.location_aliases", f"{len(mapping)} entries updated")
    return store.settings.location_aliases


# ---------------------------------------------------------------------------
# The configuration report
# ---------------------------------------------------------------------------

CONFIRMED = "confirmed"
ASSUMED = "assumed"


@router.get("/configuration")
def configuration(store: StoreDep) -> list[dict]:
    """Every adjustable rule, its current value, and how sure we are.

    `assumed` means we inferred it from the client's own files and they have
    not confirmed it. `risk` says what goes wrong if the assumption is wrong,
    so a reviewer can prioritise which ones to settle first.
    """
    s = store.settings
    plan = s.commission_plans[0] if s.commission_plans else None

    def entry(key: str, label: str, value: object, status: str, risk: str, endpoint: str) -> dict:
        return {
            "key": key,
            "label": label,
            "value": value,
            "status": status,
            "risk": risk,
            "endpoint": endpoint,
        }

    rows = [
        entry(
            "commission.multiplier",
            "Commission multiplier",
            f"×{float(plan.pct_of_pledge) / 100:g}" if plan else None,
            ASSUMED,
            "The samples show ×1, ×2.5, ×3 and ×4 with no visible pattern. "
            "Every commission figure is wrong if this is wrong.",
            "PUT /settings/commission-plans",
        ),
        entry(
            "commission.trigger",
            "When commission is earned",
            plan.trigger_rule if plan else None,
            ASSUMED,
            "Paying on sign-up instead of on first billing moves money earlier "
            "and increases clawback exposure.",
            "PUT /settings/commission-plans",
        ),
        entry(
            "commission.clawback_on",
            "Failures that reverse a commission",
            list(plan.clawback_on) if plan else [],
            ASSUMED,
            "Too broad and the agency claws back money it should not.",
            "PUT /settings/commission-plans",
        ),
        entry(
            "commission.window",
            "Clawback window (days)",
            plan.realization_window_days if plan else None,
            ASSUMED,
            "Too short and genuine reversals are missed; too long and old "
            "commission is reclaimed unfairly.",
            "PUT /settings/commission-plans",
        ),
        entry(
            "bonus.rules",
            "Bonus rules",
            [r.name for r in s.bonus_rules] or "none configured",
            ASSUMED if not s.bonus_rules else CONFIRMED,
            "No bonus scheme has been supplied, so nobody is being paid one.",
            "PUT /settings/bonus-rules",
        ),
        entry(
            "payroll.verification_gate",
            "Require a verification call before paying",
            s.require_verification_for_payroll,
            ASSUMED,
            "Turning this on withholds commission until the donor is phoned.",
            "PUT /settings/rules",
        ),
        entry(
            "payroll.cutoffs",
            "Pay periods",
            "1st–15th, 16th–end of month",
            CONFIRMED,
            "Confirmed by the client.",
            "—",
        ),
        entry(
            "payroll.pay_date",
            "Pay date rule",
            s.pay_date_rule,
            ASSUMED,
            "Whether a weekend pay date shifts to the Friday is unconfirmed.",
            "PUT /settings/rules",
        ),
        entry(
            "metrics.realization_basis",
            "Realization rate denominator",
            s.realization_basis,
            ASSUMED,
            "Changes the headline number on every dashboard. The frontend "
            "currently disagrees with itself on this.",
            "PUT /settings/rules",
        ),
        entry(
            "parsing.frequency_map",
            "Frequency code mapping",
            {k: v for k, v in s.frequency_map.items() if k in ("1", "3", "6", "12")},
            ASSUMED,
            "The meaning of code 1 is genuinely ambiguous. If it is annual "
            "rather than monthly, every annual-value figure is wrong.",
            "PUT /settings/frequency-map",
        ),
        entry(
            "parsing.charity_aliases",
            "Charity aliases",
            s.charity_aliases,
            ASSUMED,
            "Wrong grouping merges or splits a client's invoices.",
            "PUT /settings/charity-aliases",
        ),
        entry(
            "parsing.status_codes",
            "Bank status dictionary",
            f"{len(s.status_codes)} codes, "
            f"{sum(1 for c in s.status_codes if c.status_id in (66, 59))} confirmed by the bank",
            ASSUMED,
            "Only 66 and 59 are confirmed by the bank. Unknown codes are set "
            "aside rather than guessed, so nothing is miscounted silently.",
            "PUT /settings/status-codes",
        ),
        entry(
            "money.currency",
            "Cross-currency conversion",
            float(s.myr_to_php_rate) if s.myr_to_php_rate is not None else "never combined",
            ASSUMED,
            "Currently pesos and ringgit are never added together anywhere.",
            "PUT /settings/rules",
        ),
        entry(
            "scope.thirteenth_month",
            "7th / 13th month pay",
            "not modelled",
            ASSUMED,
            "Appears in the client's payroll reference but is out of scope "
            "until they confirm it is needed.",
            "—",
        ),
    ]
    return rows
