"""Dashboard widgets, filtering, and the team roll-ups."""

from __future__ import annotations

from tests.conftest import ApiClient


def test_kpis_use_a_single_realization_denominator(loaded: ApiClient) -> None:
    """realized ÷ SUBMITTED, everywhere.

    Of six applications, five reached the bank and three billed (0001, 0002
    on retry, 0005 before it cancelled). 0005 has since cancelled, so two
    remain realized: 2/5.
    """
    kpis = loaded.json("/kpis")
    assert kpis["signups"] == 6
    assert round(kpis["realizationRate"], 4) == round(2 / 5, 4)
    assert kpis["activeDonors"] == 2
    assert kpis["cancelledThisMonth"] == 1


def test_kpis_total_the_pledged_value(loaded: ApiClient) -> None:
    # 1000 + 600 + 1500 + 800 + 1200 + 500
    assert loaded.json("/kpis")["pledgedValue"] == 5600


def test_the_realization_rate_matches_the_results_split(loaded: ApiClient) -> None:
    """The number on the tile and the chart beneath it must agree — this is
    exactly the inconsistency the owners hit on the frontend."""
    kpis = loaded.json("/kpis")
    split = {s["label"]: s["value"] for s in loaded.json("/results-split")}
    # The slices are mutually exclusive and together account for every
    # submitted application, so they sum to the rate's denominator.
    submitted = sum(split.values())
    assert submitted == 5
    assert split["Approved"] / submitted == kpis["realizationRate"]


def test_results_split_counts_each_outcome(loaded: ApiClient) -> None:
    split = {s["label"]: s["value"] for s in loaded.json("/results-split")}
    assert split["Approved"] == 2
    assert split["Retrying"] == 1  # 0003
    assert split["Failed final"] == 1  # 0004
    assert split["Cancelled"] == 1  # 0005


def test_timeseries_stops_at_the_last_complete_week(loaded: ApiClient) -> None:
    series = loaded.json("/timeseries")
    assert len(series) == 16
    assert series[0]["date"] < series[-1]["date"]
    # The current part-week is excluded, so no bucket is dated after today.
    assert all(point["date"] <= "2026-07-27" for point in series)


def test_instrument_split_reports_approval_per_instrument(loaded: ApiClient) -> None:
    rows = {r["label"]: r for r in loaded.json("/instrument-split")}
    assert rows["Credit card"]["count"] == 4
    assert rows["Debit card"]["count"] == 2
    assert 0.0 <= rows["Credit card"]["approvalRate"] <= 1.0


def test_frequency_mix_uses_canonical_labels(loaded: ApiClient) -> None:
    labels = {row["label"] for row in loaded.json("/frequency-mix")}
    assert labels <= {"Monthly", "Quarterly", "Semi-Annual", "Annual"}
    assert "1" not in labels and "12" not in labels


def test_age_bands_are_computed_from_dob(loaded: ApiClient) -> None:
    bands = {b["band"]: b["count"] for b in loaded.json("/age-bands")}
    assert sum(bands.values()) == 6
    assert bands["51+"] == 1  # born 1975


# ---------------------------------------------------------------------------
# Banks — "consolidate and show banks who fail", 2026-08-07
# ---------------------------------------------------------------------------


def test_bank_performance_reports_both_roles(loaded: ApiClient) -> None:
    rows = loaded.json("/bank-performance")
    assert {r["role"] for r in rows} == {"issuing", "processing"}


def test_bank_performance_identifies_the_failing_bank(loaded: ApiClient) -> None:
    issuing = {r["bank"]: r for r in loaded.json("/bank-performance") if r["role"] == "issuing"}

    # Maybank holds the card that expired; nothing of theirs billed.
    assert issuing["Maybank Berhad"]["failedFinal"] == 1
    assert issuing["Maybank Berhad"]["realizationRate"] == 0.0
    # HSBC Philippines holds both approvals.
    assert issuing["HSBC Philippines"]["approved"] == 1
    assert issuing["HSBC Philippines"]["realizationRate"] > 0


def test_processing_bank_aggregates_the_whole_book(loaded: ApiClient) -> None:
    processing = [r for r in loaded.json("/bank-performance") if r["role"] == "processing"]
    assert len(processing) == 1
    assert processing[0]["bank"] == "HSBC"
    assert processing[0]["submitted"] == 5


# ---------------------------------------------------------------------------
# Filtering
# ---------------------------------------------------------------------------


def test_filter_by_charity(loaded: ApiClient) -> None:
    rows = loaded.json("/pledges", params={"charity": "STC"})
    assert {r["serialNo"] for r in rows} == {
        "FES48000001",
        "FES48000002",
        "FES48000005",
    }


