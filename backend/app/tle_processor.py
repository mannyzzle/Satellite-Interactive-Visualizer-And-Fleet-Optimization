# /backend/app/tle_processor.py


import psycopg2
from skyfield.api import EarthSatellite, load
from tqdm import tqdm
from math import sqrt, pi
from datetime import datetime, timedelta
from dotenv import load_dotenv
import os
import requests
import time
from database import get_db_connection  # ✅ Use get_db_connection()

# Load environment variables
load_dotenv()

# Load Skyfield timescale
ts = load.timescale()
SPACETRACK_USER = os.getenv("SPACETRACK_USER")
SPACETRACK_PASS = os.getenv("SPACETRACK_PASS")
COOKIES_FILE = "cookies.txt"  # Ensure this is the correct cookie file path


API_WAIT_TIME = 3  # ✅ Complies with API rate limits


def get_spacetrack_session():
    """
    Logs in to Space-Track and returns a session with authentication cookies.
    Tries to reuse cookies if available.
    """
    session = requests.Session()

    # Try loading existing cookies
    if os.path.exists(COOKIES_FILE):
        try:
            print("🍪 Using saved Space-Track session cookie.")
            with open(COOKIES_FILE, "r") as f:
                cookies_data = f.read().strip()

            # ✅ Extract cookie value correctly
            if "\t" in cookies_data:
                cookies_data = cookies_data.split("\t")[-1]  # Extract only the actual cookie value
            
            session.cookies.set("chocolatechip", cookies_data, domain="www.space-track.org")

            # ✅ Validate session BEFORE logging in again
            test_url = "https://www.space-track.org/basicspacedata/query/class/satcat/NORAD_CAT_ID/25544/format/json"
            test_response = session.get(test_url)

            if test_response.status_code == 200:
                print("✅ Space-Track session is valid.")
                return session
        except Exception as e:
            print(f"⚠️ Error loading cookies: {e}")

    # **If session is invalid, perform login**
    login_url = "https://www.space-track.org/ajaxauth/login"
    payload = {"identity": SPACETRACK_USER, "password": SPACETRACK_PASS}

    response = session.post(login_url, data=payload)

    if response.status_code == 200 and "You are now logged in" in response.text:
        print("✅ Space-Track login successful.")

        # ✅ Correctly store only the cookie value (no Netscape formatting)
        with open(COOKIES_FILE, "w") as f:
            cookie_value = session.cookies.get("chocolatechip")
            f.write(cookie_value if cookie_value else "")

        return session
    else:
        print(f"❌ Space-Track login failed! HTTP {response.status_code} - {response.text}")
        return None






def rate_limited_get(session, url):
    """Fetches data with Space-Track API rate limiting and retries."""
    retries = 3
    for attempt in range(retries):
        response = session.get(url)
        if response.status_code == 200:
            time.sleep(API_WAIT_TIME)  # ✅ Prevents API throttling
            return response
        print(f"⚠️ Retry {attempt+1}/{retries} - API Error: {response.status_code}")
        time.sleep(2 ** attempt)  # Exponential backoff

    raise Exception(f"❌ Failed to fetch data from {url} after {retries} retries")





