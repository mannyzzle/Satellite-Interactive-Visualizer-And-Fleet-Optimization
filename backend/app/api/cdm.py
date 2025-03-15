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

