import psycopg2
from skyfield.api import EarthSatellite
from tqdm import tqdm
from math import sqrt, pi
from datetime import datetime, timedelta, timezone
from dotenv import load_dotenv
import os

# Load environment variables
load_dotenv()

# Database connection
def connect_to_db():
    """
    Connect to the PostgreSQL database using environment variables.
    """
    conn = psycopg2.connect(
        host=os.getenv("DB_HOST"),
        database=os.getenv("DB_NAME"),
        user=os.getenv("DB_USER"),
        password=os.getenv("DB_PASSWORD"),
    )
    return conn

# Update database schema
def update_schema(conn):
    """
    Update the PostgreSQL schema for storing satellite data.
    """
    cursor = conn.cursor()
    schema_updates = [
        "ADD COLUMN IF NOT EXISTS norad_number INT",
        "ADD COLUMN IF NOT EXISTS intl_designator VARCHAR(20)",
        "ADD COLUMN IF NOT EXISTS ephemeris_type INT",
        "ADD COLUMN IF NOT EXISTS inclination FLOAT",
        "ADD COLUMN IF NOT EXISTS eccentricity FLOAT",
        "ADD COLUMN IF NOT EXISTS period FLOAT",
        "ADD COLUMN IF NOT EXISTS perigee FLOAT",
        "ADD COLUMN IF NOT EXISTS apogee FLOAT",
        "ADD COLUMN IF NOT EXISTS epoch TIMESTAMP",
        "ADD COLUMN IF NOT EXISTS raan FLOAT",
        "ADD COLUMN IF NOT EXISTS arg_perigee FLOAT",
        "ADD COLUMN IF NOT EXISTS mean_anomaly FLOAT",
        "ADD COLUMN IF NOT EXISTS mean_motion FLOAT",
        "ADD COLUMN IF NOT EXISTS semi_major_axis FLOAT",
        "ADD COLUMN IF NOT EXISTS velocity FLOAT",
        "ADD COLUMN IF NOT EXISTS orbit_type VARCHAR(20)",
        "ADD COLUMN IF NOT EXISTS satellite_age FLOAT",
        "ADD COLUMN IF NOT EXISTS bstar FLOAT",
        "ADD COLUMN IF NOT EXISTS rev_num INT"
    ]
    print("Updating database schema...")
    for update in tqdm(schema_updates, desc="Schema Updates"):
        try:
            cursor.execute(f"ALTER TABLE satellites {update}")
            conn.commit()
        except Exception as e:
            print(f"Error with schema update: {e}")
    cursor.close()
    print("Database schema updated successfully.")

# Extract epoch from TLE Line 1
def extract_epoch(tle_line1):
    """
    Extracts the epoch from the TLE Line 1 and converts it to a Python datetime object.
    """
    try:
        year = int(tle_line1[18:20])
        day_of_year = float(tle_line1[20:32])
        year += 2000 if year < 57 else 1900
        epoch_date = datetime(year, 1, 1) + timedelta(days=day_of_year - 1)
        return epoch_date
    except Exception as e:
        print(f"Error extracting epoch: {e}")
        return None

# Parse TLE Line 2
def parse_tle_line2(tle_line2):
    """
    Parses TLE Line 2 to extract mean motion and revolution number.
    """
    try:
        mean_motion = float(tle_line2[52:63].strip())
        rev_num = int(tle_line2[63:68].strip())
        return mean_motion, rev_num
    except Exception as e:
        print(f"Error parsing TLE Line 2: {e}")
        return None, None

# Parse TLE Line 1
def parse_tle_line1(tle_line1):
    """
    Parses TLE Line 1 to extract NORAD number, international designator, and ephemeris type.
    """
    try:
        norad_number = int(tle_line1[2:7].strip())
        intl_designator = tle_line1[9:17].strip()
        ephemeris_type = int(tle_line1[62:63].strip())
        return norad_number, intl_designator, ephemeris_type
    except Exception as e:
        print(f"Error parsing TLE Line 1: {e}")
        return None, None, None

