"""The authoritative column lists, transcribed from the client's real files.

Read from `doc/Master Apps Tracker - 16JUL2026.xlsx` and
`doc/Status Report - 16JUL2026.xlsx` on 2026-08-07. **Header text is
load-bearing** — the legacy exports must reproduce it byte-for-byte, quirks
included, so nothing here may be "tidied up".

Quirks that are real and must survive:

- Apps Tracker says `CUSTOMER'S NAME` (apostrophe); the Status Report says
  `CUSTOMERS NAME` (none). Two files, two spellings, both correct.
- `Fax AREACODE` has a lowercase 'F' where its siblings are `FAX COUNTRYCODE`
  and `FAX NUMBER`.
- `Invoice No.` carries a trailing period.
- The Apps Tracker has BOTH `CARDTYPE` (col 47) and `CARD TYPE` (col 51).
  They are different columns. This is why rows are held positionally.
- Amounts are `DONATION AMOUNT` in the Apps Tracker and `DonationAmount` in
  the Status Report.
- Column 4 is a single space and column 109 is empty — the two junk columns.
  Column 4 carries the 2-character recruiter code (`FP`) and must be kept.
"""

from __future__ import annotations

# ---------------------------------------------------------------------------
# The 26-column bank schema.
#
# The Status Report (daily) and the Master Results Tracker (accumulated) have
# IDENTICAL headers — confirming the Results Tracker is nothing more than
# stacked Status Reports, exactly as FINDINGS §1 concluded.
# ---------------------------------------------------------------------------

STATUS_REPORT_COLUMNS: tuple[str, ...] = (
    "Charity Code",
    "Bank",
    "SERIAL NO",
    "SG BATCH NO",
    "NRIC",
    "STATUS ID",
    "STATUS DESCRIPTION",
    "REASON",
    "REASONDESC",
    "STATUS DATE",
    "CUSTOMERS NAME",
    "ACCOUNT NUMBER",
    "CHQ/MO/PO",
    "CREDIT CARD",
    "Anniversary",
    "A0 Attempts",
    "Recruiter Batch No",
    "ExpiryDate",
    "DonationAmount",
    "Frequency",
    "Recruiter Submission Date",
    "AgentID",
    "DEBIT_CREDIT_CARD",
    "LocationCode",
    "Channel",
    "Recruiter Code",
)

# ---------------------------------------------------------------------------
# The 113-column Apps Tracker schema (111 real + 2 junk).
# ---------------------------------------------------------------------------

APPS_TRACKER_COLUMNS: tuple[str | None, ...] = (
    "IMPORTANT REMARKS",
    "COUNTRY",
    "CHARITY CODE",
    " ",  # junk column 4 — holds the recruiter code
    "SUB-RECRUITER CODE",
    "ORIGINAL BATCH NUM",
    "ORIGINAL DONOR ID",
    "PROFILE TYPE",
    "SERIAL NO",
    "TITLE",
    "CUSTOMER'S NAME",
    "FIRSTNAME",
    "LAST NAME",
    "CHINESENAME",
    "IC NUMBER",
    "GENDER",
    "DOB",
    "LANGUAGE",
    "SPOKEN LANGUAGE",
    "TEL HP COUNTRYCODE",
    "TEL HP AREACODE",
    "TEL HP",
    "TEL HSE COUNTRYCODE",
    "TEL HSE AREACODE",
    "TEL HSE",
    "TEL OFF COUNTRYCODE",
    "TEL OFF AREACODE",
    "TEL OFF",
    "FAX COUNTRYCODE",
    "Fax AREACODE",
    "FAX NUMBER",
    "EMAIL",
    "ADDRESS 1",
    "ADDRESS 2",
    "ADDRESS 3",
    "ADDRESS 4",
    "POSTCODE",
    "CITY",
    "STATE",
    "COUNTRY FOR ADDRESS",
    "CAMPAIGN CODE",
    "FUNDCODE",
    "PROCESSING BANK",
    "DONATION AMOUNT",
    "FREQUENCY",
    "CREDIT CARD",
    "CARDTYPE",
    "EXPIRY",
    "NAME OF CARD HOLDER",
    "ISSUING BANK",
    "CARD TYPE",
    "ACCOUNT NUMBER",
    "BANKCODE",
    "BRANCHCODE",
    "GIRO_REF_NUM",
    "CHQ/MO/PO",
    "DATE PROCESSED",
    "REMARKS",
    "POSTALMAIL",
    "ELECTRONICMAIL",
    "CHANNEL",
    "EVENT CODE",
    "LOCATION CODE",
    "APPEAL CODE",
    "PROGRAM CODE",
    "AGENT ID",
    "SIGNUP DATE",
    "STATUS DATE",
    "VERIFIED",
    "VERIFIEDBY",
    "VERIFIEDDATE",
    "STATUS",
    "CHARITY SOURCE CODE",
    "BIZ NAME",
    "DESIGNATION",
    "PLEDGETYPE",
    "DOBOTYPE",
    "PRINCIPAL",
    "OnBehalf_Title",
    "OnBehalf_FirstName",
    "OnBehalf_LastName",
    "OnBehalf_Add1",
    "OnBehalf_Add2",
    "OnBehalf_Add3",
    "OnBehalf_Add4",
    "OnBehalf_Postcode",
    "OnBehalf_City",
    "OnBehalf_State",
    "OnBehalf_Gender",
    "OnBehalf_DOB",
    "OnBehalf_Email",
    "OnBehalf_Relationship",
    "OnBehalf_Tel",
    "RESULTS",
    "REASON",
    "DEBIT DATE",
    "Fundraiser Name",
    "Paid to FR?",
    "Payout Date",
    "Payroll conditions",
    "Clawback Date",
    "Invoiced Date",
    "Invoice No.",
    "Batchno",
    "CANCELLED/UNREALIZED?",
    "CANCELLATION DATE",
    "REPORT MONTH UNREALIZED",
    "OTHER NOTES",
    None,  # junk column 109 — genuinely blank
    "CS TEMPLATE SUBMISSION DATE",
    "CS TEAM ACTION DATE",
    "FOR INVOICE CLAWBACK?",
    "AGE",
)

# 1-based positions of the two junk columns, per FINDINGS §2 trap 8.
APPS_TRACKER_JUNK_POSITIONS = (4, 109)

# Columns holding donor PII. Never let these reach a log line or an error
# message (RA 10173); the raw row is still retained for an authorised human.
PII_COLUMNS = frozenset(
    {
        "CUSTOMERS NAME",
        "CUSTOMER'S NAME",
        "FIRSTNAME",
        "LAST NAME",
        "CHINESENAME",
        "NAME OF CARD HOLDER",
        "NRIC",
        "IC NUMBER",
        "DOB",
        "EMAIL",
        "CREDIT CARD",
        "ACCOUNT NUMBER",
        "TEL HP",
        "TEL HSE",
        "TEL OFF",
        "FAX NUMBER",
        "ADDRESS 1",
        "ADDRESS 2",
        "ADDRESS 3",
        "ADDRESS 4",
    }
)
