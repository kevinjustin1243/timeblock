import sqlite3
from pathlib import Path

_DB_PATH = Path.home() / ".config" / "timeblock" / "timeblock.db"


def get_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(_DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    _DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    with get_conn() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS events (
                id         TEXT PRIMARY KEY,
                user       TEXT NOT NULL,
                date       TEXT NOT NULL,
                start_min  INTEGER NOT NULL,
                end_min    INTEGER NOT NULL,
                title      TEXT NOT NULL,
                color      TEXT NOT NULL DEFAULT '#60a5fa',
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
        """)
        # Migrate from hour-based schema if needed
        cols = {row[1] for row in conn.execute("PRAGMA table_info(events)").fetchall()}
        if "start_hour" in cols and "start_min" not in cols:
            conn.execute("""
                CREATE TABLE events_new (
                    id         TEXT PRIMARY KEY,
                    user       TEXT NOT NULL,
                    date       TEXT NOT NULL,
                    start_min  INTEGER NOT NULL,
                    end_min    INTEGER NOT NULL,
                    title      TEXT NOT NULL,
                    color      TEXT NOT NULL DEFAULT '#60a5fa',
                    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
                )
            """)
            conn.execute("""
                INSERT INTO events_new (id, user, date, start_min, end_min, title, color, created_at)
                SELECT id, user, date, start_hour * 60, end_hour * 60, title, color, created_at
                FROM events
            """)
            conn.execute("DROP TABLE events")
            conn.execute("ALTER TABLE events_new RENAME TO events")
        conn.commit()
