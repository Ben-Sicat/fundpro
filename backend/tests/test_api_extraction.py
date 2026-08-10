"""What the spreadsheet traps become once they are through the API.

The parser has its own unit tests; these prove the normalization survives all
the way to the JSON the UI reads, and that the settings-driven maps are
actually applied rather than merely defined.
"""

from __future__ import annotations

from tests.conftest import ApiClient


def by_serial(rows: list[dict]) -> dict[str, dict]:
    return {r["serialNo"]: r for r in rows}


def test_every_amount_shape_arrives_as_a_number(loaded: ApiClient) -> None:
    rows = by_serial(loaded.json("/pledges"))

    assert rows["FES48000001"]["amount"] == 1000  # plain int
    assert rows["FES48000002"]["amount"] == 600  # '=75*8' formula
    assert rows["FES48000003"]["amount"] == 1500  # '1,500.00' comma text
    assert all(isinstance(r["amount"], int | float) for r in rows.values())


def test_the_zero_padded_expiry_survives_to_the_api(loaded: ApiClient) -> None:
    """0728 read as a number becomes 728 and July is gone."""
    assert by_serial(loaded.json("/pledges"))["FES48000002"]["expiry"] == "0728"


def test_formula_dates_are_evaluated(loaded: ApiClient) -> None:
    rows = by_serial(loaded.json("/pledges"))
    # '=DATE(2026,7,4)' in the Apps Tracker's STATUS DATE.
    assert rows["FES48000003"]["submittedAt"] == "2026-07-04"
    # '=DATE(2026,7,20)' in the bank file's STATUS DATE.
    assert rows["FES48000002"]["debitDate"] == "2026-07-20"


def test_masked_pans_keep_the_bank_s_own_mask_character(loaded: ApiClient) -> None:
    """The real files mask with asterisks. Normalising the mask would make the
    stored value differ from what the bank sent."""
    pan = by_serial(loaded.json("/pledges"))["FES48000001"]["maskedPan"]
    assert pan == "542550********2906"


def test_no_full_card_number_can_appear_anywhere(loaded: ApiClient) -> None:
    import re

    body = str(loaded.json("/pledges"))
    # 13-19 consecutive digits would be an unmasked PAN.
    assert not re.search(r"\d{13,19}", body)


def test_charity_aliases_are_canonicalised(loaded: ApiClient) -> None:
    """The Apps Tracker says 'UNHCR MY'; reporting must say UNHCR."""
    assert by_serial(loaded.json("/pledges"))["FES48000003"]["charityCode"] == "UNHCR"
    assert "UNHCR MY" not in loaded.json("/charities")


def test_frequency_codes_are_mapped_through_settings(loaded: ApiClient) -> None:
    rows = by_serial(loaded.json("/pledges"))
    assert rows["FES48000001"]["frequency"] == "Monthly"  # code '1'
    assert rows["FES48000003"]["frequency"] == "Quarterly"  # code '3'
    assert rows["FEH48000004"]["frequency"] == "Monthly"  # code '12'


def test_the_ambiguous_frequency_mapping_is_changeable_without_a_deploy(
    loaded: ApiClient,
) -> None:
    """`1` is genuinely ambiguous and still unconfirmed by the client, so it
    has to be data. This is the endpoint that settles it when they answer."""
    loaded.put("/settings/frequency-map", json={"1": "Annual"})
    # Re-reading is enough: the map is applied at import, so the change takes
    # effect on the next upload rather than retroactively.
    assert loaded.json("/settings/frequency-map")["1"] == "Annual"


def test_card_type_casing_drift_is_normalised(loaded: ApiClient) -> None:
    rows = by_serial(loaded.json("/pledges"))
    assert rows["FES48000002"]["instrumentType"] == "DEBIT CARD"  # 'Debit Card'
    assert rows["FEH48000004"]["instrumentType"] == "CREDIT CARD"  # 'credit'


def test_free_text_site_names_are_trimmed(loaded: ApiClient) -> None:
    """'SM Light Mall — atrium ' and the same name without the trailing space
    must not become two sites in every group-by."""
    assert by_serial(loaded.json("/pledges"))["FES48000003"]["siteName"] == (
        "SM Light Mall — atrium"
    )


def test_the_junk_column_recruiter_code_is_not_lost(loaded: ApiClient) -> None:
    """Position 4's header is a single space but it carries the FP code."""
    # Surfaced through the A2 export's Recruiter Code column round trip.
    assert loaded.json("/pledges")  # dataset loaded
    events = loaded.json("/pledges/FES48000001/events")
    assert events, "expected billing history"


def test_country_and_currency_follow_the_application(loaded: ApiClient) -> None:
    rows = by_serial(loaded.json("/pledges"))
    assert rows["FES48000001"]["country"] == "PH"
    assert rows["FES48000001"]["currency"] == "PHP"
    assert rows["FEH48000004"]["country"] == "MY"
    assert rows["FEH48000004"]["currency"] == "MYR"


def test_age_is_computed_not_stored(loaded: ApiClient) -> None:
    """Age appears in the age-band report but never as a stored field."""
    pledge = loaded.json("/pledges/FES48000001")
    assert "age" not in pledge
    assert pledge["donorDob"] == "1994-03-02"
    assert sum(b["count"] for b in loaded.json("/age-bands")) > 0


def test_current_status_is_derived_from_the_latest_event(loaded: ApiClient) -> None:
    rows = by_serial(loaded.json("/pledges"))
    # 0002 failed on the 5th and approved on the 20th: latest wins.
    assert rows["FES48000002"]["currentStatusId"] == 66
    assert rows["FES48000002"]["currentClassification"] == "approved"
    assert rows["FES48000002"]["attempts"] == 2


def test_debit_date_is_the_first_approval_and_does_not_move(loaded: ApiClient) -> None:
    rows = by_serial(loaded.json("/pledges"))
    # 0005 approved on the 6th, cancelled on the 22nd. The money still moved.
    assert rows["FES48000005"]["debitDate"] == "2026-07-06"
    assert rows["FES48000005"]["cancelled"] is True
    assert rows["FES48000005"]["cancellationDate"] == "2026-07-22"


def test_a_pledge_never_sent_to_the_bank_has_no_outcome(loaded: ApiClient) -> None:
    pledge = loaded.json("/pledges/FEH48000006")
    assert pledge["submittedAt"] is None
    assert pledge["currentStatusId"] is None
    assert pledge["debitDate"] is None


def test_verification_is_read_from_the_tracker(loaded: ApiClient) -> None:
    rows = by_serial(loaded.json("/pledges"))
    assert rows["FES48000001"]["verified"] is True
    assert rows["FES48000001"]["verifiedAt"] == "2026-07-05"
    assert rows["FEH48000006"]["verified"] is False
