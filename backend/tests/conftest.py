import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app

TEST_API_KEY = "test-api-key"


@pytest.fixture
def settings() -> Settings:
    # DB URL points nowhere routable — tests never touch a real database.
    return Settings(
        supabase_db_url="postgresql://user:secret-password@db.invalid:5432/postgres",
        api_key=TEST_API_KEY,
        log_level="WARNING",
    )


@pytest.fixture
def client(settings: Settings) -> TestClient:
    return TestClient(create_app(settings), raise_server_exceptions=False)


@pytest.fixture
def auth_headers() -> dict[str, str]:
    return {"Authorization": f"Bearer {TEST_API_KEY}"}
