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


@dataclass
class CommissionPlan:
    """How a pledge converts into commission.

    Effective-dated by the pledge's SIGN-UP date so a new plan never reprices
    historic runs.

    OPEN: what drives the multiplier (×1 / ×2.5 / ×3 / ×4). Until the client
    says, it is a plan field and never inferred from the data.
    """

    id: str
    #: Percent of the pledge amount. 300 = ×3, the measured mode.
    pct_of_pledge: Decimal = Decimal(300)
    #: Set instead of pct_of_pledge for a fixed per-pledge fee.
    flat_amount: Decimal | None = None
    trigger_rule: str = "on_first_approval"
    trigger_n: int | None = None
    #: How long after payment a pledge going bad still counts as a clawback.
    realization_window_days: int = 90
    effective_from: date = date(2000, 1, 1)
    effective_to: date | None = None
    charity_code: str | None = None


DEFAULT_PLAN = CommissionPlan(id="default")


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
