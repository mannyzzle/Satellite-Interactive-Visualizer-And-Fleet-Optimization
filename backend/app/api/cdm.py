from fastapi import APIRouter, Depends, BackgroundTasks
from app import get_db_connection

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

