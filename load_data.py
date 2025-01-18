import psycopg2
from dotenv import load_dotenv
import os
from skyfield.api import EarthSatellite, load
from tqdm import tqdm
from math import radians

# Load environment variables
load_dotenv()

def connect_to_db():
    conn = psycopg2.connect(
        host=os.getenv("DB_HOST"),
        database=os.getenv("DB_NAME"),
        user=os.getenv("DB_USER"),
        password=os.getenv("DB_PASSWORD"),
    )
    return conn

def compute_orbital_params(tle_line1, tle_line2):
    try:
        satellite = EarthSatellite(tle_line1, tle_line2)
        inclination = satellite.model.inclo * (180 / 3.14159)  # Inclination in degrees
        eccentricity = satellite.model.ecco  # Eccentricity
        mean_motion = satellite.model.no_kozai  # Revolutions per day

        # Period in minutes
        period = (1 / mean_motion) * 1440

        # Semi-major axis in kilometers (using Earth's gravitational constant)
        mu = 398600.4418  # Earth's standard gravitational parameter, km^3/s^2
        a = (mu / (mean_motion * 2 * 3.14159 / 86400) ** 2) ** (1 / 3)

        # Perigee and apogee in kilometers
        perigee = a * (1 - eccentricity) - 6378  # Subtract Earth's radius
        apogee = a * (1 + eccentricity) - 6378  # Subtract Earth's radius

        return inclination, eccentricity, period, perigee, apogee
    except Exception as e:
        print(f"Error computing parameters: {e}")
        return None, None, None, None, None


def update_satellite_data(conn):
    cursor = conn.cursor()
    cursor.execute("SELECT id, tle_line1, tle_line2 FROM satellites")
    rows = cursor.fetchall()

    for row in tqdm(rows, desc="Updating satellite data"):
        sat_id, tle_line1, tle_line2 = row
        inclination, eccentricity, period, perigee, apogee = compute_orbital_params(tle_line1, tle_line2)
        if inclination is not None:
            cursor.execute("""
                UPDATE satellites
                SET inclination = %s, eccentricity = %s, period = %s, perigee = %s, apogee = %s
                WHERE id = %s
            """, (inclination, eccentricity, period, perigee, apogee, sat_id))
            conn.commit()

if __name__ == "__main__":
    print("Connecting to the database...")
    conn = connect_to_db()
    try:
        print("Updating satellite data...")
        update_satellite_data(conn)
        print("Satellite data updated successfully!")
    finally:
        conn.close()
