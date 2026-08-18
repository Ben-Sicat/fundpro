from __future__ import annotations

from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app
from app.store.factory import get_store
from app.store.memory import FundraiserSeed, Store

TEST_API_KEY = "test-api-key"

#: The dataset's fixed "today". Every fixture date is relative to it, so
#: nothing in the suite drifts as the calendar moves.
TODAY = "2026-07-27"


@pytest.fixture
def settings() -> Settings:
    # DB URL points nowhere routable — tests never touch a real database.
    return Settings(
        supabase_db_url="postgresql://user:secret-password@db.invalid:5432/postgres",
        api_key=TEST_API_KEY,
        log_level="WARNING",
    )


@pytest.fixture
def store() -> Store:
    """A fresh store per test. Shared mutable state across tests is the
    fastest way to get a suite that passes only in one order."""
    fresh = Store()
    fresh.leaders = ["Adora Lumbre", "Mark Ramayrat", "Jhon Magno"]
    fresh.fundraisers = [
        FundraiserSeed(
            name="Almara Pasco",
            code="FR001",
            leader_names=["Adora Lumbre"],
            start_date="2024-03-04",
        ),
        FundraiserSeed(
            name="Grace Tolentino",
            code="FR002",
            leader_names=["Jhon Magno", "Mark Ramayrat"],
            start_date="2025-09-01",
        ),
    ]
    return fresh


@pytest.fixture
def app(settings: Settings, store: Store):
    application = create_app(settings)
    application.dependency_overrides[get_store] = lambda: store
    return application


@pytest.fixture
def client(app) -> Iterator[TestClient]:
    with TestClient(app, raise_server_exceptions=False) as test_client:
        yield test_client


@pytest.fixture
def auth_headers() -> dict[str, str]:
    return {"Authorization": f"Bearer {TEST_API_KEY}", "X-As-Of": TODAY}


class ApiClient:
    """Thin wrapper that carries auth and the fixed date on every call.

    Keeps the tests about behaviour instead of about headers.
    """

    def __init__(self, client: TestClient, headers: dict[str, str]) -> None:
        self._client = client
        self._headers = headers

    def _merge(self, extra: dict[str, str] | None) -> dict[str, str]:
        return {**self._headers, **(extra or {})}

    def get(self, url: str, *, params=None, headers=None):
        return self._client.get(url, params=params, headers=self._merge(headers))

    def post(self, url: str, *, json=None, params=None, files=None, headers=None):
        return self._client.post(
            url, json=json, params=params, files=files, headers=self._merge(headers)
        )

    def put(self, url: str, *, json=None, headers=None):
        return self._client.put(url, json=json, headers=self._merge(headers))

    def patch(self, url: str, *, json=None, headers=None):
        return self._client.patch(url, json=json, headers=self._merge(headers))

    def json(self, url: str, *, params=None, headers=None):
        response = self.get(url, params=params, headers=headers)
        assert response.status_code == 200, f"{url} → {response.status_code} {response.text[:300]}"
        return response.json()


@pytest.fixture
def api(client: TestClient, auth_headers: dict[str, str]) -> ApiClient:
    return ApiClient(client, auth_headers)


# ---------------------------------------------------------------------------
# Workbook fixtures
# ---------------------------------------------------------------------------

XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


def upload(api: ApiClient, path: Path, *, name: str | None = None):
    return api.post(
        "/uploads",
        files={"file": (name or path.name, path.read_bytes(), XLSX_TYPE)},
    )


@pytest.fixture
def loaded(api: ApiClient, tmp_path: Path) -> ApiClient:
    """An API with both trackers already consolidated.

    Apps Tracker first, then the bank file — the real order, and the one that
    exercises matching rather than the no-matching-pledge path.
    """
    from tests.fixtures.workbooks import build_apps_workbook, build_status_workbook

    assert upload(api, build_apps_workbook(tmp_path / "apps.xlsx")).status_code == 201
    assert upload(api, build_status_workbook(tmp_path / "status.xlsx")).status_code == 201
    return api
