"""Uvicorn entrypoint: `uvicorn app.asgi:app`. Reads settings from the environment."""

from app.main import create_app

app = create_app()
