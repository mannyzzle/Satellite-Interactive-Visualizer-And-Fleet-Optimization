#api/satellites.py
import logging
import psycopg2
from fastapi import APIRouter, HTTPException, Query
import math
from psycopg2.extras import DictCursor
from typing import List
import sys
import os
import logging
# Ensure backend root directory is in sys.path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

try:
    from database import get_db_connection  # Absolute import for Docker
except ImportError:
    from app.database import get_db_connection  # Relative import for local execution






router = APIRouter()

def sanitize_value(value):
    """Replace NaN and Infinity with None for JSON serialization"""
    if isinstance(value, float) and (math.isnan(value) or math.isinf(value)):
        return None
    return value


@router.get("/")
def get_all_satellites(
    page: int = Query(1, ge=1),
    limit: int = Query(500, ge=1, le=32000),
    filter: str = Query(None)
):
    offset = (page - 1) * limit
    conn = get_db_connection()
    cursor = conn.cursor()

    try:
        print("🔍 Fetching total satellite count...")

        if filter:
            cursor.execute(f"SELECT COUNT(*) AS count FROM satellites WHERE {get_filter_condition(filter)}")
        else:
            cursor.execute("SELECT COUNT(*) AS count FROM satellites")

        result = cursor.fetchone()
        if not result or "count" not in result:
            raise HTTPException(status_code=500, detail="Failed to fetch satellite count")

        total_count = result["count"]
        print(f"✅ Total satellites found: {total_count}")

        # ✅ Base Query
        query = """
            SELECT id, name, norad_number, orbit_type, inclination, velocity, 
                   latitude, longitude, bstar, rev_num, ephemeris_type, 
                   eccentricity, period, perigee, apogee, epoch, raan, 
                   arg_perigee, mean_motion, semi_major_axis, tle_line1, 
                   tle_line2, intl_designator, object_type, 
                   launch_date, launch_site, decay_date, rcs, purpose, country, active_status
            FROM satellites
        """

        # ✅ Apply filter if provided
        if filter:
            query += f" WHERE {get_filter_condition(filter)}"

        # ✅ Sorting Logic: Most recent launch first, NULLs last
        query += " ORDER BY launch_date DESC NULLS LAST"

        query += " LIMIT %s OFFSET %s"
        cursor.execute(query, (limit, offset))
        satellites = cursor.fetchall()

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
                    "inclination": sanitize_value(sat["inclination"]),
                    "velocity": sanitize_value(sat["velocity"]),
                    "latitude": sanitize_value(sat["latitude"]),
                    "longitude": sanitize_value(sat["longitude"]),
                    "bstar": sanitize_value(sat["bstar"]),
                    "rev_num": sat["rev_num"],
                    "ephemeris_type": sat["ephemeris_type"],
                    "eccentricity": sanitize_value(sat["eccentricity"]),
                    "period": sanitize_value(sat["period"]),
                    "perigee": sanitize_value(sat["perigee"]),
                    "apogee": sanitize_value(sat["apogee"]),
                    "epoch": sat["epoch"],
                    "raan": sanitize_value(sat["raan"]),
                    "arg_perigee": sanitize_value(sat["arg_perigee"]),
                    "mean_motion": sanitize_value(sat["mean_motion"]),
                    "semi_major_axis": sanitize_value(sat["semi_major_axis"]),
                    "tle_line1": sat["tle_line1"],
                    "tle_line2": sat["tle_line2"],
                    "intl_designator": sanitize_value(sat["intl_designator"]),
                    "object_type": sat["object_type"],
                    "launch_date": sat["launch_date"],
                    "launch_site": sat["launch_site"],
                    "decay_date": sat["decay_date"],
                    "rcs": sanitize_value(sat["rcs"]),
                    "purpose": sat["purpose"],
                    "country": sat["country"],
                    "active_status": sat["active_status"]
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


@router.get("/count")
async def get_satellite_count():
    """
    Fetches the total satellite count from the database.
    """
    try:
        conn = get_db_connection()
        with conn.cursor() as cursor:
            cursor.execute("SELECT COUNT(*) FROM satellites;")
            result = cursor.fetchone()

            if not result:
                raise HTTPException(status_code=500, detail="Database returned no result for count")

            total_count = result['count']  # ✅ Correctly extract count

            return {"total": total_count}

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")

    finally:
        conn.close()