def fetch_tle_data(session, existing_norads, batch_size=300):
    """
    Fetches latest TLE data from Space-Track with retries for failed requests.
    """
    if not existing_norads:
        print("⚠️ No existing NORAD numbers found. Skipping TLE fetch.")
        return []

    satellites = []
    all_norads = set(existing_norads)
    fetched_norads = set()

    print(f"📡 Fetching latest TLE data in batches of {batch_size}...")

    for i in range(0, len(existing_norads), batch_size):
        batch = list(existing_norads)[i:i + batch_size]
        norad_query = ",".join(map(str, batch))
        tle_url = f"https://www.space-track.org/basicspacedata/query/class/gp/NORAD_CAT_ID/{norad_query}/orderby/EPOCH desc/format/json"

        print(f"📡 Fetching batch {i//batch_size + 1} of {len(existing_norads) // batch_size + 1}...")

        response = rate_limited_get(session, tle_url)

        if response.status_code == 200:
            batch_data = response.json()
            
            for sat in batch_data:
                try:
                    norad_number = int(sat.get("NORAD_CAT_ID", -1))
                    if norad_number > 0:
                        fetched_norads.add(norad_number)
                        satellites.append({
                            "norad_number": norad_number,
                            "name": sat.get("OBJECT_NAME", "Unknown"),
                            "tle_line1": sat.get("TLE_LINE1", ""),
                            "tle_line2": sat.get("TLE_LINE2", ""),
                            "epoch": sat.get("EPOCH", None),
                            "mean_motion": float(sat.get("MEAN_MOTION", 0)),
                            "eccentricity": float(sat.get("ECCENTRICITY", 0)),
                            "inclination": float(sat.get("INCLINATION", 0)),
                            "raan": float(sat.get("RA_OF_ASC_NODE", 0)),
                            "arg_perigee": float(sat.get("ARG_OF_PERICENTER", 0)),
                            "semi_major_axis": float(sat.get("SEMIMAJOR_AXIS", 0)),
                        })
                except Exception as e:
                    print(f"⚠️ Error processing satellite {sat.get('OBJECT_NAME', 'Unknown')}: {e}")

        else:
            print(f"❌ API error {response.status_code} for batch {i//batch_size + 1}. Retrying in smaller chunks...")

            # ✅ Retry failed batch in smaller chunks (500)
            if batch_size > 500:
                satellites.extend(fetch_tle_data(session, batch, batch_size=500))
            elif batch_size > 250:
                satellites.extend(fetch_tle_data(session, batch, batch_size=250))
            elif batch_size > 100:
                satellites.extend(fetch_tle_data(session, batch, batch_size=100))
            else:
                print(f"⚠️ Skipping batch. API limit likely reached for {batch}")

    # ✅ Identify missing NORADs and retry
    missing_norads = all_norads - fetched_norads
    if missing_norads:
        print(f"⚠️ {len(missing_norads)} NORAD IDs missing from API response. Retrying individually...")

        for norad in missing_norads:
            retry_url = f"https://www.space-track.org/basicspacedata/query/class/gp/NORAD_CAT_ID/{norad}/orderby/EPOCH desc/format/json"
            retry_response = rate_limited_get(session, retry_url)

            if retry_response.status_code == 200 and retry_response.json():
                sat = retry_response.json()[0]
                satellites.append({
                    "norad_number": norad,
                    "name": sat.get("OBJECT_NAME", "Unknown"),
                    "tle_line1": sat.get("TLE_LINE1", ""),
                    "tle_line2": sat.get("TLE_LINE2", ""),
                    "epoch": sat.get("EPOCH", None),
                    "mean_motion": float(sat.get("MEAN_MOTION", 0)),
                    "eccentricity": float(sat.get("ECCENTRICITY", 0)),
                    "inclination": float(sat.get("INCLINATION", 0)),
                    "raan": float(sat.get("RA_OF_ASC_NODE", 0)),
                    "arg_perigee": float(sat.get("ARG_OF_PERICENTER", 0)),
                    "semi_major_axis": float(sat.get("SEMIMAJOR_AXIS", 0)),
                })
                print(f"✅ Successfully retrieved missing NORAD {norad}")
            else:
                print(f"⚠️ Still missing NORAD {norad}. May be inactive or missing data.")

    print(f"✅ Successfully fetched TLE data for {len(satellites)} satellites.")
    return satellites



