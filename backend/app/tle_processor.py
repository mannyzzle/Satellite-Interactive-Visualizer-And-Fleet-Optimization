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




def infer_purpose(metadata):
    """
    Infers the purpose of the satellite based on its name, type, and operational status.
    """
    name = metadata.get("OBJECT_NAME", "").upper()
    object_type = metadata.get("OBJECT_TYPE", "").upper()
    ops_status = metadata.get("OPS_STATUS_CODE", "").upper()

    if "STARLINK" in name or "IRIDIUM" in name:
        return "Communications"
    if "GPS" in name or "GLONASS" in name or "GALILEO" in name or "BEIDOU" in name:
        return "Navigation"
    if "WEATHER" in name or "METEOR" in name or "NOAA" in name:
        return "Weather Monitoring"
    if "SPY" in name or "NROL" in name or "RECON" in name or "USA" in name:
        return "Military/Reconnaissance"
    if "EARTH" in name or "SENTINEL" in name or "LANDSAT" in name or "TERRA" in name:
        return "Earth Observation"
    if "SCIENCE" in name or "HUBBLE" in name or "JWST" in name or "X-RAY" in name:
        return "Scientific Research"
    if "EXPERIMENT" in name or "TEST" in name:
        return "Technology Demonstration"
    if "ISS" in name or "CREW" in name:
        return "Human Spaceflight"
    
    # Default classification based on type
    if object_type == "PAYLOAD":
        return "Unknown Payload"
    if object_type == "R/B":
        return "Rocket Body (Debris)"
    if object_type == "DEB":
        return "Space Debris"

    return "Unknown"





SPACETRACK_USER = os.getenv("SPACETRACK_USER")
SPACETRACK_PASS = os.getenv("SPACETRACK_PASS")

def get_spacetrack_session():
    """
    Logs in to SpaceTrack and returns a session with authentication cookies.
    """
    login_url = "https://www.space-track.org/ajaxauth/login"
    session = requests.Session()
    
    # Attempt login
    response = session.post(login_url, data={"identity": SPACETRACK_USER, "password": SPACETRACK_PASS})
    
    if response.status_code == 200 and "You are now logged in" in response.text:
        print("✅ SpaceTrack login successful.")
        return session
    else:
        print(f"❌ SpaceTrack login failed! Response: {response.text}")
        return None




def fetch_spacetrack_data(norad_id):
    """
    Fetch satellite metadata from SpaceTrack API using an authenticated session.
    """
    session = get_spacetrack_session()
    if not session:
        return {}

    spacetrack_url = f"https://www.space-track.org/basicspacedata/query/class/satcat/NORAD_CAT_ID/{norad_id}/format/json"
    
    response = session.get(spacetrack_url)
    if response.status_code == 200 and response.json():
        metadata = response.json()[0]  # First (and only) entry

        def clean(value, data_type=str):
            """Convert empty strings to None and handle types correctly."""
            if value in ["", "null", None]:
                return None
            return data_type(value) if data_type != str else value.strip()

        return {
            "country": clean(metadata.get("COUNTRY")),
            "purpose": infer_purpose(metadata),  # ✅ Infer purpose
            "decay_date": clean(metadata.get("DECAY"), str),
            "object_type": clean(metadata.get("OBJECT_TYPE")),
            "ops_status_code": clean(metadata.get("OPS_STATUS_CODE")),
            "launch_date": clean(metadata.get("LAUNCH"), str),
            "launch_site": clean(metadata.get("SITE")),
            "rcs": clean(metadata.get("RCS"), float),
        }
    else:
        print(f"⚠️ Failed to fetch metadata for NORAD {norad_id}")
        return {}





