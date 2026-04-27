from fastapi import APIRouter, Depends, BackgroundTasks

import sys
import os

# Ensure backend root directory is in sys.path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

try:
    from database import get_db_connection  # Absolute import for Docker
except ImportError:
    from app.database import get_db_connection  # Relative import for local execution




router = APIRouter()

@router.get("/fetch")
def fetch_cdm_events():
    """Fetch all current CDM events."""
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("SELECT * FROM cdm_events ORDER BY tca ASC;")
    cdm_events = cursor.fetchall()

    cursor.close()
    conn.close()

    return {"cdm_events": cdm_events}


@router.get("/{cdm_id}")
def fetch_cdm_event(cdm_id: str):
    """Fetch a single CDM event by id."""
    from fastapi import HTTPException
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT * FROM cdm_events WHERE cdm_id = %s LIMIT 1", (cdm_id,))
        row = cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="CDM event not found")
        return {"cdm_event": row}
    finally:
        cursor.close()
        conn.close()