# Compute orbital parameters
def compute_orbital_params(tle_line1, tle_line2):
    """
    Compute various orbital parameters from TLE lines.
    """
    try:
        satellite = EarthSatellite(tle_line1, tle_line2)
        norad_number, intl_designator, ephemeris_type = parse_tle_line1(tle_line1)

        inclination = satellite.model.inclo * (180 / pi)
        eccentricity = satellite.model.ecco
        mean_motion, rev_num = parse_tle_line2(tle_line2)
        bstar = satellite.model.bstar
        raan = satellite.model.nodeo * (180 / pi)
        arg_perigee = satellite.model.argpo * (180 / pi)

        epoch = extract_epoch(tle_line1)

        # Derived parameters
        mu = 398600.4418  # Earth's standard gravitational parameter
        period = (1 / mean_motion) * 1440
        semi_major_axis = (mu / ((mean_motion * 2 * pi / 86400) ** 2)) ** (1 / 3)
        perigee = semi_major_axis * (1 - eccentricity) - 6378
        apogee = semi_major_axis * (1 + eccentricity) - 6378
        velocity = sqrt(mu * (2 / semi_major_axis - 1 / semi_major_axis))
        orbit_type = classify_orbit_type(perigee, apogee)

        return {
            "norad_number": norad_number,
            "intl_designator": intl_designator,
            "ephemeris_type": ephemeris_type,
            "epoch": epoch,
            "inclination": inclination,
            "eccentricity": eccentricity,
            "mean_motion": mean_motion,
            "raan": raan,
            "arg_perigee": arg_perigee,
            "period": period,
            "semi_major_axis": semi_major_axis,
            "perigee": perigee,
            "apogee": apogee,
            "velocity": velocity,
            "orbit_type": orbit_type,
            "bstar": bstar,
            "rev_num": rev_num
        }
    except Exception as e:
        print(f"Error computing parameters: {e}")
        return None

# Classify orbit type
def classify_orbit_type(perigee, apogee):
    avg_altitude = (perigee + apogee) / 2
    if avg_altitude < 2000:
        return "LEO"
    elif 2000 <= avg_altitude < 35786:
        return "MEO"
    elif 35786 <= avg_altitude <= 35792:
        return "GEO"
    else:
        return "HEO"

# Update satellite data
def update_satellite_data(conn):
    """
    Fetch TLE data, compute orbital parameters, and update the database.
    """
    cursor = conn.cursor()
    cursor.execute("SELECT id, tle_line1, tle_line2 FROM satellites")
    rows = cursor.fetchall()

    for row in tqdm(rows, desc="Updating Satellite Data"):
        sat_id, tle_line1, tle_line2 = row
        params = compute_orbital_params(tle_line1, tle_line2)
        if params:
            cursor.execute("""
                UPDATE satellites
                SET norad_number = %s, intl_designator = %s, ephemeris_type = %s, epoch = %s,
                    inclination = %s, eccentricity = %s, period = %s, perigee = %s, apogee = %s,
                    raan = %s, arg_perigee = %s, mean_motion = %s, semi_major_axis = %s,
                    orbit_type = %s, bstar = %s, rev_num = %s
                WHERE id = %s
            """, (
                params["norad_number"], params["intl_designator"], params["ephemeris_type"], params["epoch"],
                params["inclination"], params["eccentricity"], params["period"], params["perigee"], params["apogee"],
                params["raan"], params["arg_perigee"], params["mean_motion"], params["semi_major_axis"],
                params["orbit_type"], params["bstar"], params["rev_num"], sat_id
            ))
            conn.commit()

if __name__ == "__main__":
    print("Connecting to the database...")
    conn = connect_to_db()
    try:
        update_schema(conn)
        update_satellite_data(conn)
    finally:
        conn.close()
