"""Settings-driven reference data.

Everything the client has not confirmed lives here as DATA, never as a branch
in code (BACKEND_PROMPT §10). Adding a bank status code, a charity alias or a
frequency mapping is an admin edit, not a deploy.

The values below are the defaults inferred from the sample files; each one the
owners still owe us an answer on is marked OPEN.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal

from app.domain.models import StatusCode

# ---------------------------------------------------------------------------
# Bank status dictionary
#
# Only 66 and 59 are CONFIRMED by the bank. The rest are inferred from the
# failure strings in the payroll reference (FINDINGS §3.7) and are editable at
# runtime. Business logic reads `classification`, never a raw id.
# ---------------------------------------------------------------------------

DEFAULT_STATUS_CODES: list[StatusCode] = [
    StatusCode(status_id=66, description="Billing Approved", classification="approved"),
    StatusCode(
        status_id=59,
        description="Billing Failed (DNH - Will retry)",
        classification="failed_retryable",
    ),
    StatusCode(status_id=60, description="Insufficient Funds", classification="failed_retryable"),
    StatusCode(status_id=71, description="Card Expired", classification="failed_final"),
    StatusCode(status_id=72, description="Invalid Account Number", classification="failed_final"),
    StatusCode(status_id=73, description="Account Closed", classification="failed_final"),
    StatusCode(status_id=84, description="Cancelled by Donor", classification="cancelled"),
    StatusCode(status_id=85, description="Cancelled by Charity", classification="cancelled"),
]

# ---------------------------------------------------------------------------
# Charity alias map — FINDINGS §3.1
# ---------------------------------------------------------------------------

DEFAULT_CHARITY_ALIASES: dict[str, str] = {
    "stc": "STC",
    "save the children": "STC",
    "unhcr": "UNHCR",
    "unhcr my": "UNHCR",
    "unhcr malaysia": "UNHCR",
    "wwf": "WWF",
    "wv": "WV",
    "world vision": "WV",
}

# ---------------------------------------------------------------------------
# Frequency map — FINDINGS §3.4
#
# OPEN: the meaning of `1` is genuinely ambiguous. `12` almost certainly means
# twelve payments a year (monthly); by the same reading `1` is annual, but the
# Apps Tracker uses `1` on pledges described as monthly. Mapped to Monthly here
# because that is what the Apps Tracker rows imply, and flagged so the choice
# is visible rather than buried.
# ---------------------------------------------------------------------------

DEFAULT_FREQUENCY_MAP: dict[str, str] = {
    "1": "Monthly",
    "3": "Quarterly",
    "6": "Semi-Annual",
    "12": "Monthly",
    "monthly": "Monthly",
    "quarterly": "Quarterly",
    "semi-annual": "Semi-Annual",
    "semi annual": "Semi-Annual",
    "semiannual": "Semi-Annual",
    "annual": "Annual",
    "yearly": "Annual",
}

AMBIGUOUS_FREQUENCY_CODES = frozenset({"1"})

# ---------------------------------------------------------------------------
# Card type casing drift — FINDINGS §2 trap 9
# ---------------------------------------------------------------------------

DEFAULT_CARD_TYPE_MAP: dict[str, str] = {
    "credit card": "CREDIT CARD",
    "credit": "CREDIT CARD",
    "cc": "CREDIT CARD",
    "debit card": "DEBIT CARD",
    "debit": "DEBIT CARD",
    "dc": "DEBIT CARD",
}


CLAWBACK_REASONS = ("cancelled", "failed_final", "unrealized")

# ---------------------------------------------------------------------------
# Fundraiser tiers — the client's own "STOPLIGHT" column.
#
# Derived from the payroll reference on 2026-08-08: the sheets rank each fundraiser
# DIAMOND / GOLD / GREEN / AMBER / RED, and the commission multiplier tracks
# that ranking (DIAMOND is x3 in 83% of credit-card rows, RED drops to x1 or
# x0.5). Ordered best-first; the list is editable because the names are theirs.
# ---------------------------------------------------------------------------

DEFAULT_TIERS: tuple[str, ...] = ("DIAMOND", "GOLD", "GREEN", "AMBER", "RED")


@dataclass
class CommissionPlan:
    """How a pledge converts into commission.

    Effective-dated by the pledge's SIGN-UP date so a new plan never reprices
    historic runs.

    OPEN: what drives the multiplier (×1 / ×2.5 / ×3 / ×4). Until the client
    says, it is a plan field and never inferred from the data. `frequency`
    exists because the samples hint at ×2.5 monthly / ×3 semi-annual — if that
    turns out to be the rule, it is expressible without a schema change.
    """

    id: str
    name: str = "Default plan"
    #: Percent of the pledge amount. 300 = ×3, the measured mode.
    pct_of_pledge: Decimal = Decimal(300)
    #: Set instead of pct_of_pledge for a fixed per-pledge fee.
    flat_amount: Decimal | None = None
    trigger_rule: str = "on_first_approval"
    trigger_n: int | None = None
    #: How long after payment a pledge going bad still counts as a clawback.
    realization_window_days: int = 90
    #: Which failures actually reverse a commission. Narrowing this is how the
    #: client says "we don't claw back for X".
    clawback_on: tuple[str, ...] = CLAWBACK_REASONS
    effective_from: date = date(2000, 1, 1)
    effective_to: date | None = None
    #: None = every charity.
    charity_code: str | None = None
    #: None = every frequency. 'Monthly', 'Quarterly', 'Semi-Annual', 'Annual'.
    frequency: str | None = None
    #: None = every tier. The client's STOPLIGHT ranking, which their own
    #: payroll sheets track the multiplier against.
    tier: str | None = None
    #: None = every instrument. Debit cards price very differently in the
    #: samples, so this is expressible without a schema change.
    instrument_type: str | None = None


DEFAULT_PLAN = CommissionPlan(id="default")


# ---------------------------------------------------------------------------
# Bonuses
#
# The owners flagged that bonuses exist and must be adjustable. Modelled as
# threshold tiers over a measurable basis rather than as named schemes, so a
# new bonus is a settings row instead of a code change.
# ---------------------------------------------------------------------------

BONUS_BASES = (
    "realized_count",  # donors who actually billed
    "realized_value",  # pledged value of those donors
    "realization_rate",  # quality gate, 0–1
    "signup_count",  # volume regardless of outcome
)

BONUS_PERIODS = ("cutoff", "month")


@dataclass
class BonusTier:
    """Reach `threshold` on the rule's basis and earn this."""

    threshold: Decimal
    #: A fixed amount, in the fundraiser's own currency.
    flat_amount: Decimal | None = None
    #: Or a percentage of the commission they earned in the period.
    pct_of_commission: Decimal | None = None