@router.get("/object_types")
async def get_object_types():
    """
    Retrieve the count of satellites grouped by object_type.
    """
    conn = get_db_connection()
    cursor = conn.cursor()

    try:
        print("📡 Fetching object type distribution...", flush=True)

        # ✅ Run SQL Query
        cursor.execute("SELECT object_type, COUNT(*) AS count FROM satellites GROUP BY object_type;")

        # ✅ Fetch Data as a list of dictionaries
        rows = cursor.fetchall()

        # ✅ Debugging: Print what the database returned
        print("🔍 Raw Query Result:", rows, flush=True)

        # ✅ Ensure data exists
        if not rows:
            print("⚠️ No data found for object types.", flush=True)
            raise HTTPException(status_code=404, detail="No satellite object types found.")

        # ✅ Correct way to map results when using RealDictRow
        object_types = [{"object_type": row["object_type"], "count": row["count"]} for row in rows]

        print(f"✅ Successfully fetched {len(object_types)} object types: {object_types}", flush=True)
        return {"types": object_types}

    except psycopg2.Error as e:
        print(f"❌ Database Query Failed: {e}", flush=True)
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")

    finally:
        cursor.close()
        conn.close()



def get_filter_condition(filter):
    """Generate SQL filter conditions based on the selected filter."""
    filter_conditions = {
        # 🌍 Orbital Regions
        "LEO": "orbit_type = 'LEO'",
        "MEO": "orbit_type = 'MEO'",
        "GEO": "orbit_type = 'GEO'",
        "HEO": "orbit_type = 'HEO'",

        # 🚀 Velocity Filters
        "High Velocity": "velocity > 7.8",
        "Low Velocity": "velocity <= 7.8",

        # 🔍 Orbital Parameters
        "Perigee < 500 km": "perigee < 500",
        "Apogee > 35,000 km": "apogee > 35000",
        "Eccentricity > 0.1": "eccentricity > 0.1",
        "B* Drag Term > 0.0001": "bstar > 0.0001",

        # 🛰️ Purpose Filters
        "Communications": "purpose = 'Communications'",
        "Navigation": "purpose = 'Navigation'",
        "Military/Reconnaissance": "purpose = 'Military/Reconnaissance'",
        "Weather Monitoring": "purpose = 'Weather Monitoring'",
        "Earth Observation": "purpose = 'Earth Observation'",
        "Scientific Research": "purpose = 'Scientific Research'",
        "Technology Demonstration": "purpose = 'Technology Demonstration'",
        "Satellite Servicing & Logistics": "purpose = 'Satellite Servicing & Logistics'",
        "Deep Space Exploration": "purpose = 'Deep Space Exploration'",
        "Human Spaceflight": "purpose = 'Human Spaceflight'",
        "Space Infrastructure": "purpose = 'Space Infrastructure'",
        "Space Debris": "purpose = 'Space Debris'",
        "Rocket Body (Debris)": "purpose = 'Rocket Body (Debris)'",
        "Starlink Constellation": "purpose = 'Starlink Constellation'",
        "OneWeb Constellation": "purpose = 'OneWeb Constellation'",
        "Iridium NEXT Constellation": "purpose = 'Iridium NEXT Constellation'",
        "Unknown": "purpose = 'Unknown'",

        # 🚀 Launch & Decay Filters
        "Recent Launches": "launch_date > NOW() - INTERVAL '30 days'",
        "Decaying": "decay_date IS NOT NULL OR active_status = 'Inactive' ",
        "Active Satellites": "decay_date IS NULL AND object_type  = 'PAYLOAD' "
    }


    conditions = []
    launch_years = []  # Store multiple launch years
    countries = []  # Store multiple country selections

    if filter:
        filters = filter.split(",")  # Assume filters are passed as CSV string

        for f in filters:
            if f in filter_conditions:
                conditions.append(filter_conditions[f])

            # 🎯 Dynamic Filters (Launch Year, Country)
            elif f.startswith("Launch Year:"):
                year = f.split(":")[1]
                if year.isdigit():
                    launch_years.append(year)

            elif f.startswith("Country:"):
                country = f.split(":")[1]
                countries.append(f"'{country}'")

    # ✅ Handle multiple Launch Year filters with `IN (...)`
    if launch_years:
        conditions.append(f"EXTRACT(YEAR FROM launch_date) IN ({', '.join(launch_years)})")

    # ✅ Handle multiple Country filters
    if countries:
        conditions.append(f"country IN ({', '.join(countries)})")

    return " AND ".join(conditions) if conditions else "1=1"  # Default: No filter applied



















