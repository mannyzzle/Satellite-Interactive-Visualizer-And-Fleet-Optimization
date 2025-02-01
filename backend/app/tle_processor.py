import psycopg2
from skyfield.api import EarthSatellite
from tqdm import tqdm
from math import sqrt, pi
from datetime import datetime, timedelta
from dotenv import load_dotenv
import os
import requests
from app.database import get_db_connection  # ✅ Use get_db_connection()

# Load environment variables
load_dotenv()

# Define TLE URL
TLE_URL = "https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=tle"

# Fetch TLE data
def fetch_tle_data():
    """
    Fetches TLE data from CelesTrak.
    Returns a list of dictionaries containing TLE information.
    """
    response = requests.get(TLE_URL)
    if response.status_code == 200:
        tle_lines = response.text.strip().splitlines()
        satellites = []
        for i in range(0, len(tle_lines) - 2, 3):
            satellites.append({
                "name": tle_lines[i].strip(),
                "line1": tle_lines[i + 1].strip(),
                "line2": tle_lines[i + 2].strip(),
            })
        return satellites
    else:
        raise Exception(f"Failed to fetch TLE data: HTTP {response.status_code}")

# Extract epoch from TLE Line 1
def extract_epoch(tle_line1):
    try:
        year = int(tle_line1[18:20])
        day_of_year = float(tle_line1[20:32])
        year += 2000 if year < 57 else 1900
        return datetime(year, 1, 1) + timedelta(days=day_of_year - 1)
    except Exception as e:
        print(f"Error extracting epoch: {e}")
        return None

# Parse TLE Lines
def parse_tle_line1(tle_line1):
    try:
        return int(tle_line1[2:7].strip()), tle_line1[9:17].strip(), int(tle_line1[62:63].strip())
    except Exception as e:
        print(f"Error parsing TLE Line 1: {e}")
        return None, None, None

def parse_tle_line2(tle_line2):
    try:
        return float(tle_line2[52:63].strip()), int(tle_line2[63:68].strip())
    except Exception as e:
        print(f"Error parsing TLE Line 2: {e}")
        return None, None

# Compute orbital parameters
def compute_orbital_params(tle_line1, tle_line2):
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

# Update database schema
def update_schema(conn):
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
        "ADD COLUMN IF NOT EXISTS mean_motion FLOAT",
        "ADD COLUMN IF NOT EXISTS semi_major_axis FLOAT",
        "ADD COLUMN IF NOT EXISTS velocity FLOAT",
        "ADD COLUMN IF NOT EXISTS orbit_type VARCHAR(20)",
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
    print("✅ Database schema updated successfully.")


# Update satellite data
def update_satellite_data():
    """
    Fetch TLE data, compute orbital parameters, and insert/update the database.
    """
    conn = get_db_connection()
    cursor = conn.cursor()

    satellites = fetch_tle_data()
    print(f"📡 Fetched {len(satellites)} satellites for processing.")

    for sat in tqdm(satellites, desc="Updating Satellite Data"):
        params = compute_orbital_params(sat["line1"], sat["line2"])
        
        if params:
            try:
                # 🛠 Ensure norad_number is NOT NULL (set to -1 if missing)
                norad = params["norad_number"] if params["norad_number"] is not None else -1

                cursor.execute("""
                    INSERT INTO satellites (
                        name, tle_line1, tle_line2, norad_number, intl_designator, ephemeris_type,
                        inclination, eccentricity, period, perigee, apogee, epoch, raan, arg_perigee,
                        mean_motion, semi_major_axis, velocity, orbit_type, bstar, rev_num
                    )
                    VALUES (
                        %s, %s, %s, %s, %s, %s,
                        %s, %s, %s, %s, %s, %s, %s, %s,
                        %s, %s, %s, %s, %s, %s
                    )
                    ON CONFLICT (norad_number) DO UPDATE SET
                        tle_line1 = EXCLUDED.tle_line1,
                        tle_line2 = EXCLUDED.tle_line2,
                        epoch = EXCLUDED.epoch,
                        mean_motion = EXCLUDED.mean_motion,
                        inclination = EXCLUDED.inclination,
                        eccentricity = EXCLUDED.eccentricity,
                        period = EXCLUDED.period,
                        perigee = EXCLUDED.perigee,
                        apogee = EXCLUDED.apogee,
                        semi_major_axis = EXCLUDED.semi_major_axis,
                        velocity = EXCLUDED.velocity,
                        orbit_type = EXCLUDED.orbit_type,
                        bstar = EXCLUDED.bstar,
                        rev_num = EXCLUDED.rev_num;

                    ON CONFLICT (name) DO UPDATE SET
                        tle_line1 = EXCLUDED.tle_line1,
                        tle_line2 = EXCLUDED.tle_line2,
                        epoch = EXCLUDED.epoch,
                        mean_motion = EXCLUDED.mean_motion,
                        inclination = EXCLUDED.inclination,
                        eccentricity = EXCLUDED.eccentricity,
                        period = EXCLUDED.period,
                        perigee = EXCLUDED.perigee,
                        apogee = EXCLUDED.apogee,
                        semi_major_axis = EXCLUDED.semi_major_axis,
                        velocity = EXCLUDED.velocity,
                        orbit_type = EXCLUDED.orbit_type,
                        bstar = EXCLUDED.bstar,
                        rev_num = EXCLUDED.rev_num;
                """, (
                    sat["name"], sat["line1"], sat["line2"], norad, params["intl_designator"],
                    params["ephemeris_type"], params["inclination"], params["eccentricity"], params["period"],
                    params["perigee"], params["apogee"], params["epoch"], params["raan"], params["arg_perigee"],
                    params["mean_motion"], params["semi_major_axis"], params["velocity"], params["orbit_type"],
                    params["bstar"], params["rev_num"]
                ))

            except psycopg2.errors.UniqueViolation as e:
                print(f"❌ Duplicate detected: {sat['name']} ({norad}) → {e}")
                conn.rollback()

    conn.commit()
    cursor.close()
    conn.close()
    print("✅ All satellite data inserted and updated successfully!")

if __name__ == "__main__":
    print("Connecting to the database...")
    update_satellite_data()