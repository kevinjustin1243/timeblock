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
                start_hour INTEGER NOT NULL,
                end_hour   INTEGER NOT NULL,
                title      TEXT NOT NULL,
                color      TEXT NOT NULL DEFAULT '#60a5fa',
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
        """)
        conn.commit()
