# /backend/app/tle_processor.py


import psycopg2
from skyfield.api import EarthSatellite, load
from tqdm import tqdm
from math import sqrt, pi
from datetime import datetime, timedelta
from dotenv import load_dotenv
import os
import requests
from database import get_db_connection  # ✅ Use get_db_connection()

# Load environment variables
load_dotenv()

# Load Skyfield timescale
ts = load.timescale()

# Define TLE URL
TLE_URL = "https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=tle"
SATCAT_URL = "https://celestrak.org/satcat/records.php?CATNR={norad_id}&FORMAT=JSON"

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

# Compute orbital parameters including latitude and longitude
def compute_orbital_params(tle_line1, tle_line2):
    try:
        satellite = EarthSatellite(tle_line1, tle_line2, "Satellite", ts)
        t = ts.now()  # Get the current timestamp

        # Compute position in Earth-centered coordinates
        geocentric = satellite.at(t)
        subpoint = geocentric.subpoint()
        latitude = subpoint.latitude.degrees  # Convert to degrees
        longitude = subpoint.longitude.degrees  # Convert to degrees

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
        semi_major_axis = (mu / ((mean_motion * 2 * pi / 86400) ** 2)) ** (1 / 3)
        velocity = sqrt(mu * (2 / semi_major_axis - 1 / semi_major_axis))

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
            "semi_major_axis": semi_major_axis,
            "velocity": velocity,
            "latitude": latitude,   # ✅ Added latitude
            "longitude": longitude, # ✅ Added longitude
        }
    except Exception as e:
        print(f"Error computing parameters: {e}")
        return None

# Update database schema
def update_schema(conn):
    cursor = conn.cursor()
    schema_updates = [
        "ADD COLUMN IF NOT EXISTS latitude FLOAT",
        "ADD COLUMN IF NOT EXISTS longitude FLOAT"
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




# ✅ Fetch CelesTrak SATCAT Metadata (Non-TLE)

def fetch_satcat_data(norad_id):
    response = requests.get(SATCAT_URL.format(norad_id=norad_id))
    if response.status_code == 200 and response.json():
        metadata = response.json()[0]  # First (and only) entry

        # ✅ Convert empty strings to None
        def sanitize_date(date_str):
            return date_str if date_str and date_str.strip() else None

        return {
            "object_type": metadata.get("OBJECT_TYPE"),
            "ops_status_code": metadata.get("OPS_STATUS_CODE"),
            "owner": metadata.get("OWNER"),
            "launch_date": sanitize_date(metadata.get("LAUNCH_DATE")),
            "launch_site": metadata.get("LAUNCH_SITE"),
            "decay_date": sanitize_date(metadata.get("DECAY_DATE")),
            "rcs": metadata.get("RCS"),
            "purpose": metadata.get("OBJECT_NAME")  # Purpose inferred from name
        }
    return {}


# ✅ Update Satellite Data (Using compute_orbital_params)
def update_satellite_data():
    conn = get_db_connection()
    cursor = conn.cursor()

    satellites = fetch_tle_data()
    print(f"📡 Fetched {len(satellites)} satellites for processing.")

    updated_count = 0
    skipped_count = 0

    for sat in tqdm(satellites, desc="Updating Satellite Data"):
        params = compute_orbital_params(sat["line1"], sat["line2"])  # ✅ Keeping your function

        if params:
            try:
                norad = params["norad_number"] if params["norad_number"] is not None else -1

                # Fetch additional metadata from SATCAT
                satcat_data = fetch_satcat_data(norad)

                cursor.execute("""
    INSERT INTO satellites (
        name, tle_line1, tle_line2, norad_number, intl_designator, ephemeris_type,
        inclination, eccentricity, mean_motion, raan, arg_perigee, epoch,
        velocity, latitude, longitude, object_type, ops_status_code, owner, 
        launch_date, launch_site, decay_date, rcs, purpose
    ) VALUES (
        %s, %s, %s, %s, %s, %s,
        %s, %s, %s, %s, %s, %s,
        %s, %s, %s, %s, %s, %s,
        %s, %s, %s, %s, %s
    )
    ON CONFLICT (norad_number) DO UPDATE SET
        tle_line1 = EXCLUDED.tle_line1,
        tle_line2 = EXCLUDED.tle_line2,
        epoch = EXCLUDED.epoch,
        mean_motion = EXCLUDED.mean_motion,
        inclination = EXCLUDED.inclination,
        eccentricity = EXCLUDED.eccentricity,
        raan = EXCLUDED.raan,
        arg_perigee = EXCLUDED.arg_perigee,
        velocity = EXCLUDED.velocity,
        latitude = EXCLUDED.latitude,
        longitude = EXCLUDED.longitude,
        object_type = EXCLUDED.object_type,
        ops_status_code = EXCLUDED.ops_status_code,
        owner = EXCLUDED.owner,
        launch_date = COALESCE(EXCLUDED.launch_date, satellites.launch_date),
        launch_site = EXCLUDED.launch_site,
        decay_date = COALESCE(EXCLUDED.decay_date, satellites.decay_date),
        rcs = EXCLUDED.rcs,
        purpose = EXCLUDED.purpose;
        """, (
            sat["name"], sat["line1"], sat["line2"], norad, params["intl_designator"],
            params["ephemeris_type"], params["inclination"], params["eccentricity"], params["mean_motion"],
            params["raan"], params["arg_perigee"], params["epoch"],
            params["velocity"], params["latitude"], params["longitude"],
            satcat_data.get("object_type"), satcat_data.get("ops_status_code"),
            satcat_data.get("owner"), satcat_data.get("launch_date"),
            satcat_data.get("launch_site"), satcat_data.get("decay_date"),
            satcat_data.get("rcs"), satcat_data.get("purpose")
                ))

                updated_count += 1
                
            except Exception as e:
                skipped_count += 1
                print(f"⚠️ Skipping {sat['name']} (NORAD {norad}): {e}")
                conn.rollback()

    conn.commit()
    cursor.close()
    conn.close()
    print(f"✅ {updated_count} satellites updated. 🚀 {skipped_count} skipped.")

if __name__ == "__main__":
    print("Connecting to the database...")
    update_satellite_data()