# Configure logging
logging.basicConfig(level=logging.DEBUG)


@router.get("/suggest")
def suggest_satellites(query: str = Query("", min_length=1)):
    logging.debug("Received query: %s", query)
    conn = get_db_connection()
    cursor = conn.cursor(cursor_factory=DictCursor)
    
    sql = """
        SELECT norad_number, name
        FROM satellites
        WHERE name ILIKE %s OR CAST(norad_number AS TEXT) LIKE %s
        ORDER BY name ASC
        LIMIT 10
    """
    params = (f"%{query}%", f"%{query}%")
    logging.debug("Executing SQL: %s", sql)
    logging.debug("With parameters: %s", params)
    
    try:
        cursor.execute(sql, params)
        rows = cursor.fetchall()
        logging.debug("Raw DB results: %s", rows)
    except Exception as e:
        logging.error("Exception during SQL execution: %s", str(e))
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cursor.close()
        conn.close()
        logging.debug("Database connection closed.")
    
    suggestions = [{"norad_number": row["norad_number"], "name": row["name"]} for row in rows]
    logging.debug("Returning suggestions: %s", suggestions)
    return {"suggestions": suggestions}








@router.get("/{query}")
def get_satellite(query: str):
    """
    Retrieve a specific satellite by its name or NORAD number.
    
    - If the query is numeric, it is interpreted as a NORAD number.
    - Otherwise, it is treated as a satellite name (case-insensitive).
    """
    conn = get_db_connection()
    cursor = conn.cursor(cursor_factory=DictCursor)

    if query.isdigit():
        # Lookup by NORAD number
        try:
            norad_number_int = int(query)
        except ValueError:
            cursor.close()
            conn.close()
            raise HTTPException(status_code=400, detail=f"Invalid NORAD number: {query}")
        
        cursor.execute("""
            SELECT id, name, norad_number, orbit_type, inclination, velocity, 
                   latitude, longitude, bstar, rev_num, ephemeris_type, 
                   eccentricity, period, perigee, apogee, epoch, raan, 
                   arg_perigee, mean_motion, semi_major_axis, tle_line1, 
                   tle_line2, intl_designator, object_type, 
                   launch_date, launch_site, decay_date, rcs, purpose, country, active_status
            FROM satellites WHERE norad_number = %s
        """, (norad_number_int,))
        satellite = cursor.fetchone()
        if not satellite:
            cursor.close()
            conn.close()
            raise HTTPException(status_code=404, detail=f"Satellite with NORAD number '{query}' not found")
    else:
        # Lookup by satellite name (case-insensitive)
        formatted_name = query.replace("%20", " ").strip().lower()
        cursor.execute("""
            SELECT id, name, norad_number, orbit_type, inclination, velocity, 
                   latitude, longitude, bstar, rev_num, ephemeris_type, 
                   eccentricity, period, perigee, apogee, epoch, raan, 
                   arg_perigee, mean_motion, semi_major_axis, tle_line1, 
                   tle_line2, intl_designator, object_type, 
                   launch_date, launch_site, decay_date, rcs, purpose, country, active_status
            FROM satellites WHERE LOWER(name) = %s
        """, (formatted_name,))
        satellite = cursor.fetchone()
        if not satellite:
            cursor.close()
            conn.close()
            raise HTTPException(status_code=404, detail=f"Satellite '{query}' not found")

    cursor.close()
    conn.close()

    return {
        "id": satellite["id"],
        "name": satellite["name"],
        "norad_number": satellite["norad_number"],
        "orbit_type": satellite["orbit_type"],
        "inclination": satellite["inclination"],
        "velocity": satellite["velocity"],
        "latitude": satellite["latitude"],
        "longitude": satellite["longitude"],
        "bstar": satellite["bstar"],
        "rev_num": satellite["rev_num"],
        "ephemeris_type": satellite["ephemeris_type"],
        "eccentricity": satellite["eccentricity"],
        "period": satellite["period"],
        "perigee": satellite["perigee"],
        "apogee": satellite["apogee"],
        "epoch": satellite["epoch"],
        "raan": satellite["raan"],
        "arg_perigee": satellite["arg_perigee"],
        "mean_motion": satellite["mean_motion"],
        "semi_major_axis": satellite["semi_major_axis"],
        "tle_line1": satellite["tle_line1"],
        "tle_line2": satellite["tle_line2"],
        "intl_designator": satellite["intl_designator"],
        "object_type": satellite["object_type"],
        "launch_date": satellite["launch_date"],
        "launch_site": satellite["launch_site"],
        "decay_date": satellite["decay_date"],
        "rcs": satellite["rcs"],
        "purpose": satellite["purpose"],
        "country": satellite["country"],
        "active_status": satellite["active_status"]
    }






