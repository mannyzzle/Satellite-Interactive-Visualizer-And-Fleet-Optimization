import psycopg2
from skyfield.api import EarthSatellite
from tqdm import tqdm
from math import sqrt, pi
from datetime import datetime
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
        "ADD COLUMN IF NOT EXISTS orbital_period FLOAT",
        "ADD COLUMN IF NOT EXISTS semi_major_axis FLOAT",
        "ADD COLUMN IF NOT EXISTS true_anomaly FLOAT",
        "ADD COLUMN IF NOT EXISTS velocity FLOAT",
        "ADD COLUMN IF NOT EXISTS orbit_type VARCHAR(20)",
        "ADD COLUMN IF NOT EXISTS satellite_age FLOAT",
        "ADD COLUMN IF NOT EXISTS stability FLOAT",
        "ADD COLUMN IF NOT EXISTS collision_risk FLOAT",
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

# Function to calculate derived features
def compute_orbital_params(tle_line1, tle_line2):
    try:
        satellite = EarthSatellite(tle_line1, tle_line2)
        inclination = satellite.model.inclo * (180 / pi)  # Inclination in degrees
        eccentricity = satellite.model.ecco  # Eccentricity
        mean_motion = satellite.model.no_kozai  # Revolutions per day
        bstar = satellite.model.bstar  # Drag coefficient
        rev_num = satellite.model.revnum  # Revolution number
        raan = satellite.model.nodeo * (180 / pi)  # Right Ascension of Ascending Node
        arg_perigee = satellite.model.argpo * (180 / pi)  # Argument of Perigee
        mean_anomaly = satellite.model.mo * (180 / pi)  # Mean anomaly

        # Derived parameters
        mu = 398600.4418  # Earth's standard gravitational parameter, km^3/s^2
        period = (1 / mean_motion) * 1440  # Orbital period in minutes
        semi_major_axis = (mu / ((mean_motion * 2 * pi / 86400) ** 2)) ** (1 / 3)  # Semi-major axis in km
        perigee = semi_major_axis * (1 - eccentricity) - 6378  # Subtract Earth's radius
        apogee = semi_major_axis * (1 + eccentricity) - 6378  # Subtract Earth's radius
        velocity = sqrt(mu * (2 / semi_major_axis - 1 / semi_major_axis))  # Orbital velocity in km/s
        true_anomaly = satellite.model.mo * (180 / pi)  # Mean anomaly to degrees
        orbit_type = classify_orbit_type(perigee, apogee)

        return {
            "inclination": inclination,
            "eccentricity": eccentricity,
            "mean_motion": mean_motion,
            "bstar": bstar,
            "rev_num": rev_num,
            "raan": raan,
            "arg_perigee": arg_perigee,
            "mean_anomaly": mean_anomaly,
            "period": period,
            "semi_major_axis": semi_major_axis,
            "perigee": perigee,
            "apogee": apogee,
            "velocity": velocity,
            "orbit_type": orbit_type,
            "true_anomaly": true_anomaly
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
        if epoch is None or epoch.strip() == "":
            return None
        epoch_date = datetime.strptime(epoch, "%y%j.%f")  # TLE epoch format: YYDDD.DDDDDD
        age = (datetime.utcnow() - epoch_date).days
        return age
    except Exception as e:
        print(f"Error calculating satellite age: {e}")
        return None

# Update satellite data
def update_satellite_data(conn):
    cursor = conn.cursor()
    cursor.execute("SELECT id, tle_line1, tle_line2, epoch FROM satellites")
    rows = cursor.fetchall()

    print("Updating satellite data...")
    for row in tqdm(rows, desc="Satellite Updates"):
        sat_id, tle_line1, tle_line2, epoch = row
        params = compute_orbital_params(tle_line1, tle_line2)
        if params:
            satellite_age = calculate_satellite_age(epoch)
            params["satellite_age"] = satellite_age
            params["stability"] = None  # Placeholder
            params["collision_risk"] = None  # Placeholder

            cursor.execute("""
                UPDATE satellites
                SET inclination = %s, eccentricity = %s, period = %s, perigee = %s, apogee = %s, epoch = %s,
                    raan = %s, arg_perigee = %s, mean_anomaly = %s, mean_motion = %s, orbital_period = %s,
                    semi_major_axis = %s, true_anomaly = %s, velocity = %s, orbit_type = %s, satellite_age = %s,
                    stability = %s, collision_risk = %s, bstar = %s, rev_num = %s
                WHERE id = %s
            """, (
                params["inclination"], params["eccentricity"], params["period"], params["perigee"], params["apogee"], epoch,
                params["raan"], params["arg_perigee"], params["mean_anomaly"], params["mean_motion"], params["period"],
                params["semi_major_axis"], params["true_anomaly"], params["velocity"], params["orbit_type"], params["satellite_age"],
                params["stability"], params["collision_risk"], params["bstar"], params["rev_num"], sat_id
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
