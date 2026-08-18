"""Postgres-backed store.

Implements the same surface as `app.store.memory.Store` — see that module and
`app/store/__init__.py` for the invariants. Callers cannot tell the two apart,
which is what `tests/test_store_seam.py` protects.

Three things make this more than a translation of the in-memory version:

**The flat `Pledge` is normalized on the way in.** `Pledge` carries
`donor_name`, `charity_code`, `fundraiser_name`, `site_name` and friends as
plain strings; the schema keeps them in `donors`, `charities`, `fundraisers`,
`sites` and so on behind NOT NULL foreign keys. Every write resolves-or-creates
those rows first, and every read joins them back into the flat shape.

**Donor dedupe is deliberately NOT implemented here.** MASTER_SPEC §4.2/§4.7
require merging donors on `national_id > email > tel_mobile` precedence, with
ambiguous cases reported rather than auto-merged, because the same person
signing up twice must not earn commission twice. That belongs with the legacy
migration, which needs its reconciliation report to show what it merged. Until
then this writes ONE donor row per pledge, so `donors` will contain duplicates
for repeat donors. Do not build the donors page on top of this state, and do
not run the backfill before the dedupe lands.

**IDs are uuids, not the memory store's counter strings.** Every primary key in
the schema is `uuid default gen_random_uuid()`, while the in-memory store mints
`upl_000001`. A per-process counter cannot be used against a shared database —
two workers would hand out the same id. `next_id` therefore returns a uuid4
string and ignores the prefix. The Pydantic models type these as `str`, so
nothing downstream notices.
"""

from __future__ import annotations

import json
import logging
import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Any

from psycopg import Connection
from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool

from app.domain.models import (
    AuditEntry,
    BillingEvent,
    ExportRun,
    ImportException,
    Pledge,
    PledgeNote,
    Upload,
)
from app.domain.reference import Settings
from app.store.memory import FundraiserSeed, SiteSeed

logger = logging.getLogger(__name__)

#: Key under which the whole Settings object is persisted in `app_settings`.
#: One row rather than a row per field: the API reads and writes settings as a
#: unit, and a partial write would leave classification rules inconsistent.
SETTINGS_KEY = "backend.settings"


def _new_id() -> str:
    return str(uuid.uuid4())


