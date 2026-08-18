"""Custom exports — pick your own columns off the consolidated data.

The fixed templates (A1, B2, D3 …) each answer one recurring question, and
they matter because finance already has downstream tooling shaped to them.
But every week somebody wants a cut nobody wrote a template for: "serial,
donor, fundraiser and debit date, that's all, for the Cebu sites in July".
Rather than growing the catalogue forever, this lets them assemble it.

Two rules make it safe to hand to anyone:

1. Columns come from a FIXED CATALOGUE, never from free text. A caller cannot
   ask for an attribute the model does not expose, so there is no path to
   dumping something the role is not allowed to see.
2. Every field declares a `pii` level, and the assembled report's level is the
   highest of the ones chosen. A charity_viewer cannot select donor contact
   details at all — the catalogue they are served does not contain them.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, date, datetime
from typing import Any, Literal

from app.domain.models import Pledge
from app.services import analytics
from app.services.analytics import PledgeFilters
from app.services.exports import Report
from app.store.factory import StoreLike

PiiLevel = Literal["none", "masked", "full"]


@dataclass(frozen=True)
class Field:
    key: str
    label: str
    group: str
    pii: PiiLevel
    get: Callable[[Pledge], Any]


def _age(dob: date | None, today: date) -> int | None:
    if dob is None:
        return None
    return today.year - dob.year - ((today.month, today.day) < (dob.month, dob.day))


# The catalogue. Labels are what a finance person calls the thing, not the
# field name — this list is read by people choosing columns, not by code.
FIELDS: tuple[Field, ...] = (
    # -- identity ---------------------------------------------------------
    Field("serialNo", "Serial no", "Identity", "none", lambda p: p.serial_no),
    Field("charityCode", "Charity", "Identity", "none", lambda p: p.charity_code),
    Field("campaignCode", "Campaign", "Identity", "none", lambda p: p.campaign_code),
    Field("country", "Country", "Identity", "none", lambda p: p.country),
    Field("appStatus", "Application status", "Identity", "none", lambda p: p.app_status),
    # -- donor ------------------------------------------------------------
    Field("donorName", "Donor name", "Donor", "full", lambda p: p.donor_name),
    Field("donorEmail", "Email", "Donor", "full", lambda p: p.donor_email),
    Field("donorMobile", "Mobile", "Donor", "full", lambda p: p.donor_mobile),
    Field("city", "City", "Donor", "none", lambda p: p.city),
    Field("gender", "Gender", "Donor", "none", lambda p: p.gender or ""),
    # Age is computed at query time and never stored — a DOB column would be
    # PII where the derived age usually is not.
    Field("age", "Age", "Donor", "none",
          lambda p: _age(p.donor_dob, datetime.now(UTC).date())),
    # -- the pledge -------------------------------------------------------
    Field("amount", "Amount", "Pledge", "none", lambda p: p.amount),
    Field("currency", "Currency", "Pledge", "none", lambda p: p.currency),
    Field("frequency", "Frequency", "Pledge", "none", lambda p: p.frequency),
    Field("frequencyRaw", "Frequency (as filed)", "Pledge", "none",
          lambda p: p.frequency_raw or p.frequency),
    # -- who and where ----------------------------------------------------
    Field("fundraiserName", "Fundraiser", "Team & site", "none",
          lambda p: p.fundraiser_name),
    Field("agentId", "Agent ID", "Team & site", "none", lambda p: p.agent_id),
    Field("leaderName", "Leader", "Team & site", "none", lambda p: p.leader_name),
    Field("siteName", "Site", "Team & site", "none", lambda p: p.site_name),
    Field("locationName", "Location", "Team & site", "none", lambda p: p.location_name),
    # -- payment ----------------------------------------------------------
    Field("instrumentType", "Card type", "Payment", "none",
          lambda p: p.instrument_type),
    # Masked exactly as the bank sent it. The mask character is never
    # normalised — the real files use asterisks.
    Field("maskedPan", "Card (masked)", "Payment", "masked", lambda p: p.masked_pan),
    Field("expiry", "Expiry (MMYY)", "Payment", "masked", lambda p: p.expiry),
    Field("issuingBank", "Issuing bank", "Payment", "none", lambda p: p.issuing_bank),
    Field("processingBank", "Processing bank", "Payment", "none",
          lambda p: p.processing_bank),
    # -- the seven dates --------------------------------------------------
    Field("signupDate", "Sign-up date", "Lifecycle", "none", lambda p: p.signup_date),
    Field("submittedAt", "Submitted to bank", "Lifecycle", "none",
          lambda p: p.submitted_at),
    Field("debitDate", "Debit date", "Lifecycle", "none", lambda p: p.debit_date),
    Field("verifiedAt", "Verification date", "Lifecycle", "none",
          lambda p: p.verified_at),
    Field("cancellationDate", "Cancellation date", "Lifecycle", "none",
          lambda p: p.cancellation_date),
    Field("cancellationReason", "Cancellation reason", "Lifecycle", "none",
          lambda p: p.cancellation_reason or ""),
    Field("invoicedDate", "Invoice date", "Lifecycle", "none",
          lambda p: p.invoiced_date),
    Field("payoutDate", "Payroll date", "Lifecycle", "none", lambda p: p.payout_date),
    # -- billing outcome --------------------------------------------------
    Field("currentStatusId", "Bank status code", "Billing", "none",
          lambda p: p.current_status_id),
    Field("currentStatusDescription", "Bank status", "Billing", "none",
          lambda p: p.current_status_description or ""),
    Field("currentClassification", "Outcome", "Billing", "none",
          lambda p: p.current_classification or ""),
    Field("currentStatusDate", "Status date", "Billing", "none",
          lambda p: p.current_status_date),
    Field("attempts", "Billing attempts", "Billing", "none", lambda p: p.attempts),
    Field("failedAttempts", "Failed attempts", "Billing", "none",
          lambda p: p.failed_attempts),
    Field("attemptsToSuccess", "Attempts until it billed", "Billing", "none",
          lambda p: p.attempts_to_success),
    Field("realized", "Realized", "Billing", "none",
          lambda p: "Yes" if analytics.is_realized(p) else "No"),
    Field("verified", "Phone-verified", "Billing", "none",
          lambda p: "Yes" if p.verified else "No"),
    # -- money out --------------------------------------------------------
    Field("commissionAmount", "Commission", "Money", "none",
          lambda p: p.commission_amount),
    Field("payoutStatus", "Payout status", "Money", "none",
          lambda p: p.payout_status or ""),
    Field("invoiceNo", "Invoice no", "Money", "none", lambda p: p.invoice_no or ""),
)

FIELDS_BY_KEY = {f.key: f for f in FIELDS}

_PII_RANK: dict[PiiLevel, int] = {"none": 0, "masked": 1, "full": 2}


def available_fields(allow_pii: bool, allow_payment: bool) -> list[Field]:
    """The catalogue this caller is allowed to choose from.

    Filtering here rather than at render time is what makes rule 2 hold: a
    role that cannot see contact details is never offered them, and a request
    naming them is rejected by `build` because the key is not in scope.
    """
    out = []
    for f in FIELDS:
        if f.pii == "full" and not allow_pii:
            continue
        if f.pii == "masked" and not allow_payment:
            continue
        out.append(f)
    return out


def pii_level_of(keys: list[str]) -> PiiLevel:
    """The assembled report's level: the highest of the columns chosen."""
    level: PiiLevel = "none"
    for k in keys:
        f = FIELDS_BY_KEY.get(k)
        if f and _PII_RANK[f.pii] > _PII_RANK[level]:
            level = f.pii
    return level


def build(
    store: StoreLike,
    filters: PledgeFilters,
    columns: list[str],
    *,
    allowed: set[str],
) -> Report:
    """Assemble a report from the chosen columns, in the order given.

    Column ORDER is the caller's, deliberately: they are building a sheet to
    paste somewhere, and the order is part of the request.
    """
    unknown = [c for c in columns if c not in FIELDS_BY_KEY]
    if unknown:
        raise ValueError(f"Unknown column(s): {', '.join(unknown)}")
    denied = [c for c in columns if c not in allowed]
    if denied:
        labels = ", ".join(FIELDS_BY_KEY[c].label for c in denied)
        raise PermissionError(f"Your role cannot export: {labels}")

    chosen = [FIELDS_BY_KEY[c] for c in columns]
    headers = tuple(f.label for f in chosen)
    rows = [[f.get(p) for f in chosen] for p in analytics.select(store, filters)]
    return Report(headers=headers, rows=rows)