def update_satellite_data():
    """
    Fetch TLE data from CelesTrak, compute orbital parameters, fetch SpaceTrack metadata,
    and insert/update the database.
    """
    conn = get_db_connection()
    cursor = conn.cursor()

    update_schema(conn)  # Ensure schema is updated before inserting new data

    satellites = fetch_tle_data()  # Fetch TLE data from CelesTrak
    print(f"📡 Fetched {len(satellites)} satellites for processing.")

    updated_count = 0
    skipped_count = 0

    for sat in tqdm(satellites, desc="Updating Satellite Data"):
        params = compute_orbital_params(sat["line1"], sat["line2"])  # Using your function to compute orbital params

        if params:
            norad = params["norad_number"] if params["norad_number"] is not None else -1

            # Fetch SpaceTrack metadata (country, purpose, etc.)
            spacetrack_data = fetch_spacetrack_data(norad)

            try:
                # Insert/update data into the database
                cursor.execute("""
    INSERT INTO satellites (
        name, tle_line1, tle_line2, norad_number, intl_designator, ephemeris_type,
        inclination, eccentricity, mean_motion, raan, arg_perigee, epoch,
        velocity, latitude, longitude, object_type, ops_status_code, 
        launch_date, launch_site, decay_date, rcs, purpose, country
    ) VALUES (
        %s, %s, %s, %s, %s, %s,
        %s, %s, %s, %s, %s, %s,
        %s, %s, %s, %s, %s, %s,
        %s, %s, %s, %s, %s
    )
    ON CONFLICT (norad_number) DO UPDATE SET
        tle_line1 = COALESCE(EXCLUDED.tle_line1, satellites.tle_line1),
        tle_line2 = COALESCE(EXCLUDED.tle_line2, satellites.tle_line2),
        epoch = COALESCE(EXCLUDED.epoch, satellites.epoch),
        mean_motion = COALESCE(EXCLUDED.mean_motion, satellites.mean_motion),
        inclination = COALESCE(EXCLUDED.inclination, satellites.inclination),
        eccentricity = COALESCE(EXCLUDED.eccentricity, satellites.eccentricity),
        raan = COALESCE(EXCLUDED.raan, satellites.raan),
        arg_perigee = COALESCE(EXCLUDED.arg_perigee, satellites.arg_perigee),
        velocity = COALESCE(EXCLUDED.velocity, satellites.velocity),
        latitude = COALESCE(EXCLUDED.latitude, satellites.latitude),
        longitude = COALESCE(EXCLUDED.longitude, satellites.longitude),
        object_type = COALESCE(EXCLUDED.object_type, satellites.object_type),
        ops_status_code = COALESCE(EXCLUDED.ops_status_code, satellites.ops_status_code),
        launch_date = COALESCE(EXCLUDED.launch_date, satellites.launch_date),
        launch_site = COALESCE(EXCLUDED.launch_site, satellites.launch_site),
        decay_date = COALESCE(EXCLUDED.decay_date, satellites.decay_date),
        rcs = COALESCE(EXCLUDED.rcs, satellites.rcs),
        purpose = COALESCE(EXCLUDED.purpose, satellites.purpose),
        country = COALESCE(EXCLUDED.country, satellites.country);
        """, (
          sat["name"], sat["line1"], sat["line2"], norad, params["intl_designator"],
          params["ephemeris_type"], params["inclination"], params["eccentricity"], params["mean_motion"],
          params["raan"], params["arg_perigee"], params["epoch"],
          params["velocity"], params["latitude"], params["longitude"],
          spacetrack_data.get("object_type"), spacetrack_data.get("ops_status_code"), spacetrack_data.get("launch_date"),
           spacetrack_data.get("launch_site"), spacetrack_data.get("decay_date"),
           spacetrack_data.get("rcs"), spacetrack_data.get("purpose"),
             spacetrack_data.get("country")
               ))

                updated_count += 1

            except psycopg2.errors.UniqueViolation as e:
                skipped_count += 1
                print(f"⚠️ Skipping duplicate: {sat['name']} (NORAD {norad}) → {e}")
                conn.rollback()

    conn.commit()
    cursor.close()
    conn.close()
    print(f"✅ {updated_count} satellites inserted/updated successfully. 🚀 {skipped_count} entries skipped.")

if __name__ == "__main__":
    print("Connecting to the database...")
    update_satellite_data()
