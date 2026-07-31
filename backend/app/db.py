import psycopg

from app.config import Settings

CONNECT_TIMEOUT_SECONDS = 5


def count_public_tables(settings: Settings) -> int:
    """Ping the database and return how many tables the public schema holds.

    The schema is owned by Drizzle (frontend/db/schema.ts) — this service only
    reads/writes it, so seeing the pushed tables proves connectivity AND that
    the schema landed.
    """
    with psycopg.connect(
        settings.supabase_db_url, connect_timeout=CONNECT_TIMEOUT_SECONDS
    ) as conn, conn.cursor() as cur:
        cur.execute(
            "SELECT count(*) FROM information_schema.tables "
            "WHERE table_schema = 'public' AND table_type = 'BASE TABLE'"
        )
        row = cur.fetchone()
        return int(row[0]) if row else 0