@dataclass
class BonusRule:
    """A performance bonus, evaluated per fundraiser per period.

    Only the HIGHEST tier a fundraiser reaches is awarded — tiers are a ladder,
    not a stack, which is how every incentive scheme in the samples reads.
    """

    id: str
    name: str
    basis: str = "realized_count"
    period: str = "cutoff"
    tiers: list[BonusTier] = field(default_factory=list)
    charity_code: str | None = None
    effective_from: date = date(2000, 1, 1)
    active: bool = True
    #: A quality gate applied on top: no bonus below this realization rate.
    min_realization_rate: Decimal | None = None


@dataclass
class Settings:
    """Mutable reference data, editable through the admin endpoints."""

    status_codes: list[StatusCode] = field(
        default_factory=lambda: list(DEFAULT_STATUS_CODES)
    )
    charity_aliases: dict[str, str] = field(
        default_factory=lambda: dict(DEFAULT_CHARITY_ALIASES)
    )
    frequency_map: dict[str, str] = field(
        default_factory=lambda: dict(DEFAULT_FREQUENCY_MAP)
    )
    card_type_map: dict[str, str] = field(
        default_factory=lambda: dict(DEFAULT_CARD_TYPE_MAP)
    )
    commission_plans: list[CommissionPlan] = field(
        default_factory=lambda: [DEFAULT_PLAN]
    )
    #: Empty by default: inventing a bonus scheme would be worse than none.
    bonus_rules: list[BonusRule] = field(default_factory=list)

    #: Free-text venue names resolved to one canonical site.
    location_aliases: dict[str, str] = field(default_factory=dict)

    #: Fundraiser performance tiers, best first. Their "STOPLIGHT".
    tiers: list[str] = field(default_factory=lambda: list(DEFAULT_TIERS))

    # -- rules the client still owes us a decision on ------------------------

    #: 'submitted' = realized ÷ sent-to-bank. 'signups' = realized ÷ all
    #: sign-ups. Both are defensible; the business needs one, and the frontend
    #: currently disagrees with itself, so it is a setting until they choose.
    realization_basis: str = "submitted"

    #: 'eom_or_30' pays on the 15th and the 30th (28th/29th in February).
    #: 'nearest_business_day' shifts a weekend pay date back to the Friday.
    pay_date_rule: str = "eom_or_30"

    #: Require a completed verification call before a pledge can be paid on.
    require_verification_for_payroll: bool = False

    #: When a bank row has no matching application, create a provisional one
    #: from the bank's own columns instead of setting the row aside.
    #:
    #: OFF by default and deliberately so: an application built from a bank
    #: file has no email, no date of birth, no site and no fundraiser name, so
    #: it cannot be attributed or paid on. It exists to unblock the case where
    #: the bank file arrives before the Apps Tracker has been updated, and is
    #: superseded the moment the real tracker is imported.
    create_missing_from_bank: bool = False

    #: Used only where a single cross-currency total is unavoidable. None means
    #: refuse to combine, which is the current behaviour everywhere.
    myr_to_php_rate: Decimal | None = None

    # -- lookups ------------------------------------------------------------

    def classification_for(self, status_id: int | None) -> str | None:
        """Classification for a bank code, or None if the code is unknown.

        None is meaningful: an unknown code must become an import exception,
        not be silently treated as a failure.
        """
        if status_id is None:
            return None
        for code in self.status_codes:
            if code.status_id == status_id:
                return code.classification
        return None

    def status_description_for(self, status_id: int | None) -> str | None:
        for code in self.status_codes:
            if code.status_id == status_id:
                return code.description
        return None

    def knows_status(self, status_id: int) -> bool:
        return any(c.status_id == status_id for c in self.status_codes)

    def canonical_charity(self, raw: str | None) -> str:
        if not raw:
            return ""
        return self.charity_aliases.get(raw.strip().casefold(), raw.strip())

    def canonical_frequency(self, raw: object) -> str:
        if raw is None:
            return ""
        key = str(raw).strip()
        # An Excel numeric cell gives 1.0 where the file meant '1'.
        if key.endswith(".0"):
            key = key[:-2]
        return self.frequency_map.get(key.casefold(), key)

    def canonical_card_type(self, raw: str | None) -> str:
        if not raw:
            return ""
        return self.card_type_map.get(raw.strip().casefold(), raw.strip().upper())

    def upsert_status_code(self, code: StatusCode) -> None:
        for index, existing in enumerate(self.status_codes):
            if existing.status_id == code.status_id:
                self.status_codes[index] = code
                return
        self.status_codes.append(code)
