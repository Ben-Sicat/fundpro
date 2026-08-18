# FastAPI service: Excel parsing and consolidation.
#
# Not on Vercel: this is a long-running app that streams multi-megabyte
# workbooks through openpyxl. Serverless functions have the wrong memory and
# timeout shape for that, and the in-process store needs a process that lives
# between requests.

FROM python:3.12-slim AS base

# uv, matching the project's dependency management.
COPY --from=ghcr.io/astral-sh/uv:0.5.11 /uv /usr/local/bin/uv

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy

WORKDIR /app

# Dependencies first, so a source edit does not re-resolve the lockfile.
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-install-project --no-dev

COPY app ./app
RUN uv sync --frozen --no-dev

# Non-root: the service parses untrusted spreadsheets.
RUN useradd --create-home --uid 10001 fundpro && chown -R fundpro:fundpro /app
USER fundpro

ENV PATH="/app/.venv/bin:$PATH"

# Platforms inject $PORT. 8000 is the local default.
ENV PORT=8000
EXPOSE 8000

# Worker count defaults to 1 and is raised via WEB_CONCURRENCY.
#
# It is safe to raise ONLY when SUPABASE_DB_URL is set. Without it the service
# falls back to the in-process store, where a second worker serves a different
# copy of the data and uploads appear to vanish at random. With Postgres the
# state is shared — including settings, which live in `app_settings` precisely
# so two workers cannot disagree about status-code classifications.
CMD ["sh", "-c", "exec uvicorn app.asgi:app --host 0.0.0.0 --port ${PORT:-8000} --workers ${WEB_CONCURRENCY:-1}"]
