# /backend/api/satellites.py

from fastapi import APIRouter, HTTPException, Query
from app.database import get_db_connection
import math

router = APIRouter()


def sanitize_value(value):
    """Replace NaN and Infinity with None for JSON serialization"""
    if isinstance(value, float) and (math.isnan(value) or math.isinf(value)):
        return None
    return value


@router.get("/")
def get_all_satellites(
    page: int = Query(1, ge=1),
    limit: int = Query(100, ge=1, le=11000),
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

        query = """
            SELECT id, name, norad_number, orbit_type, inclination, velocity, 
                   latitude, longitude, bstar, rev_num, ephemeris_type, 
                   eccentricity, period, perigee, apogee, epoch, raan, 
                   arg_perigee, mean_motion, semi_major_axis, tle_line1, 
                   tle_line2, intl_designator, object_type, 
                   launch_date, launch_site, decay_date, rcs, purpose, country
            FROM satellites
        """

        if filter:
            query += f" WHERE {get_filter_condition(filter)}"

        query += " ORDER BY id LIMIT %s OFFSET %s"
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
                    "country": sat["country"]
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






def get_filter_condition(filter):
    filter_conditions = {
        # 🌍 Orbital Regions
        "LEO": "orbit_type = 'LEO'",
        "MEO": "orbit_type = 'MEO'",
        "GEO": "orbit_type = 'GEO'",
        "HEO": "orbit_type = 'HEO'",  # ✅ Highly Elliptical Orbit
        "Suborbital": "orbit_type = 'SUBORBITAL'",  # 🚀 Suborbital objects

        # 🚀 Velocity Filters
        "High Velocity": "velocity > 7.8",
        "Low Velocity": "velocity <= 7.8",

        # 🔍 Orbital Parameters
        "Perigee < 500 km": "perigee < 500",
        "Perigee > 500 km": "perigee > 500",
        "Apogee > 35,000 km": "apogee > 35000",
        "Eccentricity > 0.1": "eccentricity > 0.1",
        "Mean Motion > 15": "mean_motion > 15",  # Fast-moving objects

        # 🌎 Drag & Atmospheric Effects
        "B* Drag Term > 0.0001": "bstar > 0.0001",
        "B* Drag Term < 0.0001": "bstar < 0.0001",

        # 🛰️ Purpose Filters
        "Communications": "purpose = 'Communications'",
        "Navigation": "purpose = 'Navigation'",
        "Military": "purpose = 'Military/Reconnaissance'",
        "Weather": "purpose = 'Weather Monitoring'",
        "Earth Observation": "purpose = 'Earth Observation'",
        "Science": "purpose = 'Scientific Research'",
        "Human Spaceflight": "purpose = 'Human Spaceflight'",
        "Technology Demo": "purpose = 'Technology Demonstration'",
        "Unknown": "purpose = 'Unknown'",


        # 🚀 Launch & Decay Status
        "Recent Launches": "launch_date > NOW() - INTERVAL '30 days'",


        # 🛰️ Radar Cross-Section (RCS)
        "Small Satellites": "rcs < 0.1",
        "Medium Satellites": "rcs BETWEEN 0.1 AND 1.0",
        "Large Satellites": "rcs > 1.0",
    }

    conditions = []

    if filter:
        filters = filter.split(",")  # Assume filters are passed as CSV string

        for f in filters:
            if f in filter_conditions:
                conditions.append(filter_conditions[f])

            # 🎯 Dynamic Filters (Launch Year, Country, Inclination)
            elif f.startswith("Launch Year:"):
                year = f.split(":")[1]
                if year.isdigit():
                    conditions.append(f"EXTRACT(YEAR FROM launch_date) = {year}")

            elif f.startswith("Country:"):
                country = f.split(":")[1]
                conditions.append(f"country = '{country}'")

            elif f.startswith("Inclination <"):
                angle = f.split("<")[1].strip()
                if angle.replace(".", "", 1).isdigit():  # Allow decimals
                    conditions.append(f"inclination < {angle}")

            elif f.startswith("Inclination >"):
                angle = f.split(">")[1].strip()
                if angle.replace(".", "", 1).isdigit():
                    conditions.append(f"inclination > {angle}")

    return " AND ".join(conditions) if conditions else "1=1"  # Default: No filter applied











@router.get("/{satellite_name}")
def get_satellite_by_name(satellite_name: str):
    """
    Retrieve a specific satellite by its name.
    """
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("""
        SELECT id, name, norad_number, orbit_type, inclination, velocity, 
               latitude, longitude, bstar, rev_num, ephemeris_type, 
               eccentricity, period, perigee, apogee, epoch, raan, 
               arg_perigee, mean_motion, semi_major_axis, tle_line1, 
               tle_line2, intl_designator, object_type, 
               launch_date, launch_site, decay_date, rcs, purpose, country
        FROM satellites WHERE name = %s
    """, (satellite_name,))
    
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
        "country": satellite["country"]
    }
