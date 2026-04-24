import uuid
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from modules.auth import require_user
from modules.db import get_conn

router = APIRouter(prefix="/api/events", tags=["events"])


class EventIn(BaseModel):
    date: str
    start_hour: int
    end_hour: int
    title: str
    color: str


def _row_to_dict(row) -> dict:
    return {
        "id": row["id"],
        "date": row["date"],
        "startHour": row["start_hour"],
        "endHour": row["end_hour"],
        "title": row["title"],
        "color": row["color"],
    }


@router.get("")
def list_events(username: str = Depends(require_user)):
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT id, date, start_hour, end_hour, title, color FROM events"
            " WHERE user = ? ORDER BY date, start_hour",
            (username,),
        ).fetchall()
    return [_row_to_dict(r) for r in rows]


@router.post("", status_code=201)
def create_event(body: EventIn, username: str = Depends(require_user)):
    event_id = str(uuid.uuid4())
    with get_conn() as conn:
        conn.execute(
            "INSERT INTO events (id, user, date, start_hour, end_hour, title, color)"
            " VALUES (?, ?, ?, ?, ?, ?, ?)",
            (event_id, username, body.date, body.start_hour, body.end_hour, body.title, body.color),
        )
        conn.commit()
    return {
        "id": event_id,
        "date": body.date,
        "startHour": body.start_hour,
        "endHour": body.end_hour,
        "title": body.title,
        "color": body.color,
    }


@router.put("/{event_id}")
def update_event(event_id: str, body: EventIn, username: str = Depends(require_user)):
    with get_conn() as conn:
        row = conn.execute(
            "SELECT id FROM events WHERE id = ? AND user = ?", (event_id, username)
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Event not found")
        conn.execute(
            "UPDATE events SET date = ?, start_hour = ?, end_hour = ?, title = ?, color = ? WHERE id = ?",
            (body.date, body.start_hour, body.end_hour, body.title, body.color, event_id),
        )
        conn.commit()
    return {"ok": True}


@router.delete("/{event_id}", status_code=204)
def delete_event(event_id: str, username: str = Depends(require_user)):
    with get_conn() as conn:
        row = conn.execute(
            "SELECT id FROM events WHERE id = ? AND user = ?", (event_id, username)
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Event not found")
        conn.execute("DELETE FROM events WHERE id = ?", (event_id,))
        conn.commit()
