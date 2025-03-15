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

@router.get("/fetch/{norad_number}")
def fetch_old_tles(norad_number: int):
    """Fetch historical TLEs for a specific satellite (by NORAD ID)."""
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("""
        SELECT epoch, tle_line1, tle_line2
        FROM satellite_tle_history
        WHERE norad_number = %s
        ORDER BY epoch DESC;
    """, (norad_number,))

    tles = cursor.fetchall()
    
    cursor.close()
    conn.close()

    if not tles:
        return {"message": f"No historical TLEs found for NORAD {norad_number}."}

    return {
        "norad_number": norad_number,
        "historical_tles": [{"epoch": t[0], "tle_line1": t[1], "tle_line2": t[2]} for t in tles]
    }

