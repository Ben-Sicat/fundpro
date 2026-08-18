"""Manual cancellations: a date, a reason, and surviving the next import."""

from __future__ import annotations

from pathlib import Path

from tests.conftest import ApiClient, upload


def _first_serial(api: ApiClient) -> str:
    return api.json("/pledges")[0]["serialNo"]


def test_a_cancellation_can_be_recorded_by_hand(loaded: ApiClient) -> None:
    serial = _first_serial(loaded)

    response = loaded.patch(
        f"/pledges/{serial}/cancellation",
        json={"cancellationDate": "2026-07-20", "reason": "Donor phoned the office"},
    )

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["cancellationDate"] == "2026-07-20"
    assert body["cancellationReason"] == "Donor phoned the office"
    assert body["cancellationSource"] == "manual"
    assert body["cancelled"] is True


def test_a_reason_is_required(loaded: ApiClient) -> None:
    serial = _first_serial(loaded)

    response = loaded.patch(
        f"/pledges/{serial}/cancellation",
        json={"cancellationDate": "2026-07-20", "reason": "   "},
    )

    # "Cancelled, no reason given" is not a record anybody can act on.
    assert response.status_code == 422


def test_it_cannot_predate_the_signup(loaded: ApiClient) -> None:
    pledge = next(p for p in loaded.json("/pledges") if p["signupDate"])

    response = loaded.patch(
        f"/pledges/{pledge['serialNo']}/cancellation",
        json={"cancellationDate": "2000-01-01", "reason": "Typo in the year"},
    )

    assert response.status_code == 422


def test_a_manual_cancellation_survives_the_next_import(
    loaded: ApiClient, tmp_path: Path
) -> None:
    """The regression this guards.

    Re-uploading a Status Report recomputes every pledge from its billing
    history. Without the `manual` marker that recompute would put the
    cancellation date back to whatever the bank last said — silently throwing
    away something a human typed.
    """
    from tests.fixtures.workbooks import build_status_workbook

    serial = _first_serial(loaded)
    loaded.patch(
        f"/pledges/{serial}/cancellation",
        json={"cancellationDate": "2026-07-20", "reason": "Donor moved abroad"},
    )

    assert upload(loaded, build_status_workbook(tmp_path / "again.xlsx")).status_code == 201

    after = loaded.json(f"/pledges/{serial}")
    assert after["cancellationDate"] == "2026-07-20"
    assert after["cancellationReason"] == "Donor moved abroad"


def test_a_manual_cancellation_can_be_cleared(loaded: ApiClient) -> None:
    serial = _first_serial(loaded)
    loaded.patch(
        f"/pledges/{serial}/cancellation",
        json={"cancellationDate": "2026-07-20", "reason": "Recorded in error"},
    )

    response = loaded.patch(
        f"/pledges/{serial}/cancellation", json={"cancellationDate": None}
    )

    assert response.status_code == 200
    assert response.json()["cancellationDate"] is None
    assert response.json()["cancellationReason"] is None


def test_setting_a_cancellation_is_audited(loaded: ApiClient) -> None:
    serial = _first_serial(loaded)
    loaded.patch(
        f"/pledges/{serial}/cancellation",
        json={"cancellationDate": "2026-07-20", "reason": "Donor asked to stop"},
    )

    actions = [entry["action"] for entry in loaded.json("/audit")]
    assert "pledge.cancellation.set" in actions

    # The reason can describe a donor's circumstances, so it never reaches the
    # log — PH Data Privacy Act, no PII in logs.
    details = " ".join(entry["detail"] for entry in loaded.json("/audit"))
    assert "Donor asked to stop" not in details
