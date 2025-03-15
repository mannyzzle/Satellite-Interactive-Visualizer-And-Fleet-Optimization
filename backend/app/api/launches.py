from fastapi import APIRouter, Depends
import psycopg2
from psycopg2.extras import RealDictCursor

import sys
import os

# Ensure backend root directory is in sys.path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

try:
    from database import get_db_connection  # Absolute import for Docker
except ImportError:
    from app.database import get_db_connection  # Relative import for local execution


router = APIRouter()

def fetch_launches(query: str):
    """Fetch launches from the database."""
    conn = get_db_connection()
    cursor = conn.cursor(cursor_factory=RealDictCursor)  # ✅ Ensures dictionary output

    cursor.execute(query)
    results = cursor.fetchall()

    cursor.close()
    conn.close()
    
    return results  # ✅ Return proper JSON format

@router.get("/upcoming")
def get_upcoming_launches():
    """Retrieve upcoming launches from the database."""
    query = """
    SELECT 
        id, name, mission_description, image_url, launch_date, launch_status, 
        rocket_name, pad_name, map_url, payload_name, payload_orbit, mission_type, 
        orbit_abbrev, mission_agency, vehicle_type, crew_count, reused_rocket, 
        fairing_recovered, payload_mass_kg, payload_customer, launch_cost_million, 
        video_url, launch_success, failure_reason, weather_conditions, booster_count, 
        recovery_ship, landing_type, landing_success, last_updated
    FROM launches
    WHERE launch_date >= NOW()
    ORDER BY launch_date ASC;
    """
    return fetch_launches(query)

@router.get("/previous")
def get_previous_launches():
    """Retrieve previous launches from the database."""
    query = """
    SELECT 
        id, name, mission_description, image_url, launch_date, launch_status, 
        rocket_name, pad_name, map_url, payload_name, payload_orbit, mission_type, 
        orbit_abbrev, mission_agency, vehicle_type, crew_count, reused_rocket, 
        fairing_recovered, payload_mass_kg, payload_customer, launch_cost_million, 
        video_url, launch_success, failure_reason, weather_conditions, booster_count, 
        recovery_ship, landing_type, landing_success, last_updated
    FROM launches
    WHERE launch_date < NOW()
    ORDER BY launch_date DESC;
    """
    return fetch_launches(query)