@router.get("/nearby/{norad_number}")
def get_nearby_satellites(
    norad_number: int,
    limit: int = Query(10, ge=1, le=100)
):
    """
    Retrieve satellites with orbital parameters similar to the given NORAD number.
    The similarity is determined by comparing perigee, apogee, and inclination.
    """
    conn = get_db_connection()
    cursor = conn.cursor(cursor_factory=DictCursor)
    try:
        # First, fetch the selected satellite's orbital parameters
        cursor.execute("""
            SELECT perigee, apogee, inclination
            FROM satellites
            WHERE norad_number = %s
        """, (norad_number,))
        main_sat = cursor.fetchone()
        if not main_sat:
            raise HTTPException(status_code=404, detail="Satellite not found")

        # Define thresholds for similarity (adjust these as needed)
        perigee_threshold = 100    # km difference
        apogee_threshold = 100     # km difference
        inclination_threshold = 5  # degrees difference

        query = """
            SELECT id, name, norad_number, orbit_type, inclination, velocity,
                   latitude, longitude, bstar, rev_num, ephemeris_type, eccentricity,
                   period, perigee, apogee, epoch, raan, arg_perigee, mean_motion,
                   semi_major_axis, tle_line1, tle_line2, intl_designator, object_type,
                   launch_date, launch_site, decay_date, rcs, purpose, country, active_status
            FROM satellites
            WHERE
                ABS(perigee - %s) < %s AND
                ABS(apogee - %s) < %s AND
                ABS(inclination - %s) < %s AND
                norad_number <> %s
            ORDER BY ABS(perigee - %s) + ABS(apogee - %s) + ABS(inclination - %s)
            LIMIT %s
        """
        params = (
            main_sat["perigee"], perigee_threshold,
            main_sat["apogee"], apogee_threshold,
            main_sat["inclination"], inclination_threshold,
            norad_number,
            main_sat["perigee"], main_sat["apogee"], main_sat["inclination"],
            limit
        )
        cursor.execute(query, params)
        nearby = cursor.fetchall()

        formatted = [
            {
                "id": sat["id"],
                "name": sat["name"],
                "norad_number": sat["norad_number"],
                "orbit_type": sat["orbit_type"],
                "inclination": sanitize_value(sat["inclination"]),
                "velocity": sanitize_value(sat["velocity"]),
                "latitude": sanitize_value(sat["latitude"]),
                "longitude": sanitize_value(sat["longitude"]),
                "bstar": sanitize_value(sat["bstar"]),
                "rev_num": sat["rev_num"],
                "ephemeris_type": sat["ephemeris_type"],
                "eccentricity": sanitize_value(sat["eccentricity"]),
                "period": sanitize_value(sat["period"]),
                "perigee": sanitize_value(sat["perigee"]),
                "apogee": sanitize_value(sat["apogee"]),
                "epoch": sat["epoch"],
                "raan": sanitize_value(sat["raan"]),
                "arg_perigee": sanitize_value(sat["arg_perigee"]),
                "mean_motion": sanitize_value(sat["mean_motion"]),
                "semi_major_axis": sanitize_value(sat["semi_major_axis"]),
                "tle_line1": sat["tle_line1"],
                "tle_line2": sat["tle_line2"],
                "intl_designator": sanitize_value(sat["intl_designator"]),
                "object_type": sat["object_type"],
                "launch_date": sat["launch_date"],
                "launch_site": sat["launch_site"],
                "decay_date": sat["decay_date"],
                "rcs": sanitize_value(sat["rcs"]),
                "purpose": sat["purpose"],
                "country": sat["country"],
                "active_status": sat["active_status"]
            }
            for sat in nearby
        ]
        return {"nearby_satellites": formatted}

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database query failed: {str(e)}")
    finally:
        cursor.close()
        conn.close()

