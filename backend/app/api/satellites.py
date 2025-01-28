from fastapi import APIRouter, HTTPException
from app.database import get_db_connection

router = APIRouter()

@router.get("/")
def get_all_satellites():
    """
    Retrieve all satellites from the database.
    """
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM satellites")
    satellites = cursor.fetchall()
    cursor.close()
    conn.close()
    return {"satellites": satellites}

@router.get("/{norad_number}")
def get_satellite_by_norad(norad_number: int):
    """
    Retrieve a specific satellite by NORAD number.
    """
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM satellites WHERE norad_number = %s", (norad_number,))
    satellite = cursor.fetchone()
    cursor.close()
    conn.close()

    if not satellite:
        raise HTTPException(status_code=404, detail="Satellite not found")
    return {"satellite": satellite}