def fetch_spacetrack_data_batch(session, norad_ids, batch_size=300):
    """
    Fetch satellite metadata with retries for failed requests.
    """
    metadata_dict = {}
    all_norads = set(norad_ids)
    fetched_norads = set()

    print(f"📡 Fetching metadata in batches of {batch_size} satellites...")

    for i in range(0, len(norad_ids), batch_size):
        batch = norad_ids[i:i + batch_size]
        norad_query = ",".join(map(str, batch))
        spacetrack_url = f"https://www.space-track.org/basicspacedata/query/class/satcat/NORAD_CAT_ID/{norad_query}/format/json"

        print(f"📡 Fetching batch {i//batch_size + 1} of {len(norad_ids) // batch_size + 1}...")

        response = rate_limited_get(session, spacetrack_url)

        if response.status_code == 200 and response.json():
            for metadata in response.json():
                try:
                    norad_number = int(metadata.get("NORAD_CAT_ID", -1))
                    fetched_norads.add(norad_number)
                    metadata_dict[norad_number] = {
                        "object_type": metadata.get("OBJECT_TYPE", "Unknown"),
                        "launch_date": metadata.get("LAUNCH") if metadata.get("LAUNCH") != "Unknown" else None,
                        "launch_site": metadata.get("SITE") if metadata.get("SITE") != "Unknown" else None,
                        "decay_date": metadata.get("DECAY") if metadata.get("DECAY") != "Unknown" else None,
                        "rcs": metadata.get("RCSVALUE") if metadata.get("RCSVALUE") != "Unknown" else None,
                        "purpose": infer_purpose(metadata),
                        "country": metadata.get("COUNTRY", "Unknown"),
                    }
                except Exception as e:
                    print(f"⚠️ Error processing metadata for NORAD {norad_number}: {e}")

        else:
            print(f"❌ API error {response.status_code} for batch {i//batch_size + 1}. Retrying...")

            if batch_size > 500:
                metadata_dict.update(fetch_spacetrack_data_batch(session, batch, batch_size=500))
            elif batch_size > 250:
                metadata_dict.update(fetch_spacetrack_data_batch(session, batch, batch_size=250))
            elif batch_size > 100:
                metadata_dict.update(fetch_spacetrack_data_batch(session, batch, batch_size=100))
            else:
                print(f"⚠️ Skipping batch due to repeated errors.")

    print(f"✅ Successfully fetched metadata for {len(metadata_dict)} satellites.")
    return metadata_dict




def infer_purpose(metadata):
    """
    Infers the purpose of the satellite based on its name, type, and operational status.
    """
    name = metadata.get("OBJECT_NAME", "").upper()
    object_type = metadata.get("OBJECT_TYPE", "").upper()
    
    # Communications satellites
    if any(keyword in name for keyword in ["STARLINK", "IRIDIUM", "SES", "INTELSAT", "VIASAT", "EUTELSAT"]):
        return "Communications"

    # Navigation satellites
    if any(keyword in name for keyword in ["GPS", "GLONASS", "GALILEO", "BEIDOU", "NAVSTAR"]):
        return "Navigation"

    # Weather monitoring satellites
    if any(keyword in name for keyword in ["WEATHER", "METEOR", "NOAA", "GOES", "HIMAWARI"]):
        return "Weather Monitoring"

    # Military and reconnaissance satellites
    if any(keyword in name for keyword in ["SPY", "NROL", "RECON", "USA", "KH-11", "ONYX"]):
        return "Military/Reconnaissance"

    # Earth observation satellites
    if any(keyword in name for keyword in ["EARTH", "SENTINEL", "LANDSAT", "TERRA", "AQUA", "SPOT"]):
        return "Earth Observation"

    # Scientific research satellites
    if any(keyword in name for keyword in ["HUBBLE", "JWST", "X-RAY", "FERMI", "GAIA", "KEPLER", "TESS"]):
        return "Scientific Research"

    # Technology demonstration satellites
    if any(keyword in name for keyword in ["EXPERIMENT", "TEST", "TECHNOLOGY", "DEMO"]):
        return "Technology Demonstration"

    # Human spaceflight
    if any(keyword in name for keyword in ["ISS", "CREW", "TIANGONG", "SHENZHOU", "SOYUZ"]):
        return "Human Spaceflight"

    # Default classification based on type
    if object_type == "PAYLOAD":
        return "Unknown Payload"
    if object_type == "R/B":
        return "Rocket Body (Debris)"
    if object_type == "DEB":
        return "Space Debris"

    return "Unknown"