class PostgresStore:
    """The Store surface, backed by Postgres.

    Every method opens a connection from the pool and commits before returning.
    There is no cross-method transaction: consolidation already tolerates
    partial progress by design — a row becomes either an event or an exception,
    and re-uploading is a no-op — so a failure mid-file leaves the rows that
    landed, which is the behaviour the in-memory store has too.
    """

    def __init__(self, dsn: str, *, min_size: int = 1, max_size: int = 4) -> None:
        self.pool = ConnectionPool(
            dsn, min_size=min_size, max_size=max_size, open=True, kwargs={"autocommit": False}
        )
        self.settings = self._load_settings()

    def close(self) -> None:
        self.pool.close()

    # -- settings -----------------------------------------------------------
    #
    # Settings must be SHARED, not per-process. They carry the status-code
    # classifications every dashboard filters on, so two workers holding
    # different copies would classify the same pledge differently depending on
    # which one answered.

    def _load_settings(self) -> Settings:
        with self.pool.connection() as conn, conn.cursor() as cur:
            cur.execute("SELECT value FROM app_settings WHERE key = %s", (SETTINGS_KEY,))
            row = cur.fetchone()
        if row is None:
            return Settings()
        try:
            return Settings(**row[0])
        except Exception:
            # A settings row written by an older build must not stop the
            # service booting; defaults are always safe.
            logger.exception("could not read persisted settings; falling back to defaults")
            return Settings()

    def save_settings(self) -> None:
        """Persist the in-memory Settings object. Call after any mutation."""
        payload = json.dumps(self.settings, default=_json_default)
        with self.pool.connection() as conn, conn.cursor() as cur:
            cur.execute(
                """INSERT INTO app_settings (key, value, updated_at)
                   VALUES (%s, %s::jsonb, now())
                   ON CONFLICT (key) DO UPDATE
                     SET value = EXCLUDED.value, updated_at = now()""",
                (SETTINGS_KEY, payload),
            )
            conn.commit()

    def next_id(self, prefix: str) -> str:
        return _new_id()

    # -- reference resolution ------------------------------------------------
    #
    # Resolve-or-create. Each uses ON CONFLICT on the natural key rather than
    # SELECT-then-INSERT, so two workers importing concurrently cannot both
    # decide a charity is missing and race to create it.

    def _charity_id(self, conn: Connection, code: str) -> str:
        """A charity row for a code. `name` falls back to the code itself.

        `charities.name` is NOT NULL and an import only gives us the code, so
        the code doubles as the name until someone edits it in settings.
        """
        code = (code or "UNKNOWN").strip() or "UNKNOWN"
        with conn.cursor() as cur:
            cur.execute(
                """INSERT INTO charities (code, name) VALUES (%s, %s)
                   ON CONFLICT (code) DO UPDATE SET code = EXCLUDED.code
                   RETURNING id""",
                (code, code),
            )
            return str(cur.fetchone()[0])

    def _location_id(self, conn: Connection, name: str, country: str | None) -> str | None:
        name = (name or "").strip()
        if not name:
            return None
        with conn.cursor() as cur:
            cur.execute(
                """INSERT INTO locations (code, name, country) VALUES (%s, %s, %s)
                   ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name
                   RETURNING id""",
                (name, name, country),
            )
            return str(cur.fetchone()[0])

    def _agent_id(self, conn: Connection, agent_code: str) -> str | None:
        agent_code = (agent_code or "").strip()
        if not agent_code:
            return None
        with conn.cursor() as cur:
            cur.execute(
                """INSERT INTO agents (agent_id) VALUES (%s)
                   ON CONFLICT (agent_id) DO UPDATE SET agent_id = EXCLUDED.agent_id
                   RETURNING id""",
                (agent_code,),
            )
            return str(cur.fetchone()[0])

    def _fundraiser_id(self, conn: Connection, name: str) -> str | None:
        """A fundraiser row for a NAME.

        Pledges reference their fundraiser by name (that is what the trackers
        carry), so the name is the lookup key here even though `employee_code`
        is the unique column. Matched case-insensitively because the sheets
        drift.
        """
        name = (name or "").strip()
        if not name:
            return None
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id FROM fundraisers WHERE lower(full_name) = lower(%s) LIMIT 1", (name,)
            )
            row = cur.fetchone()
            if row:
                return str(row[0])
            cur.execute(
                "INSERT INTO fundraisers (full_name) VALUES (%s) RETURNING id", (name,)
            )
            return str(cur.fetchone()[0])

    def _site_id(
        self, conn: Connection, name: str, *, charity_id: str | None, location_id: str | None
    ) -> str | None:
        name = (name or "").strip()
        if not name:
            return None
        with conn.cursor() as cur:
            cur.execute("SELECT id FROM sites WHERE lower(name) = lower(%s) LIMIT 1", (name,))
            row = cur.fetchone()
            if row:
                return str(row[0])
            # starts_on is nullable precisely so an inferred site needs no
            # invented date — see migration 0004.
            cur.execute(
                """INSERT INTO sites (name, charity_id, location_id) VALUES (%s, %s, %s)
                   RETURNING id""",
                (name, charity_id, location_id),
            )
            return str(cur.fetchone()[0])

    def _campaign_id(self, conn: Connection, code: str, charity_id: str) -> str | None:
        code = (code or "").strip()
        if not code:
            return None
        with conn.cursor() as cur:
            cur.execute(
                """SELECT id FROM campaigns
                   WHERE charity_id = %s AND campaign_code = %s LIMIT 1""",
                (charity_id, code),
            )
            row = cur.fetchone()
            if row:
                return str(row[0])
            cur.execute(
                """INSERT INTO campaigns (charity_id, campaign_code) VALUES (%s, %s)
                   RETURNING id""",
                (charity_id, code),
            )
            return str(cur.fetchone()[0])

    def _ensure_status_code(self, conn: Connection, status_id: int, description: str) -> None:
        """billing_events.status_id is a FK, so the code must exist first.

        The classification comes from Settings, which is where operators add
        new bank codes. A code that reaches here unknown is recorded as 'other'
        rather than rejected: refusing the insert would lose the bank's outcome
        entirely, and consolidation has already raised an exception for it.
        """
        classification = self.settings.classification_for(status_id) or "other"
        with conn.cursor() as cur:
            cur.execute(
                """INSERT INTO status_codes (status_id, description, classification)
                   VALUES (%s, %s, %s)
                   ON CONFLICT (status_id) DO NOTHING""",
                (status_id, description or str(status_id), classification),
            )

    def _pledge_uuid(self, conn: Connection, serial_no: str) -> str | None:
        with conn.cursor() as cur:
            cur.execute("SELECT id FROM pledges WHERE serial_no = %s", (serial_no,))
            row = cur.fetchone()
            return str(row[0]) if row else None

    # -- pledges ------------------------------------------------------------

    def upsert_pledge(self, pledge: Pledge) -> None:
        """Write a pledge and everything it references.

        NOT a merge: `merge_application` in the service layer has already
        decided what this record should contain. Keeping that decision out of
        the store is what lets both store implementations share it.
        """
        with self.pool.connection() as conn:
            charity_id = self._charity_id(conn, pledge.charity_code)
            location_id = self._location_id(conn, pledge.location_name, pledge.country)
            site_id = self._site_id(
                conn, pledge.site_name, charity_id=charity_id, location_id=location_id
            )
            agent_id = self._agent_id(conn, pledge.agent_id)
            fundraiser_id = self._fundraiser_id(conn, pledge.fundraiser_name)
            campaign_id = self._campaign_id(conn, pledge.campaign_code, charity_id)
            donor_id = self._upsert_donor(conn, pledge)

            with conn.cursor() as cur:
                cur.execute(
                    """INSERT INTO pledges (
                           serial_no, donor_id, charity_id, fundraiser_id, agent_id,
                           location_id, campaign_id, site_id, country, amount, currency,
                           frequency, frequency_raw, processing_bank, signup_date,
                           submitted_at, debit_date, verified_at, cancellation_date,
                           verified, app_status, current_status_id, current_status_date,
                           current_classification, cancelled, cancellation_reason,
                           cancellation_source, cancelled_by, cancelled_at, attempts,
                           failed_attempts, attempts_to_success, verification_caller,
                           updated_at
                       ) VALUES (
                           %(serial_no)s, %(donor_id)s, %(charity_id)s, %(fundraiser_id)s,
                           %(agent_id)s, %(location_id)s, %(campaign_id)s, %(site_id)s,
                           %(country)s, %(amount)s, %(currency)s, %(frequency)s,
                           %(frequency_raw)s, %(processing_bank)s, %(signup_date)s,
                           %(submitted_at)s, %(debit_date)s, %(verified_at)s,
                           %(cancellation_date)s, %(verified)s, %(app_status)s,
                           %(current_status_id)s, %(current_status_date)s,
                           %(current_classification)s, %(cancelled)s,
                           %(cancellation_reason)s, %(cancellation_source)s,
                           %(cancelled_by)s, %(cancelled_at)s, %(attempts)s,
                           %(failed_attempts)s, %(attempts_to_success)s,
                           %(verified_by)s, now()
                       )
                       ON CONFLICT (serial_no) DO UPDATE SET
                           donor_id = EXCLUDED.donor_id,
                           charity_id = EXCLUDED.charity_id,
                           fundraiser_id = EXCLUDED.fundraiser_id,
                           agent_id = EXCLUDED.agent_id,
                           location_id = EXCLUDED.location_id,
                           campaign_id = EXCLUDED.campaign_id,
                           site_id = EXCLUDED.site_id,
                           country = EXCLUDED.country,
                           amount = EXCLUDED.amount,
                           currency = EXCLUDED.currency,
                           frequency = EXCLUDED.frequency,
                           frequency_raw = EXCLUDED.frequency_raw,
                           processing_bank = EXCLUDED.processing_bank,
                           signup_date = EXCLUDED.signup_date,
                           submitted_at = EXCLUDED.submitted_at,
                           debit_date = EXCLUDED.debit_date,
                           verified_at = EXCLUDED.verified_at,
                           cancellation_date = EXCLUDED.cancellation_date,
                           verified = EXCLUDED.verified,
                           app_status = EXCLUDED.app_status,
                           current_status_id = EXCLUDED.current_status_id,
                           current_status_date = EXCLUDED.current_status_date,
                           current_classification = EXCLUDED.current_classification,
                           cancelled = EXCLUDED.cancelled,
                           cancellation_reason = EXCLUDED.cancellation_reason,
                           cancellation_source = EXCLUDED.cancellation_source,
                           cancelled_by = EXCLUDED.cancelled_by,
                           cancelled_at = EXCLUDED.cancelled_at,
                           attempts = EXCLUDED.attempts,
                           failed_attempts = EXCLUDED.failed_attempts,
                           attempts_to_success = EXCLUDED.attempts_to_success,
                           verification_caller = EXCLUDED.verification_caller,
                           updated_at = now()
                       RETURNING id""",
                    {
                        "serial_no": pledge.serial_no,
                        "donor_id": donor_id,
                        "charity_id": charity_id,
                        "fundraiser_id": fundraiser_id,
                        "agent_id": agent_id,
                        "location_id": location_id,
                        "campaign_id": campaign_id,
                        "site_id": site_id,
                        "country": pledge.country,
                        "amount": pledge.amount,
                        "currency": pledge.currency,
                        "frequency": pledge.frequency,
                        "frequency_raw": pledge.frequency_raw,
                        "processing_bank": pledge.processing_bank,
                        "signup_date": pledge.signup_date,
                        "submitted_at": pledge.submitted_at,
                        "debit_date": pledge.debit_date,
                        "verified_at": pledge.verified_at,
                        "cancellation_date": pledge.cancellation_date,
                        "verified": pledge.verified,
                        "app_status": pledge.app_status,
                        "current_status_id": pledge.current_status_id,
                        "current_status_date": pledge.current_status_date,
                        "current_classification": pledge.current_classification,
                        "cancelled": pledge.cancelled,
                        "cancellation_reason": pledge.cancellation_reason,
                        "cancellation_source": pledge.cancellation_source,
                        "cancelled_by": pledge.cancelled_by,
                        "cancelled_at": pledge.cancelled_at,
                        "attempts": pledge.attempts,
                        "failed_attempts": pledge.failed_attempts,
                        "attempts_to_success": pledge.attempts_to_success,
                        "verified_by": pledge.verified_by,
                    },
                )
                pledge_uuid = str(cur.fetchone()[0])

            if pledge.current_status_id is not None:
                self._ensure_status_code(
                    conn, pledge.current_status_id, pledge.current_status_description or ""
                )

            self._upsert_payment_method(conn, pledge_uuid, pledge)
            conn.commit()

    def _upsert_donor(self, conn: Connection, pledge: Pledge) -> str:
        """One donor row per pledge. See the module docstring on dedupe.

        Keyed off the pledge's existing donor_id when there is one, so
        re-importing updates the same donor rather than orphaning it and
        growing the table on every upload.
        """
        with conn.cursor() as cur:
            cur.execute(
                "SELECT donor_id FROM pledges WHERE serial_no = %s", (pledge.serial_no,)
            )
            row = cur.fetchone()
            fields = (
                pledge.donor_name or "(unknown)",
                pledge.donor_email or None,
                pledge.donor_mobile or None,
                pledge.donor_dob,
                pledge.gender,
                pledge.city or None,
                pledge.country,
            )
            if row and row[0]:
                cur.execute(
                    """UPDATE donors SET full_name = %s, email = %s, tel_mobile = %s,
                              dob = %s, gender = %s, city = %s, country = %s,
                              updated_at = now()
                       WHERE id = %s""",
                    (*fields, row[0]),
                )
                return str(row[0])
            cur.execute(
                """INSERT INTO donors (full_name, email, tel_mobile, dob, gender, city, country)
                   VALUES (%s, %s, %s, %s, %s, %s, %s) RETURNING id""",
                fields,
            )
            return str(cur.fetchone()[0])

    def _upsert_payment_method(self, conn: Connection, pledge_uuid: str, pledge: Pledge) -> None:
        """Masked instrument details. Never a full PAN — there is no column.

        `expiry` is stored as the TEXT it arrives as: '0728' loses its leading
        zero the moment anything treats it as a number.
        """
        if not (pledge.masked_pan or pledge.expiry or pledge.instrument_type):
            return
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id FROM payment_methods WHERE pledge_id = %s AND is_current LIMIT 1",
                (pledge_uuid,),
            )
            row = cur.fetchone()
            values = (
                pledge.instrument_type or "UNKNOWN",
                pledge.masked_pan or None,
                pledge.expiry or None,
                pledge.issuing_bank or None,
            )
            if row:
                cur.execute(
                    """UPDATE payment_methods
                          SET instrument_type = %s, masked_pan = %s, expiry = %s,
                              issuing_bank = %s
                        WHERE id = %s""",
                    (*values, row[0]),
                )
                return
            cur.execute(
                """INSERT INTO payment_methods
                       (pledge_id, instrument_type, masked_pan, expiry, issuing_bank)
                   VALUES (%s, %s, %s, %s, %s)""",
                (pledge_uuid, *values),
            )

    #: Flat projection of a pledge. LEFT JOINs throughout: a pledge with no
    #: site or fundraiser must still come back, or provisional records vanish
    #: from every list.
    _PLEDGE_SELECT = """
        SELECT p.serial_no, p.country, p.amount, p.currency, p.frequency,
               p.frequency_raw, p.processing_bank, p.signup_date, p.submitted_at,
               p.debit_date, p.verified_at, p.cancellation_date, p.verified,
               p.app_status, p.current_status_id, p.current_status_date,
               p.current_classification, p.cancelled, p.cancellation_reason,
               p.cancellation_source, p.cancelled_by, p.cancelled_at, p.attempts,
               p.failed_attempts, p.attempts_to_success, p.verification_caller,
               d.full_name AS donor_name, d.email AS donor_email,
               d.tel_mobile AS donor_mobile, d.dob AS donor_dob, d.gender, d.city,
               c.code AS charity_code, cam.campaign_code, s.name AS site_name,
               loc.name AS location_name, a.agent_id AS agent_code,
               f.full_name AS fundraiser_name,
               sc.description AS current_status_description,
               pm.masked_pan, pm.expiry, pm.instrument_type, pm.issuing_bank,
               (SELECT l.full_name FROM fundraiser_leaders fl
                  JOIN leaders l ON l.id = fl.leader_id
                 WHERE fl.fundraiser_id = p.fundraiser_id
                 ORDER BY fl.effective_from DESC LIMIT 1) AS leader_name
          FROM pledges p
          JOIN donors d ON d.id = p.donor_id
          JOIN charities c ON c.id = p.charity_id
          LEFT JOIN campaigns cam ON cam.id = p.campaign_id
          LEFT JOIN sites s ON s.id = p.site_id
          LEFT JOIN locations loc ON loc.id = p.location_id
          LEFT JOIN agents a ON a.id = p.agent_id
          LEFT JOIN fundraisers f ON f.id = p.fundraiser_id
          LEFT JOIN status_codes sc ON sc.status_id = p.current_status_id
          LEFT JOIN payment_methods pm ON pm.pledge_id = p.id AND pm.is_current
    """

    @staticmethod
    def _to_pledge(row: dict[str, Any]) -> Pledge:
        """Rebuild the flat model. Blanks, not nulls, for the string fields.

        `Pledge` declares most strings as non-optional with `""` defaults, so
        passing a SQL NULL straight through would fail validation.
        """

        def s(key: str) -> str:
            return row.get(key) or ""

        return Pledge(
            serial_no=row["serial_no"],
            donor_name=s("donor_name"),
            donor_email=s("donor_email"),
            donor_mobile=s("donor_mobile"),
            donor_dob=row.get("donor_dob"),
            gender=row.get("gender"),
            city=s("city"),
            country=row.get("country") or "PH",
            charity_code=s("charity_code"),
            campaign_code=s("campaign_code"),
            site_name=s("site_name"),
            location_name=s("location_name"),
            agent_id=s("agent_code"),
            fundraiser_name=s("fundraiser_name"),
            leader_name=s("leader_name"),
            amount=row.get("amount") if row.get("amount") is not None else Decimal(0),
            currency=row.get("currency") or "PHP",
            frequency=s("frequency"),
            frequency_raw=s("frequency_raw"),
            instrument_type=s("instrument_type"),
            masked_pan=s("masked_pan"),
            expiry=s("expiry"),
            issuing_bank=s("issuing_bank"),
            processing_bank=s("processing_bank"),
            signup_date=row.get("signup_date"),
            submitted_at=row.get("submitted_at"),
            debit_date=row.get("debit_date"),
            verified_at=row.get("verified_at"),
            cancellation_date=row.get("cancellation_date"),
            cancellation_reason=row.get("cancellation_reason"),
            cancellation_source=row.get("cancellation_source"),
            cancelled_by=row.get("cancelled_by"),
            cancelled_at=row.get("cancelled_at"),
            verified=bool(row.get("verified")),
            verified_by=row.get("verification_caller"),
            app_status=s("app_status"),
            current_status_id=row.get("current_status_id"),
            current_status_description=row.get("current_status_description"),
            current_status_date=row.get("current_status_date"),
            current_classification=row.get("current_classification"),
            attempts=row.get("attempts") or 0,
            failed_attempts=row.get("failed_attempts") or 0,
            attempts_to_success=row.get("attempts_to_success"),
            cancelled=bool(row.get("cancelled")),
        )

    def get_pledge(self, serial_no: str) -> Pledge | None:
        with self.pool.connection() as conn, conn.cursor(row_factory=dict_row) as cur:
            cur.execute(f"{self._PLEDGE_SELECT} WHERE p.serial_no = %s", (serial_no,))
            row = cur.fetchone()
        return self._to_pledge(row) if row else None

    def all_pledges(self) -> list[Pledge]:
        with self.pool.connection() as conn, conn.cursor(row_factory=dict_row) as cur:
            cur.execute(f"{self._PLEDGE_SELECT} ORDER BY p.serial_no")
            return [self._to_pledge(r) for r in cur.fetchall()]

    # -- billing events (append-only) ---------------------------------------

    def add_billing_event(self, event: BillingEvent) -> bool:
        """Append one event. False if it was already on file.

        Dedupe is the database's `billing_events_natural_key` unique index
        rather than a Python set — a set cannot be shared between workers, and
        the daily bank file repeats yesterday's rows on every upload.
        """
        with self.pool.connection() as conn:
            pledge_uuid = self._pledge_uuid(conn, event.serial_no)
            if pledge_uuid is None:
                # Consolidation always writes the pledge first, so this means a
                # caller skipped that step. Losing the event silently would be
                # worse than a loud failure.
                raise ValueError(f"no pledge for serial {event.serial_no}")
            self._ensure_status_code(conn, event.status_id, event.status_description)
            with conn.cursor() as cur:
                cur.execute(
                    """INSERT INTO billing_events
                           (pledge_id, import_batch_id, status_id, reason, reason_desc,
                            status_date, bank_batch_no, attempt_no)
                       VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                       ON CONFLICT (pledge_id, status_id, status_date) DO NOTHING
                       RETURNING id""",
                    (
                        pledge_uuid,
                        event.upload_id,
                        event.status_id,
                        event.reason,
                        event.reason_desc,
                        event.status_date,
                        event.bank_batch_no,
                        event.attempt_no,
                    ),
                )
                inserted = cur.fetchone() is not None
            conn.commit()
        return inserted

    _EVENT_SELECT = """
        SELECT be.id, p.serial_no, be.status_id,
               COALESCE(sc.description, be.status_id::text) AS status_description,
               be.reason, be.reason_desc, be.status_date, be.bank_batch_no,
               be.attempt_no, be.import_batch_id
          FROM billing_events be
          JOIN pledges p ON p.id = be.pledge_id
          LEFT JOIN status_codes sc ON sc.status_id = be.status_id
    """

    @staticmethod
    def _to_event(row: dict[str, Any]) -> BillingEvent:
        return BillingEvent(
            id=str(row["id"]),
            serial_no=row["serial_no"],
            status_id=row["status_id"],
            status_description=row["status_description"] or "Unknown",
            reason=row.get("reason"),
            reason_desc=row.get("reason_desc"),
            status_date=row["status_date"],
            bank_batch_no=row.get("bank_batch_no"),
            attempt_no=row.get("attempt_no") or 1,
            upload_id=str(row["import_batch_id"]) if row.get("import_batch_id") else "",
        )

    def events_for(self, serial_no: str) -> list[BillingEvent]:
        with self.pool.connection() as conn, conn.cursor(row_factory=dict_row) as cur:
            cur.execute(
                f"{self._EVENT_SELECT} WHERE p.serial_no = %s "
                "ORDER BY be.status_date, be.attempt_no",
                (serial_no,),
            )
            return [self._to_event(r) for r in cur.fetchall()]

    def events_from_upload(self, upload_id: str) -> list[BillingEvent]:
        with self.pool.connection() as conn, conn.cursor(row_factory=dict_row) as cur:
            cur.execute(
                f"{self._EVENT_SELECT} WHERE be.import_batch_id = %s "
                "ORDER BY be.status_date, be.attempt_no",
                (upload_id,),
            )
            return [self._to_event(r) for r in cur.fetchall()]

    def all_billing_events(self) -> list[BillingEvent]:
        with self.pool.connection() as conn, conn.cursor(row_factory=dict_row) as cur:
            cur.execute(f"{self._EVENT_SELECT} ORDER BY be.status_date, p.serial_no")
            return [self._to_event(r) for r in cur.fetchall()]

    # -- uploads ------------------------------------------------------------

    def add_upload(self, upload: Upload) -> None:
        with self.pool.connection() as conn, conn.cursor() as cur:
            cur.execute(
                """INSERT INTO import_batches
                       (id, source_type, filename, uploaded_by_name, row_count,
                        matched_count, new_record_count, exception_count, status,
                        created_at)
                   VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                   ON CONFLICT (id) DO NOTHING""",
                (
                    upload.id,
                    upload.source_type,
                    upload.filename,
                    upload.uploaded_by,
                    upload.row_count,
                    upload.matched_count,
                    upload.new_record_count,
                    upload.exception_count,
                    upload.status,
                    upload.uploaded_at,
                ),
            )
            conn.commit()

    def replace_upload(self, upload: Upload) -> None:
        with self.pool.connection() as conn, conn.cursor() as cur:
            cur.execute(
                """UPDATE import_batches
                      SET source_type = %s, filename = %s, uploaded_by_name = %s,
                          row_count = %s, matched_count = %s, new_record_count = %s,
                          exception_count = %s, status = %s
                    WHERE id = %s""",
                (
                    upload.source_type,
                    upload.filename,
                    upload.uploaded_by,
                    upload.row_count,
                    upload.matched_count,
                    upload.new_record_count,
                    upload.exception_count,
                    upload.status,
                    upload.id,
                ),
            )
            if cur.rowcount == 0:
                conn.commit()
                self.add_upload(upload)
                return
            conn.commit()

    _UPLOAD_SELECT = """
        SELECT id, source_type, filename, uploaded_by_name, row_count, matched_count,
               new_record_count, exception_count, status, created_at
          FROM import_batches
    """

    @staticmethod
    def _to_upload(row: dict[str, Any]) -> Upload:
        return Upload(
            id=str(row["id"]),
            filename=row.get("filename") or "",
            source_type=row["source_type"],
            uploaded_at=row["created_at"],
            uploaded_by=row.get("uploaded_by_name") or "",
            row_count=row.get("row_count") or 0,
            matched_count=row.get("matched_count") or 0,
            new_record_count=row.get("new_record_count") or 0,
            exception_count=row.get("exception_count") or 0,
            status=row.get("status") or "consolidated",
        )

    def all_uploads(self) -> list[Upload]:
        with self.pool.connection() as conn, conn.cursor(row_factory=dict_row) as cur:
            cur.execute(f"{self._UPLOAD_SELECT} ORDER BY created_at DESC")
            return [self._to_upload(r) for r in cur.fetchall()]

    def get_upload(self, upload_id: str) -> Upload | None:
        with self.pool.connection() as conn, conn.cursor(row_factory=dict_row) as cur:
            cur.execute(f"{self._UPLOAD_SELECT} WHERE id = %s", (upload_id,))
            row = cur.fetchone()
        return self._to_upload(row) if row else None

    # -- exceptions ---------------------------------------------------------

    def add_exception(self, exception: ImportException) -> bool:
        """Add a review item unless the same problem is already open.

        Same rule as the in-memory store: keyed on (serial, problem) among
        UNRESOLVED rows only, so re-uploading yesterday's file does not grow
        the queue, but a problem that recurs after being resolved surfaces
        again.
        """
        with self.pool.connection() as conn, conn.cursor() as cur:
            cur.execute(
                """SELECT 1 FROM import_exceptions
                    WHERE serial_no IS NOT DISTINCT FROM %s
                      AND problem = %s AND NOT resolved LIMIT 1""",
                (exception.serial_no, exception.problem),
            )
            if cur.fetchone():
                return False
            cur.execute(
                """INSERT INTO import_exceptions
                       (id, import_batch_id, serial_no, problem, filename, detail,
                        raw_row, resolved, created_at)
                   VALUES (%s, %s, %s, %s, %s, %s, %s::jsonb, %s, %s)""",
                (
                    exception.id,
                    exception.upload_id,
                    exception.serial_no,
                    exception.problem,
                    exception.filename,
                    exception.detail,
                    json.dumps({"summary": exception.raw_summary}),
                    exception.resolved,
                    exception.created_at,
                ),
            )
            conn.commit()
        return True

    def clear_exceptions_for(self, serial_no: str) -> int:
        with self.pool.connection() as conn, conn.cursor() as cur:
            cur.execute(
                """UPDATE import_exceptions SET resolved = true
                    WHERE serial_no = %s AND NOT resolved""",
                (serial_no,),
            )
            closed = cur.rowcount
            conn.commit()
        return closed

    _EXCEPTION_SELECT = """
        SELECT id, import_batch_id, serial_no, problem, filename, detail, raw_row,
               resolved, created_at
          FROM import_exceptions
    """

    @staticmethod
    def _to_exception(row: dict[str, Any]) -> ImportException:
        raw = row.get("raw_row") or {}
        return ImportException(
            id=str(row["id"]),
            upload_id=str(row["import_batch_id"]),
            filename=row.get("filename") or "",
            serial_no=row.get("serial_no"),
            problem=row["problem"],
            detail=row.get("detail") or "",
            raw_summary=raw.get("summary", "") if isinstance(raw, dict) else "",
            resolved=bool(row["resolved"]),
            created_at=row["created_at"],
        )

    def all_exceptions(self) -> list[ImportException]:
        with self.pool.connection() as conn, conn.cursor(row_factory=dict_row) as cur:
            cur.execute(f"{self._EXCEPTION_SELECT} ORDER BY created_at DESC")
            return [self._to_exception(r) for r in cur.fetchall()]

    def resolve_exception(self, exception_id: str) -> ImportException | None:
        with self.pool.connection() as conn, conn.cursor(row_factory=dict_row) as cur:
            cur.execute(
                "UPDATE import_exceptions SET resolved = true WHERE id = %s RETURNING id",
                (exception_id,),
            )
            if cur.fetchone() is None:
                return None
            conn.commit()
            cur.execute(f"{self._EXCEPTION_SELECT} WHERE id = %s", (exception_id,))
            row = cur.fetchone()
        return self._to_exception(row) if row else None

    def open_exception_count(self, upload_id: str) -> int:
        with self.pool.connection() as conn, conn.cursor() as cur:
            cur.execute(
                """SELECT count(*) FROM import_exceptions
                    WHERE import_batch_id = %s AND NOT resolved""",
                (upload_id,),
            )
            return int(cur.fetchone()[0])

    # -- notes --------------------------------------------------------------

    def add_note(self, note: PledgeNote) -> None:
        with self.pool.connection() as conn:
            pledge_uuid = self._pledge_uuid(conn, note.serial_no)
            if pledge_uuid is None:
                raise ValueError(f"no pledge for serial {note.serial_no}")
            with conn.cursor() as cur:
                cur.execute(
                    """INSERT INTO pledge_notes (id, pledge_id, author, body, created_at)
                       VALUES (%s, %s, %s, %s, %s)""",
                    (note.id, pledge_uuid, note.author, note.text, note.created_at),
                )
            conn.commit()

    def notes_for(self, serial_no: str) -> list[PledgeNote]:
        with self.pool.connection() as conn, conn.cursor(row_factory=dict_row) as cur:
            cur.execute(
                """SELECT n.id, p.serial_no, n.author, n.body, n.created_at
                     FROM pledge_notes n
                     JOIN pledges p ON p.id = n.pledge_id
                    WHERE p.serial_no = %s
                    ORDER BY n.created_at DESC""",
                (serial_no,),
            )
            return [
                PledgeNote(
                    id=str(r["id"]),
                    serial_no=r["serial_no"],
                    author=r["author"],
                    created_at=r["created_at"],
                    text=r["body"],
                )
                for r in cur.fetchall()
            ]

    # -- export runs --------------------------------------------------------

    def add_export_run(self, run: ExportRun) -> None:
        with self.pool.connection() as conn, conn.cursor() as cur:
            cur.execute(
                """INSERT INTO export_runs
                       (id, template_code, template_name, run_by_name, row_count,
                        file_name, contains_pii, created_at)
                   VALUES (%s, %s, %s, %s, %s, %s, %s, %s)""",
                (
                    run.id,
                    run.template_code,
                    run.template_name,
                    run.run_by,
                    run.row_count,
                    run.file_name,
                    run.contains_pii,
                    run.run_at,
                ),
            )
            conn.commit()

    def all_export_runs(self) -> list[ExportRun]:
        with self.pool.connection() as conn, conn.cursor(row_factory=dict_row) as cur:
            cur.execute(
                """SELECT id, template_code, template_name, run_by_name, row_count,
                          file_name, contains_pii, created_at
                     FROM export_runs ORDER BY created_at DESC"""
            )
            return [
                ExportRun(
                    id=str(r["id"]),
                    template_code=r.get("template_code") or "",
                    template_name=r.get("template_name") or "",
                    run_at=r["created_at"],
                    run_by=r.get("run_by_name") or "",
                    row_count=r.get("row_count") or 0,
                    file_name=r.get("file_name") or "",
                    contains_pii=bool(r["contains_pii"]),
                )
                for r in cur.fetchall()
            ]

    # -- audit --------------------------------------------------------------

    def log(self, actor: str, action: str, detail: str, *, contains_pii: bool = False) -> None:
        """Audit trail. Detail must never contain donor PII (RA 10173)."""
        with self.pool.connection() as conn, conn.cursor() as cur:
            cur.execute(
                """INSERT INTO audit_log (actor_name, action, detail, contains_pii)
                   VALUES (%s, %s, %s::jsonb, %s)""",
                (actor, action, json.dumps({"message": detail}), contains_pii),
            )
            conn.commit()

    def all_audit(self) -> list[AuditEntry]:
        with self.pool.connection() as conn, conn.cursor(row_factory=dict_row) as cur:
            cur.execute(
                """SELECT id, actor_name, action, detail, contains_pii, created_at
                     FROM audit_log ORDER BY created_at DESC"""
            )
            rows = cur.fetchall()
        out = []
        for r in rows:
            detail = r.get("detail")
            message = detail.get("message", "") if isinstance(detail, dict) else str(detail or "")
            out.append(
                AuditEntry(
                    id=str(r["id"]),
                    at=r["created_at"],
                    actor=r.get("actor_name") or "",
                    action=r["action"],
                    detail=message,
                    contains_pii=bool(r["contains_pii"]),
                )
            )
        return out

    # -- team ---------------------------------------------------------------

    _FUNDRAISER_SELECT = """
        SELECT f.id, f.full_name, f.employee_code, f.tier, f.is_active,
               f.start_date, f.end_date,
               COALESCE(
                   (SELECT array_agg(l.full_name ORDER BY l.full_name)
                      FROM fundraiser_leaders fl
                      JOIN leaders l ON l.id = fl.leader_id
                     WHERE fl.fundraiser_id = f.id),
                   '{}'
               ) AS leader_names
          FROM fundraisers f
    """

    @staticmethod
    def _to_seed(row: dict[str, Any]) -> FundraiserSeed:
        return FundraiserSeed(
            name=row["full_name"],
            code=row.get("employee_code") or str(row["id"]),
            leader_names=list(row.get("leader_names") or []),
            active=bool(row.get("is_active", True)),
            start_date=row["start_date"].isoformat() if row.get("start_date") else None,
            end_date=row["end_date"].isoformat() if row.get("end_date") else None,
            tier=row.get("tier"),
        )

    def all_fundraisers(self) -> list[FundraiserSeed]:
        with self.pool.connection() as conn, conn.cursor(row_factory=dict_row) as cur:
            cur.execute(f"{self._FUNDRAISER_SELECT} ORDER BY f.full_name")
            return [self._to_seed(r) for r in cur.fetchall()]

    def find_fundraiser(self, code: str) -> FundraiserSeed | None:
        with self.pool.connection() as conn, conn.cursor(row_factory=dict_row) as cur:
            cur.execute(f"{self._FUNDRAISER_SELECT} WHERE f.employee_code = %s", (code,))
            row = cur.fetchone()
        return self._to_seed(row) if row else None

    def add_fundraiser(self, seed: FundraiserSeed) -> None:
        self._write_fundraiser(seed, match_code=None)

    def save_fundraiser(self, seed: FundraiserSeed) -> None:
        """Persist edits. See memory.Store.save_fundraiser on why this exists."""
        self._write_fundraiser(seed, match_code=seed.code)

    def _write_fundraiser(self, seed: FundraiserSeed, *, match_code: str | None) -> None:
        with self.pool.connection() as conn, conn.cursor() as cur:
            cur.execute(
                """INSERT INTO fundraisers
                       (full_name, employee_code, tier, is_active, start_date, end_date)
                   VALUES (%s, %s, %s, %s, %s, %s)
                   ON CONFLICT (employee_code) DO UPDATE SET
                       full_name = EXCLUDED.full_name,
                       tier = EXCLUDED.tier,
                       is_active = EXCLUDED.is_active,
                       start_date = EXCLUDED.start_date,
                       end_date = EXCLUDED.end_date
                   RETURNING id""",
                (
                    seed.name,
                    seed.code,
                    seed.tier,
                    seed.active,
                    seed.start_date,
                    seed.end_date,
                ),
            )
            fundraiser_id = str(cur.fetchone()[0])

            # Leader links are replaced wholesale: the API sends the complete
            # desired set, so diffing would only risk leaving a stale row.
            cur.execute(
                "DELETE FROM fundraiser_leaders WHERE fundraiser_id = %s", (fundraiser_id,)
            )
            for leader_name in seed.leader_names:
                cur.execute(
                    """INSERT INTO leaders (full_name) VALUES (%s)
                       ON CONFLICT DO NOTHING""",
                    (leader_name,),
                )
                cur.execute(
                    "SELECT id FROM leaders WHERE full_name = %s LIMIT 1", (leader_name,)
                )
                found = cur.fetchone()
                if found is None:
                    continue
                cur.execute(
                    """INSERT INTO fundraiser_leaders
                           (fundraiser_id, leader_id, effective_from)
                       VALUES (%s, %s, CURRENT_DATE)
                       ON CONFLICT DO NOTHING""",
                    (fundraiser_id, str(found[0])),
                )
            conn.commit()

    def leaders_of(self, name: str) -> list[str]:
        with self.pool.connection() as conn, conn.cursor() as cur:
            cur.execute(
                """SELECT l.full_name
                     FROM fundraisers f
                     JOIN fundraiser_leaders fl ON fl.fundraiser_id = f.id
                     JOIN leaders l ON l.id = fl.leader_id
                    WHERE lower(f.full_name) = lower(%s)
                    ORDER BY l.full_name""",
                (name,),
            )
            return [r[0] for r in cur.fetchall()]

    def ensure_fundraiser(self, name: str) -> FundraiserSeed:
        """Create a roster entry for a name seen in an import.

        Without this, an imported pledge naming someone off-roster drops out of
        every per-fundraiser roll-up.
        """
        with self.pool.connection() as conn:
            self._fundraiser_id(conn, name)
            conn.commit()
        with self.pool.connection() as conn, conn.cursor(row_factory=dict_row) as cur:
            cur.execute(
                f"{self._FUNDRAISER_SELECT} WHERE lower(f.full_name) = lower(%s) LIMIT 1",
                (name,),
            )
            row = cur.fetchone()
        return self._to_seed(row) if row else FundraiserSeed(name=name, code=_new_id())

    def all_leaders(self) -> list[str]:
        with self.pool.connection() as conn, conn.cursor() as cur:
            cur.execute("SELECT full_name FROM leaders ORDER BY full_name")
            return [r[0] for r in cur.fetchall()]

    def add_leader(self, name: str) -> bool:
        with self.pool.connection() as conn, conn.cursor() as cur:
            cur.execute("SELECT 1 FROM leaders WHERE full_name = %s", (name,))
            if cur.fetchone():
                return False
            cur.execute("INSERT INTO leaders (full_name) VALUES (%s)", (name,))
            conn.commit()
        return True

    # -- sites --------------------------------------------------------------

    def ensure_site(self, name: str, *, location_name: str, country: str, charity: str) -> None:
        with self.pool.connection() as conn:
            charity_id = self._charity_id(conn, charity)
            location_id = self._location_id(conn, location_name or name, country)
            self._site_id(conn, name, charity_id=charity_id, location_id=location_id)
            conn.commit()

    def all_sites(self) -> list[SiteSeed]:
        with self.pool.connection() as conn, conn.cursor(row_factory=dict_row) as cur:
            cur.execute(
                """SELECT s.name, s.starts_on, s.ends_on,
                          COALESCE(loc.name, s.name) AS location_name,
                          loc.country, c.code AS charity_code
                     FROM sites s
                     LEFT JOIN locations loc ON loc.id = s.location_id
                     LEFT JOIN charities c ON c.id = s.charity_id
                    ORDER BY s.name"""
            )
            return [
                SiteSeed(
                    name=r["name"],
                    location_name=r.get("location_name") or r["name"],
                    country=r.get("country") or "PH",
                    charity_code=r.get("charity_code") or "",
                    starts_on=r["starts_on"].isoformat() if r.get("starts_on") else None,
                    ends_on=r["ends_on"].isoformat() if r.get("ends_on") else None,
                )
                for r in cur.fetchall()
            ]


def _json_default(value: Any) -> Any:
    """Make Settings JSON-serializable: Decimal money and dates appear in it."""
    if isinstance(value, Decimal):
        return str(value)
    if isinstance(value, datetime | date):
        return value.isoformat()
    if hasattr(value, "__dict__"):
        return vars(value)
    raise TypeError(f"cannot serialize {type(value).__name__}")


__all__ = ["SETTINGS_KEY", "PostgresStore"]