def test_filter_by_status(loaded: ApiClient) -> None:
    assert [r["serialNo"] for r in loaded.json("/pledges", params={"status": "retrying"})] == [
        "FES48000003"
    ]
    assert [r["serialNo"] for r in loaded.json("/pledges", params={"status": "failed"})] == [
        "FEH48000004"
    ]
    assert [r["serialNo"] for r in loaded.json("/pledges", params={"status": "pending"})] == [
        "FEH48000006"
    ]


def test_filter_by_verified_gives_the_call_backlog(loaded: ApiClient) -> None:
    unverified = loaded.json("/pledges", params={"verified": "false"})
    assert len(unverified) == 4
    assert all(not r["verified"] for r in unverified)


def test_search_matches_serial_donor_and_fundraiser(loaded: ApiClient) -> None:
    assert len(loaded.json("/pledges", params={"q": "FES48000001"})) == 1
    assert len(loaded.json("/pledges", params={"q": "bacani"})) == 1
    assert len(loaded.json("/pledges", params={"q": "Grace Tolentino"})) == 3


def test_filter_by_leader_follows_the_many_to_many(loaded: ApiClient) -> None:
    """Grace reports to two leaders, so she appears under both."""
    for leader in ("Jhon Magno", "Mark Ramayrat"):
        rows = loaded.json("/pledges", params={"leader": leader})
        assert {r["fundraiserName"] for r in rows} == {"Grace Tolentino"}


def test_the_date_basis_selector_changes_the_answer(loaded: ApiClient) -> None:
    """'July' means different things on a sign-up basis than a debit basis —
    the whole reason the selector exists."""
    window = {"from": "2026-07-15", "to": "2026-07-31"}

    by_signup = loaded.json("/pledges", params={"basis": "signupDate", **window})
    by_debit = loaded.json("/pledges", params={"basis": "debitDate", **window})

    assert {r["serialNo"] for r in by_signup} == {"FEH48000006"}  # signed 20 Jul
    assert {r["serialNo"] for r in by_debit} == {"FES48000002"}  # billed 20 Jul


def test_every_lifecycle_date_is_filterable(loaded: ApiClient) -> None:
    for basis in (
        "signupDate",
        "submittedAt",
        "debitDate",
        "verifiedAt",
        "cancellationDate",
        "invoicedDate",
        "payoutDate",
    ):
        response = loaded.get(
            "/pledges", params={"basis": basis, "from": "2026-01-01", "to": "2026-12-31"}
        )
        assert response.status_code == 200, basis


def test_an_unknown_date_basis_is_rejected(loaded: ApiClient) -> None:
    response = loaded.get("/pledges", params={"basis": "whenever", "from": "2026-01-01"})
    assert response.status_code == 422


def test_filters_apply_to_every_widget(loaded: ApiClient) -> None:
    """One filter object drives the whole page, so a filtered dashboard must
    not mix a filtered table with unfiltered totals."""
    params = {"charity": "STC"}
    assert loaded.json("/kpis", params=params)["signups"] == 3
    assert sum(p["signups"] for p in loaded.json("/timeseries", params=params)) <= 3
    assert len(loaded.json("/pledges", params=params)) == 3


# ---------------------------------------------------------------------------
# Team roll-ups
# ---------------------------------------------------------------------------


def test_fundraiser_records_include_employment_dates(loaded: ApiClient) -> None:
    rows = {f["code"]: f for f in loaded.json("/team/fundraisers")}
    assert rows["FR001"]["startDate"] == "2024-03-04"
    assert rows["FR001"]["endDate"] is None
    assert rows["FR001"]["active"] is True


def test_leader_totals_overlap_by_design(loaded: ApiClient) -> None:
    """Grace reports to two leaders and counts toward both, so leader totals
    deliberately do not sum to the company total."""
    leaders = {leader["name"]: leader for leader in loaded.json("/leaders")}
    assert leaders["Jhon Magno"]["signups"] == 3
    assert leaders["Mark Ramayrat"]["signups"] == 3
    assert sum(leader["signups"] for leader in leaders.values()) > 6


def test_sites_roll_up_per_venue(loaded: ApiClient) -> None:
    sites = {s["name"]: s for s in loaded.json("/sites")}
    assert sites["MCIA T1 — July drive"]["signups"] == 3
    assert sites["MCIA T1 — July drive"]["staffCount"] == 1


def test_donors_are_grouped_with_duplicates_flagged(loaded: ApiClient) -> None:
    donors = loaded.json("/donors")
    assert len(donors) == 6
    assert all(d["pledgeCount"] >= 1 for d in donors)