# Extract epoch from TLE Line 1
def extract_epoch(tle_line1):
    """
    Extracts epoch (timestamp) from the first TLE line.
    """
    try:
        year = int(tle_line1[18:20])
        day_of_year = float(tle_line1[20:32])
        year += 2000 if year < 57 else 1900  # Handling 2-digit years
        return datetime(year, 1, 1) + timedelta(days=day_of_year - 1)
    except Exception as e:
        print(f"❌ Error extracting epoch: {e}")
        return None






# Parse TLE Line 1
def parse_tle_line1(tle_line1):
    """
    Extracts NORAD number, International Designator, and Ephemeris Type from TLE Line 1.
    """
    try:
        norad_number = int(tle_line1[2:7].strip())  # Extract NORAD ID
        intl_designator = tle_line1[9:17].strip()  # Extract International Designator
        ephemeris_type = int(tle_line1[62:63].strip())  # Extract Ephemeris Type
        return norad_number, intl_designator, ephemeris_type
    except Exception as e:
        print(f"❌ Error parsing TLE Line 1: {e}")
        return None, None, None




# Parse TLE Line 2
def parse_tle_line2(tle_line2):
    """
    Extracts Mean Motion and Revolution Number from TLE Line 2.
    """
    try:
        mean_motion = float(tle_line2[52:63].strip())  # Extract Mean Motion
        rev_number = int(tle_line2[63:68].strip())  # Extract Revolution Number
        return mean_motion, rev_number
    except Exception as e:
        print(f"❌ Error parsing TLE Line 2: {e}")
        return None, None




# Compute orbital parameters
def compute_orbital_params(name, tle_line1, tle_line2):
    """
    Computes orbital parameters from TLE data.
    Returns a dictionary with computed values, including NORAD number.
    """
    try:
        satellite = EarthSatellite(tle_line1, tle_line2, name, ts)  # Initialize satellite object
        norad_number, intl_designator, ephemeris_type = parse_tle_line1(tle_line1)
        mean_motion, rev_num = parse_tle_line2(tle_line2)
        epoch = extract_epoch(tle_line1)

        # Skyfield calculations
        t = ts.now()
        geocentric = satellite.at(t)
        subpoint = geocentric.subpoint()

        latitude = subpoint.latitude.degrees
        longitude = subpoint.longitude.degrees

        inclination = satellite.model.inclo * (180 / pi)
        eccentricity = satellite.model.ecco
        bstar = satellite.model.bstar
        raan = satellite.model.nodeo * (180 / pi)
        arg_perigee = satellite.model.argpo * (180 / pi)

        # Derived parameters
        mu = 398600.4418  # Earth's standard gravitational parameter (km³/s²)
        period = (1 / mean_motion) * 1440  # Period in minutes
        semi_major_axis = (mu / ((mean_motion * 2 * pi / 86400) ** 2)) ** (1 / 3)
        perigee = semi_major_axis * (1 - eccentricity) - 6378  # km
        apogee = semi_major_axis * (1 + eccentricity) - 6378  # km
        velocity = sqrt(mu * (2 / semi_major_axis - 1 / semi_major_axis))  # km/s
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
            "rev_num": rev_num,
            "latitude": latitude,
            "longitude": longitude
        }
    except Exception as e:
        print(f"❌ Error computing parameters: {e}")
        return None





# Classify orbit type
def classify_orbit_type(perigee, apogee):
    """
    Determines orbit classification based on perigee and apogee altitudes.
    """
    avg_altitude = (perigee + apogee) / 2
    if avg_altitude < 2000:
        return "LEO"  # Low Earth Orbit
    elif 2000 <= avg_altitude < 35786:
        return "MEO"  # Medium Earth Orbit
    elif 35786 <= avg_altitude <= 35792:
        return "GEO"  # Geostationary Orbit
    else:
        return "HEO"  # Highly Elliptical Orbit




