"""Upload → parse → consolidate, through the HTTP API.

This is the pipeline that replaces the manual VLOOKUP, so it gets the most
attention: idempotency, every exception path, and the guarantee that no input
row ever disappears.
"""

from __future__ import annotations

from pathlib import Path

from tests.conftest import ApiClient, upload
from tests.fixtures.workbooks import (
    build_apps_workbook,
    build_status_subset,
    build_status_workbook,
)


def test_apps_tracker_upload_creates_applications(api: ApiClient, tmp_path: Path) -> None:
    response = upload(api, build_apps_workbook(tmp_path / "apps.xlsx"))

    assert response.status_code == 201
    body = response.json()
    assert body["upload"]["sourceType"] == "apps_tracker"
    assert body["upload"]["rowCount"] == 6
    assert body["impact"]["newPledges"] == 6
    assert len(api.json("/pledges")) == 6


def test_the_file_type_is_detected_not_declared(api: ApiClient, tmp_path: Path) -> None:
    """The user drops a file; the service works out which tracker it is."""
    apps = upload(api, build_apps_workbook(tmp_path / "a.xlsx"), name="anything.xlsx")
    status = upload(api, build_status_workbook(tmp_path / "s.xlsx"), name="other.xlsx")

    assert apps.json()["upload"]["sourceType"] == "apps_tracker"
    assert status.json()["upload"]["sourceType"] == "status_report"


def test_status_report_matches_on_serial_and_appends_history(
    api: ApiClient, tmp_path: Path
) -> None:
    upload(api, build_apps_workbook(tmp_path / "apps.xlsx"))
    upload(api, build_status_workbook(tmp_path / "status.xlsx"))

    events = api.json("/pledges/FES48000002/events")
    assert [e["statusId"] for e in events] == [59, 66]
    assert [e["statusDate"] for e in events] == ["2026-07-05", "2026-07-20"]


def test_re_uploading_the_same_file_changes_nothing(api: ApiClient, tmp_path: Path) -> None:
    """The daily bank file repeats yesterday's rows. Without the dedupe key
    every pledge's history would double on each upload."""
    upload(api, build_apps_workbook(tmp_path / "apps.xlsx"))
    status = build_status_workbook(tmp_path / "status.xlsx")

    upload(api, status)
    first = api.json("/pledges")
    first_events = len(api.json("/pledges/FES48000002/events"))

    upload(api, status)
    assert api.json("/pledges") == first
    assert len(api.json("/pledges/FES48000002/events")) == first_events


def test_a_later_partial_file_still_adds_new_outcomes(api: ApiClient, tmp_path: Path) -> None:
    upload(api, build_apps_workbook(tmp_path / "apps.xlsx"))
    upload(api, build_status_subset(tmp_path / "day1.xlsx", ("FES48000002",)))

    assert api.json("/pledges/FES48000002")["currentStatusId"] == 66
    # The rest have no history yet.
    assert api.json("/pledges/FES48000001")["currentStatusId"] is None

    upload(api, build_status_workbook(tmp_path / "day2.xlsx"))
    assert api.json("/pledges/FES48000001")["currentStatusId"] == 66


def test_apps_tracker_re_upload_updates_rather_than_duplicates(
    api: ApiClient, tmp_path: Path
) -> None:
    apps = build_apps_workbook(tmp_path / "apps.xlsx")
    upload(api, apps)
    second = upload(api, apps)

    assert second.json()["impact"]["newPledges"] == 0
    assert len(api.json("/pledges")) == 6


# ---------------------------------------------------------------------------
# Exceptions — a bad row never fails the batch
# ---------------------------------------------------------------------------


def test_every_exception_path_is_exercised(loaded: ApiClient) -> None:
    problems = {e["problem"] for e in loaded.json("/exceptions")}
    assert "no_matching_pledge" in problems  # serial not in the master
    assert "unknown_status_id" in problems  # code 77 is not in the dictionary
    assert "name_mismatch" in problems  # right serial, wrong donor


def test_a_bad_row_does_not_stop_the_good_ones(loaded: ApiClient) -> None:
    # Three rows are rejected; the other seven still consolidated.
    assert len(loaded.json("/exceptions")) == 3
    assert loaded.json("/pledges/FES48000001")["currentStatusId"] == 66


