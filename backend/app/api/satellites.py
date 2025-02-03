# /backend/api/satellites.py

from fastapi import APIRouter, HTTPException, Query
from app.database import get_db_connection

router = APIRouter()

@router.get("/")
def get_all_satellites(
    page: int = Query(1, ge=1),
    limit: int = Query(20, le=100)
):
    offset = (page - 1) * limit
    conn = get_db_connection()
    cursor = conn.cursor()

    try:
        print("🔍 Fetching total satellite count...")
        cursor.execute("SELECT COUNT(*) AS count FROM satellites")
        result = cursor.fetchone()

        if not result or "count" not in result:
            raise HTTPException(status_code=500, detail="Failed to fetch satellite count")

        total_count = result["count"]

        print(f"✅ Total satellites found: {total_count}")
        print(f"🔍 Fetching satellites with limit={limit} and offset={offset}...")

        # ✅ Add latitude & longitude
        cursor.execute("""
            SELECT id, name, norad_number, orbit_type, inclination, velocity, latitude, longitude
            FROM satellites 
            ORDER BY id
            LIMIT %s OFFSET %s
        """, (limit, offset))

        satellites = cursor.fetchall()
        print(f"✅ Retrieved {len(satellites)} satellites")

        return {
            "total": total_count,
            "page": page,
            "limit": limit,
            "satellites": [
                {
                    "id": sat["id"],
                    "name": sat["name"],
                    "norad_number": sat["norad_number"],
                    "orbit_type": sat["orbit_type"],
                    "inclination": sat["inclination"],
                    "velocity": sat["velocity"],
                    "latitude": sat["latitude"],  # ✅ Now included
                    "longitude": sat["longitude"],  # ✅ Now included
                }
                for sat in satellites
            ]
        }

    except Exception as e:
        print(f"❌ Database Query Failed: {e}")
        raise HTTPException(status_code=500, detail=f"Database query failed: {str(e)}")

    finally:
        cursor.close()
        conn.close()



@router.get("/{satellite_name}")
def get_satellite_by_name(satellite_name: str):
    """
    Retrieve a specific satellite by its name.
    """
    conn = get_db_connection()
    cursor = conn.cursor()

    # Fetch satellite by name
    cursor.execute("SELECT * FROM satellites WHERE name = %s", (satellite_name,))
    satellite = cursor.fetchone()

    cursor.close()
    conn.close()

    if not satellite:
        raise HTTPException(status_code=404, detail="Satellite not found")

    return {
        "id": satellite["id"],
        "name": satellite["name"],
        "norad_number": satellite["norad_number"],
        "orbit_type": satellite["orbit_type"],
        "inclination": satellite["inclination"],
        "velocity": satellite["velocity"],
        "latitude": satellite["latitude"],  # ✅ Now included
        "longitude": satellite["longitude"]
    }