def get_existing_norad_numbers():
    """
    Fetches all existing NORAD numbers from the database.
    Returns a set of NORAD numbers.
    """
    conn = get_db_connection()
    cursor = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)  # ✅ Ensure we use a dictionary cursor

    cursor.execute("SELECT norad_number FROM satellites;")
    rows = cursor.fetchall()


    if not rows:
        print("⚠️ No NORAD numbers found in the database!")
        return set()

    norads = {int(row["norad_number"]) for row in rows}  # ✅ Access using column name instead of index

    cursor.close()
    conn.close()
    
    print(f"✅ Found {len(norads)} existing NORAD numbers in the database.")
    return norads






def update_satellite_data():
    """
    Fetch TLE data **ONLY for NORAD IDs in the database**, compute orbital parameters,
    fetch metadata in batches, and insert/update the database efficiently.
    """
    conn = get_db_connection()
    cursor = conn.cursor()
    session = get_spacetrack_session()

    if not session:
        print("❌ Could not authenticate with Space-Track. Exiting update process.")
        return

    # ✅ Fetch existing NORAD numbers
    existing_norads = get_existing_norad_numbers()
    if not existing_norads:
        print("⚠️ No NORAD numbers found in the database. Skipping update.")
        return

    # ✅ Fetch TLE data
    satellites = fetch_tle_data(session, existing_norads)
    print(f"📡 Fetched {len(satellites)} satellites for processing.")

    updated_count, skipped_count = 0, 0
    skipped_satellites = []  # ✅ Store skipped satellites


    # ✅ Fetch metadata in batches to avoid API limits
    metadata_dict = fetch_spacetrack_data_batch(session, list(existing_norads))

    for i, sat in enumerate(tqdm(satellites, desc="🔄 Updating Satellite Data")):
        tle_line1 = sat.get("tle_line1", "").strip()
        tle_line2 = sat.get("tle_line2", "").strip()

        if i % 10 == 0:
            print(f"✅ {i}/{len(satellites)} satellites processed...", flush=True)
        

        # ✅ Compute orbital parameters using TLE data
        params = compute_orbital_params(sat["name"], tle_line1, tle_line2)
        if not params or not params.get("norad_number"):
            print(f"⚠️ Skipping satellite {sat['name']} due to missing computed parameters.")
            skipped_count += 1
            skipped_satellites.append(sat["name"]) 
            continue

        norad = params["norad_number"]
        metadata = metadata_dict.get(norad, {})

        # ✅ Handle missing metadata
        launch_date = metadata.get("launch_date")
        decay_date = metadata.get("decay_date")

        # ✅ Ensure **all required values** are present before insertion
        satellite_data = {
            "name": sat["name"],
            "tle_line1": tle_line1,
            "tle_line2": tle_line2,
            "norad_number": norad,
            "epoch": params["epoch"],
            "inclination": params["inclination"],
            "eccentricity": params["eccentricity"],
            "mean_motion": params["mean_motion"],
            "raan": params["raan"],
            "arg_perigee": params["arg_perigee"],
            "velocity": params["velocity"],
            "latitude": params["latitude"],
            "longitude": params["longitude"],
            "object_type": metadata.get("object_type", "Unknown"),
            "launch_date": launch_date,
            "launch_site": metadata.get("launch_site"),
            "decay_date": decay_date,
            "rcs": metadata.get("rcs"),
            "purpose": metadata.get("purpose"),
            "country": metadata.get("country"),
            "orbit_type": params["orbit_type"],
            "period": params["period"],
            "perigee": params["perigee"],
            "apogee": params["apogee"],
            "semi_major_axis": params["semi_major_axis"],
            "bstar": params["bstar"],
            "rev_num": params["rev_num"],
        }

        print(f"""
🔄 **Processing Satellite Update**:
--------------------------------------------------
🔹 Name: {satellite_data['name']}
🔹 NORAD Number: {satellite_data['norad_number']}
🔹 Object Type: {satellite_data['object_type']}
🔹 Launch Date: {satellite_data['launch_date']}
🔹 Launch Site: {satellite_data['launch_site']}
🔹 RCS: {satellite_data['rcs']}
🔹 Purpose: {satellite_data['purpose']}
🔹 Country: {satellite_data['country']}
🔹 Period: {satellite_data['period']}
🔹 Perigee: {satellite_data['perigee']}
🔹 Apogee: {satellite_data['apogee']}
--------------------------------------------------
        """)

        try:
            # ✅ Insert/Update data in PostgreSQL
            cursor.execute("""
                INSERT INTO satellites (
                    name, tle_line1, tle_line2, norad_number, epoch,
                    inclination, eccentricity, mean_motion, raan, arg_perigee, velocity,
                    latitude, longitude, object_type, launch_date,
                    launch_site, decay_date, rcs, purpose, country, orbit_type,
                    period, perigee, apogee, semi_major_axis, bstar, rev_num
                ) VALUES (
                    %(name)s, %(tle_line1)s, %(tle_line2)s, %(norad_number)s, %(epoch)s,
                    %(inclination)s, %(eccentricity)s, %(mean_motion)s, %(raan)s, %(arg_perigee)s, %(velocity)s,
                    %(latitude)s, %(longitude)s, %(object_type)s, %(launch_date)s,
                    %(launch_site)s, %(decay_date)s, %(rcs)s, %(purpose)s, %(country)s, %(orbit_type)s,
                    %(period)s, %(perigee)s, %(apogee)s, %(semi_major_axis)s, %(bstar)s, %(rev_num)s
                )
                ON CONFLICT (norad_number) DO UPDATE SET
                    tle_line1 = EXCLUDED.tle_line1,
                    tle_line2 = EXCLUDED.tle_line2,
                    epoch = EXCLUDED.epoch,
                    inclination = EXCLUDED.inclination,
                    eccentricity = EXCLUDED.eccentricity,
                    mean_motion = EXCLUDED.mean_motion,
                    raan = EXCLUDED.raan,
                    arg_perigee = EXCLUDED.arg_perigee,
                    velocity = EXCLUDED.velocity,
                    latitude = EXCLUDED.latitude,
                    longitude = EXCLUDED.longitude,
                    object_type = EXCLUDED.object_type,
                    launch_date = EXCLUDED.launch_date,
                    launch_site = EXCLUDED.launch_site,
                    decay_date = EXCLUDED.decay_date,
                    rcs = EXCLUDED.rcs,
                    purpose = EXCLUDED.purpose,
                    country = EXCLUDED.country,
                    orbit_type = EXCLUDED.orbit_type,
                    period = EXCLUDED.period,
                    perigee = EXCLUDED.perigee,
                    apogee = EXCLUDED.apogee,
                    semi_major_axis = EXCLUDED.semi_major_axis,
                    bstar = EXCLUDED.bstar,
                    rev_num = EXCLUDED.rev_num;
            """, satellite_data)

            updated_count += 1

        except Exception as e:
            skipped_count += 1
            print(f"⚠️ Error updating satellite {sat['name']} (NORAD {norad}): {e}")
            conn.rollback()

    conn.commit()
    cursor.close()
    conn.close()
    print(f"✅ {updated_count} satellites inserted/updated successfully. Skipped: {skipped_count}")

    # ✅ Print skipped satellites at the end
    if skipped_satellites:
        print("\n⚠️ **Skipped Satellites:**")
        for sat_name in skipped_satellites:
            print(f"  - {sat_name}")

        # ✅ Optionally write skipped satellites to a log file
        with open("skipped_satellites.log", "w") as log_file:
            log_file.write("\n".join(skipped_satellites))
        print("📝 Skipped satellites saved to **skipped_satellites.log**")



# Run the check
if __name__ == "__main__":
    update_satellite_data()