def test_no_row_is_silently_dropped(api: ApiClient, tmp_path: Path) -> None:
    """Every input row ends as either an event or an exception."""
    upload(api, build_apps_workbook(tmp_path / "apps.xlsx"))
    response = upload(api, build_status_workbook(tmp_path / "status.xlsx"))
    body = response.json()

    total_events = sum(
        len(api.json(f"/pledges/{s}/events"))
        for s in [p["serialNo"] for p in api.json("/pledges")]
    )
    assert total_events + body["upload"]["exceptionCount"] == body["upload"]["rowCount"]


def test_an_unknown_status_code_becomes_an_exception_not_a_guess(loaded: ApiClient) -> None:
    unknown = next(
        e for e in loaded.json("/exceptions") if e["problem"] == "unknown_status_id"
    )
    assert "77" in unknown["detail"]
    # And it did not land in the pledge's history.
    assert 77 not in [e["statusId"] for e in loaded.json("/pledges/FES48000001/events")]


def test_adding_the_missing_status_code_lets_the_row_through(
    api: ApiClient, tmp_path: Path
) -> None:
    """The 30-second settings edit, end to end: teach the service code 77 and
    re-upload, and the row consolidates instead of failing."""
    upload(api, build_apps_workbook(tmp_path / "apps.xlsx"))
    upload(api, build_status_workbook(tmp_path / "status.xlsx"))
    assert 77 not in [e["statusId"] for e in api.json("/pledges/FES48000001/events")]

    api.put(
        "/settings/status-codes",
        json={"statusId": 77, "description": "Chargeback", "classification": "failed_final"},
    )
    upload(api, build_status_workbook(tmp_path / "status2.xlsx"))

    assert 77 in [e["statusId"] for e in api.json("/pledges/FES48000001/events")]


def test_an_exception_can_be_resolved(loaded: ApiClient) -> None:
    first = loaded.json("/exceptions")[0]
    response = loaded.post(f"/exceptions/{first['id']}/resolve")

    assert response.status_code == 200
    assert response.json()["resolved"] is True
    remaining = loaded.json("/exceptions", params={"resolved": False})
    assert first["id"] not in [e["id"] for e in remaining]


def test_resolving_an_unknown_exception_is_a_404(loaded: ApiClient) -> None:
    assert loaded.post("/exceptions/exc_999999/resolve").status_code == 404


# ---------------------------------------------------------------------------
# Upload hygiene
# ---------------------------------------------------------------------------


def test_a_non_workbook_is_refused(api: ApiClient) -> None:
    response = api.post(
        "/uploads",
        files={"file": ("payload.xlsx", b"not a zip", "application/octet-stream")},
    )
    assert response.status_code == 415


def test_a_wrong_extension_is_refused(api: ApiClient, tmp_path: Path) -> None:
    path = build_apps_workbook(tmp_path / "apps.xlsx")
    response = api.post(
        "/uploads", files={"file": ("apps.csv", path.read_bytes(), "text/csv")}
    )
    assert response.status_code == 415


def test_an_unrecognised_workbook_is_refused_without_leaking_contents(
    api: ApiClient, tmp_path: Path
) -> None:
    from openpyxl import Workbook

    wb = Workbook()
    wb.active.append(["Fruit", "Colour", "Secret"])
    wb.active.append(["Apple", "Red", "hunter2"])
    path = tmp_path / "nope.xlsx"
    wb.save(path)

    response = upload(api, path)
    assert response.status_code == 422
    assert "hunter2" not in response.text


def test_upload_impact_is_derived_from_the_events_it_carried(
    api: ApiClient, tmp_path: Path
) -> None:
    upload(api, build_apps_workbook(tmp_path / "apps.xlsx"))
    body = upload(api, build_status_workbook(tmp_path / "status.xlsx")).json()

    impact = api.json(f"/uploads/{body['upload']['id']}/impact")
    assert impact["newlyApproved"] == 3  # 0001, 0002 retry, 0005
    assert impact["newlyRetrying"] == 2  # 0002 first attempt, 0003
    assert impact["newlyFailedFinal"] == 1  # 0004
    assert impact["newlyCancelled"] == 1  # 0005
    assert impact["changedMaster"] is True


def test_uploads_are_listed_newest_first(loaded: ApiClient) -> None:
    uploads = loaded.json("/uploads")
    assert len(uploads) == 2
    assert uploads[0]["uploadedAt"] >= uploads[1]["uploadedAt"]


def test_impact_of_an_unknown_upload_is_a_404(api: ApiClient) -> None:
    assert api.get("/uploads/upl_999999/impact").status_code == 404
