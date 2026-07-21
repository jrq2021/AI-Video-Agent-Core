from auth import _get_db


def init_auth_rate_limit_db() -> None:
    with _get_db() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS auth_rate_limit_events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                action TEXT NOT NULL,
                scope TEXT NOT NULL,
                created_at INTEGER NOT NULL
            )
            """
        )
        conn.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_auth_rate_limit_lookup
            ON auth_rate_limit_events (action, scope, created_at)
            """
        )


def is_rate_limited(
    action: str,
    scope: str,
    limit: int,
    window_seconds: int,
    now: int,
) -> bool:
    cutoff = now - window_seconds
    with _get_db() as conn:
        conn.execute("DELETE FROM auth_rate_limit_events WHERE created_at < ?", (cutoff,))
        count = conn.execute(
            """
            SELECT COUNT(*) FROM auth_rate_limit_events
            WHERE action=? AND scope=? AND created_at>=?
            """,
            (action, scope, cutoff),
        ).fetchone()[0]
    return count >= limit


def record_rate_limit_event(action: str, scope: str, now: int) -> None:
    with _get_db() as conn:
        conn.execute(
            "INSERT INTO auth_rate_limit_events (action, scope, created_at) VALUES (?,?,?)",
            (action, scope, now),
        )
