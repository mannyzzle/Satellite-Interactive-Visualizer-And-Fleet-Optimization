import psycopg2
from skyfield.api import EarthSatellite
from tqdm import tqdm
from math import sqrt, pi
from datetime import datetime, timedelta, timezone
from dotenv import load_dotenv
import os

# Load environment variables
load_dotenv()

# Connect to the database
def connect_to_db():
    conn = psycopg2.connect(
        host=os.getenv("DB_HOST"),
        database=os.getenv("DB_NAME"),
        user=os.getenv("DB_USER"),
        password=os.getenv("DB_PASSWORD"),
    )
    return conn

# Update database schema to include all required features
def update_schema(conn):
    cursor = conn.cursor()
    schema_updates = [
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

    TLE Epoch Format: YYDDD.DDDDDDD (Year, Day of Year with fractional day).
    """
    try:
        year = int(tle_line1[18:20])  # Characters 19-20 for the year
        day_of_year = float(tle_line1[20:32])  # Characters 21-32 for day of the year (with fraction)

        # Determine the full year (accounts for 2000+ vs. 1900+ ambiguity)
        if year < 57:  # NORAD convention: before 57 means 2000s
            year += 2000
        else:
            year += 1900

        # Convert day_of_year to datetime
        epoch_date = datetime(year, 1, 1) + timedelta(days=day_of_year - 1)

        return epoch_date
    except Exception as e:
        print(f"Error extracting epoch: {e}")
        return None

# Function to calculate derived features
def compute_orbital_params(tle_line1, tle_line2):
    try:
        satellite = EarthSatellite(tle_line1, tle_line2)
        inclination = satellite.model.inclo * (180 / pi)  # Inclination in degrees
        eccentricity = satellite.model.ecco  # Eccentricity
        mean_motion = float(tle_line2.split()[-1])  # Correctly extract mean motion from TLE
        mean_anomaly = float(tle_line2.split()[-2])  # Mean anomaly, second-to-last field
        bstar = satellite.model.bstar  # Drag coefficient
        rev_num = satellite.model.revnum  # Revolution number
        raan = satellite.model.nodeo * (180 / pi)  # RAAN
        arg_perigee = satellite.model.argpo * (180 / pi)  # Argument of Perigee

        # Extract the epoch from TLE Line 1
        epoch = extract_epoch(tle_line1)

        # Derived parameters
        mu = 398600.4418  # Earth's standard gravitational parameter, km^3/s^2
        period = (1 / mean_motion) * 1440  # Orbital period in minutes
        semi_major_axis = (mu / ((mean_motion * 2 * pi / 86400) ** 2)) ** (1 / 3)  # Semi-major axis in km
        perigee = semi_major_axis * (1 - eccentricity) - 6378  # Subtract Earth's radius
        apogee = semi_major_axis * (1 + eccentricity) - 6378  # Subtract Earth's radius
        velocity = sqrt(mu * (2 / semi_major_axis - 1 / semi_major_axis))  # Orbital velocity in km/s
        orbit_type = classify_orbit_type(perigee, apogee)

        return {
            "epoch": epoch,
            "inclination": inclination,
            "eccentricity": eccentricity,
            "mean_motion": mean_motion,
            "mean_anomaly": mean_anomaly,
            "bstar": bstar,
            "rev_num": rev_num,
            "raan": raan,
            "arg_perigee": arg_perigee,
            "period": period,
            "semi_major_axis": semi_major_axis,
            "perigee": perigee,
            "apogee": apogee,
            "velocity": velocity,
            "orbit_type": orbit_type
        }
    except Exception as e:
        print(f"Error computing parameters: {e}")
        return None

# Classify orbit type based on altitude
def classify_orbit_type(perigee, apogee):
    avg_altitude = (perigee + apogee) / 2
    if avg_altitude < 2000:
        return "LEO"  # Low Earth Orbit
    elif 2000 <= avg_altitude < 35786:
        return "MEO"  # Medium Earth Orbit
    elif 35786 <= avg_altitude <= 35792:
        return "GEO"  # Geostationary Orbit
    else:
        return "HEO"  # Highly Elliptical Orbit

# Calculate satellite age
def calculate_satellite_age(epoch):
    try:
        if epoch is None:
            return None
        # Ensure epoch is timezone-aware in UTC
        if epoch.tzinfo is None:
            epoch = epoch.replace(tzinfo=timezone.utc)
        # Calculate the age in days
        age = (datetime.now(timezone.utc) - epoch).days
        return age
    except Exception as e:
        print(f"Error calculating satellite age: {e}")
        return None

# Update satellite data
def update_satellite_data(conn):
    cursor = conn.cursor()
    cursor.execute("SELECT id, tle_line1, tle_line2 FROM satellites")
    rows = cursor.fetchall()

    print("Updating satellite data...")
    for row in tqdm(rows, desc="Satellite Updates"):
        sat_id, tle_line1, tle_line2 = row
        params = compute_orbital_params(tle_line1, tle_line2)
        if params:
            satellite_age = calculate_satellite_age(params["epoch"])
            params["satellite_age"] = satellite_age

            cursor.execute("""
                UPDATE satellites
                SET epoch = %s, inclination = %s, eccentricity = %s, period = %s, perigee = %s, apogee = %s,
                    raan = %s, arg_perigee = %s, mean_anomaly = %s, mean_motion = %s, semi_major_axis = %s,
                    velocity = %s, orbit_type = %s, satellite_age = %s, bstar = %s, rev_num = %s
                WHERE id = %s
            """, (
                params["epoch"], params["inclination"], params["eccentricity"], params["period"], params["perigee"], params["apogee"],
                params["raan"], params["arg_perigee"], params["mean_anomaly"], params["mean_motion"], params["semi_major_axis"],
                params["velocity"], params["orbit_type"], params["satellite_age"], params["bstar"], params["rev_num"], sat_id
            ))
            conn.commit()

if __name__ == "__main__":
    print("Connecting to the database...")
    conn = connect_to_db()
    try:
        update_schema(conn)  # Schema updates with a loading bar
        update_satellite_data(conn)  # Satellite data updates with a loading bar
        print("Satellite data updated successfully!")
    finally:
        conn.close()
