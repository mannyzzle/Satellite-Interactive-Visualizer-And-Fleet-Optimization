from fastapi import APIRouter, HTTPException
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
    """
    Retrieve historical TLEs for a specific satellite (by NORAD ID).
    """
    conn = get_db_connection()
    cursor = conn.cursor()

    try:
        cursor.execute("""
            SELECT epoch, tle_line1, tle_line2
            FROM satellite_tle_history
            WHERE norad_number = %s
            ORDER BY epoch ASC;
        """, (norad_number,))

        tles = cursor.fetchall()

        # 🛠️ Debugging: Print raw query result
        print(f"🔍 Raw Query Result for NORAD {norad_number}: {tles}")

        if not tles:
            raise HTTPException(status_code=404, detail=f"No historical TLEs found for NORAD {norad_number}")

        # ✅ Properly extract values from `RealDictRow`
        formatted_tles = [{"epoch": str(row["epoch"]), "tle_line1": row["tle_line1"], "tle_line2": row["tle_line2"]} for row in tles]

    except Exception as e:
        print(f"❌ Database Query Error: {str(e)}")  # Debugging log
        raise HTTPException(status_code=500, detail=f"Database query failed: {str(e)}")

    finally:
        cursor.close()
        conn.close()

    return {
        "norad_number": norad_number,
        "historical_tles": formatted_tles
    }
