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
from math import isfinite

# Load environment variables
load_dotenv()

# Load Skyfield timescale
ts = load.timescale()
SPACETRACK_USER = os.getenv("SPACETRACK_USER")
SPACETRACK_PASS = os.getenv("SPACETRACK_PASS")
COOKIES_FILE = "cookies.txt"  # Ensure this is the correct cookie file path


API_WAIT_TIME = 3  # ✅ Complies with API rate limits

def get_spacetrack_session():
    """Logs in to Space-Track and returns an authenticated session."""
    session = requests.Session()

    # Delete old cookies to force a fresh login
    if os.path.exists(COOKIES_FILE):
        os.remove(COOKIES_FILE)

    login_url = "https://www.space-track.org/ajaxauth/login"
    payload = {"identity": SPACETRACK_USER, "password": SPACETRACK_PASS}

    response = session.post(login_url, data=payload)
    
    print(f"🔍 Login Response Status: {response.status_code}")
    print(f"🔍 Login Response Text: {response.text}")  # ✅ Debugging

    if response.status_code == 200:
        cookie_value = session.cookies.get("chocolatechip")
        if cookie_value:
            print("✅ Space-Track login successful.")
            with open(COOKIES_FILE, "w") as f:
                f.write(cookie_value)
            return session
        else:
            print("❌ Login successful, but no cookie received!")
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




def fetch_tle_data(session, existing_norads, batch_size=500):
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

            # 🔍 Debugging: Print first three responses
            print("\n🔍 API Response Sample (First 3 Satellites):")
            for sat in batch_data[:3]:  # Only print first 3 responses for readability
                print(sat)

            for sat in batch_data:
                try:
                    norad_number = int(sat.get("NORAD_CAT_ID", -1))
                    mean_motion = float(sat.get("MEAN_MOTION", 0)) if sat.get("MEAN_MOTION") else None
                    tle_line1 = sat.get("TLE_LINE1", "").strip()
                    tle_line2 = sat.get("TLE_LINE2", "").strip()

                    # 🚨 **Check for missing critical data**
                    if mean_motion is None or not tle_line1 or not tle_line2:
                        print(f"⚠️ Skipping {sat.get('OBJECT_NAME', 'Unknown')} (NORAD {norad_number}): Missing Mean Motion or TLE data.")
                        continue  # ❌ Skip invalid satellites

                    # 🔎 Print extracted values before appending
                    print(f"\n📡 Extracted Satellite Data - {sat.get('OBJECT_NAME', 'Unknown')} (NORAD {norad_number}):")
                    print(f"   - Mean Motion: {mean_motion}")
                    print(f"   - TLE Line 1: {tle_line1}")
                    print(f"   - TLE Line 2: {tle_line2}")

                    if norad_number > 0:
                        fetched_norads.add(norad_number)
                        satellites.append({
                            "norad_number": norad_number,
                            "name": sat.get("OBJECT_NAME", "Unknown"),
                            "tle_line1": tle_line1,
                            "tle_line2": tle_line2,
                            "epoch": sat.get("EPOCH", None),
                            "mean_motion": mean_motion,
                            "eccentricity": float(sat.get("ECCENTRICITY", 0)) if sat.get("ECCENTRICITY") else None,
                            "inclination": float(sat.get("INCLINATION", 0)) if sat.get("INCLINATION") else None,
                            "raan": float(sat.get("RA_OF_ASC_NODE", 0)) if sat.get("RA_OF_ASC_NODE") else None,
                            "arg_perigee": float(sat.get("ARG_OF_PERICENTER", 0)) if sat.get("ARG_OF_PERICENTER") else None,
                            "semi_major_axis": float(sat.get("SEMIMAJOR_AXIS", 0)) if sat.get("SEMIMAJOR_AXIS") else None,
                        })
                except Exception as e:
                    print(f"⚠️ Error processing satellite {sat.get('OBJECT_NAME', 'Unknown')} (NORAD {norad_number}): {e}")

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
                norad_number = int(sat.get("NORAD_CAT_ID", -1))
                mean_motion = float(sat.get("MEAN_MOTION", 0)) if sat.get("MEAN_MOTION") else None
                tle_line1 = sat.get("TLE_LINE1", "").strip()
                tle_line2 = sat.get("TLE_LINE2", "").strip()

                # 🚨 **Check again for missing critical data before retrying**
                if mean_motion is None or not tle_line1 or not tle_line2:
                    print(f"⚠️ Retried but skipping {sat.get('OBJECT_NAME', 'Unknown')} (NORAD {norad_number}): Missing Mean Motion or TLE data.")
                    continue  # ❌ Skip invalid satellites

                # 🔎 Print extracted values for retry
                print(f"\n📡 Retried Satellite Data - {sat.get('OBJECT_NAME', 'Unknown')} (NORAD {norad_number}):")
                print(f"   - Mean Motion: {mean_motion}")
                print(f"   - TLE Line 1: {tle_line1}")
                print(f"   - TLE Line 2: {tle_line2}")

                satellites.append({
                    "norad_number": norad_number,
                    "name": sat.get("OBJECT_NAME", "Unknown"),
                    "tle_line1": tle_line1,
                    "tle_line2": tle_line2,
                    "epoch": sat.get("EPOCH", None),
                    "mean_motion": mean_motion,
                    "eccentricity": float(sat.get("ECCENTRICITY", 0)) if sat.get("ECCENTRICITY") else None,
                    "inclination": float(sat.get("INCLINATION", 0)) if sat.get("INCLINATION") else None,
                    "raan": float(sat.get("RA_OF_ASC_NODE", 0)) if sat.get("RA_OF_ASC_NODE") else None,
                    "arg_perigee": float(sat.get("ARG_OF_PERICENTER", 0)) if sat.get("ARG_OF_PERICENTER") else None,
                    "semi_major_axis": float(sat.get("SEMIMAJOR_AXIS", 0)) if sat.get("SEMIMAJOR_AXIS") else None,
                })
                print(f"✅ Successfully retrieved missing NORAD {norad}")
            else:
                print(f"⚠️ Still missing NORAD {norad}. May be inactive or missing data.")

    print(f"✅ Successfully fetched TLE data for {len(satellites)} satellites.")
    return satellites






def fetch_spacetrack_data_batch(session, norad_ids, batch_size=500):
    """
    Fetch satellite metadata from Space-Track with retries for failed requests.
    Returns a dictionary mapping NORAD numbers to metadata.
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
            batch_data = response.json()

            # 🔍 Debugging: Print first 3 responses for analysis
            print("\n🔍 API Response Sample (First 3 Satellites):")
            for metadata in batch_data[:3]:  # Only print first 3 responses for readability
                print(metadata)

            for metadata in batch_data:
                try:
                    norad_number = int(metadata.get("NORAD_CAT_ID", -1))

                    if norad_number <= 0:
                        print(f"⚠️ Skipping metadata entry with invalid NORAD {norad_number}: {metadata}")
                        continue  # ❌ Skip invalid entries

                    # ✅ Print extracted values for debugging
                    print(f"\n📡 Extracted Metadata for {metadata.get('OBJECT_NAME', 'Unknown')} (NORAD {norad_number}):")
                    print(f"   - Object Type: {metadata.get('OBJECT_TYPE', 'Unknown')}")
                    print(f"   - Launch Date: {metadata.get('LAUNCH', 'Unknown')}")
                    print(f"   - Launch Site: {metadata.get('SITE', 'Unknown')}")
                    print(f"   - Decay Date: {metadata.get('DECAY', 'Unknown')}")
                    print(f"   - RCS Size: {metadata.get('RCSVALUE', 'Unknown')}")
                    print(f"   - Country: {metadata.get('COUNTRY', 'Unknown')}")

                    metadata_dict[norad_number] = {
                        "object_type": metadata.get("OBJECT_TYPE", "Unknown"),
                        "launch_date": metadata.get("LAUNCH") if metadata.get("LAUNCH") != "Unknown" else None,
                        "launch_site": metadata.get("SITE") if metadata.get("SITE") != "Unknown" else None,
                        "decay_date": metadata.get("DECAY") if metadata.get("DECAY") != "Unknown" else None,
                        "rcs": metadata.get("RCSVALUE") if metadata.get("RCSVALUE") != "Unknown" else None,
                        "purpose": infer_purpose(metadata),
                        "country": metadata.get("COUNTRY", "Unknown"),
                    }
                    fetched_norads.add(norad_number)

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

    # ✅ Identify missing NORADs and retry
    missing_norads = all_norads - fetched_norads
    if missing_norads:
        print(f"⚠️ {len(missing_norads)} NORAD IDs missing from metadata response. Retrying individually...")

        for norad in missing_norads:
            retry_url = f"https://www.space-track.org/basicspacedata/query/class/satcat/NORAD_CAT_ID/{norad}/format/json"
            retry_response = rate_limited_get(session, retry_url)

            if retry_response.status_code == 200 and retry_response.json():
                metadata = retry_response.json()[0]
                norad_number = int(metadata.get("NORAD_CAT_ID", -1))

                if norad_number > 0:
                    print(f"\n📡 Retried Metadata for {metadata.get('OBJECT_NAME', 'Unknown')} (NORAD {norad_number}):")
                    print(f"   - Object Type: {metadata.get('OBJECT_TYPE', 'Unknown')}")
                    print(f"   - Launch Date: {metadata.get('LAUNCH', 'Unknown')}")
                    print(f"   - Launch Site: {metadata.get('SITE', 'Unknown')}")
                    print(f"   - Decay Date: {metadata.get('DECAY', 'Unknown')}")
                    print(f"   - RCS Size: {metadata.get('RCSVALUE', 'Unknown')}")
                    print(f"   - Country: {metadata.get('COUNTRY', 'Unknown')}")

                    metadata_dict[norad_number] = {
                        "object_type": metadata.get("OBJECT_TYPE", "Unknown"),
                        "launch_date": metadata.get("LAUNCH") if metadata.get("LAUNCH") != "Unknown" else None,
                        "launch_site": metadata.get("SITE") if metadata.get("SITE") != "Unknown" else None,
                        "decay_date": metadata.get("DECAY") if metadata.get("DECAY") != "Unknown" else None,
                        "rcs": metadata.get("RCSVALUE") if metadata.get("RCSVALUE") != "Unknown" else None,
                        "purpose": infer_purpose(metadata),
                        "country": metadata.get("COUNTRY", "Unknown"),
                    }
                    print(f"✅ Successfully retrieved missing metadata for NORAD {norad_number}")

            else:
                print(f"⚠️ Still missing metadata for NORAD {norad}. May be inactive or missing data.")

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



from math import isfinite, sqrt, pi
from skyfield.api import EarthSatellite



def parse_tle_line2(tle_line2):
    """
    Extracts Mean Motion and Revolution Number from TLE Line 2.
    """
    try:
        mean_motion = float(tle_line2[52:63].strip())  # Extract Mean Motion
        rev_number = int(tle_line2[63:68].strip())  # Extract Revolution Number

        # 🔍 Debugging: Print extracted values
        print(f"🔎 Parsed Mean Motion: {mean_motion}, Rev Number: {rev_number}")

        if not isfinite(mean_motion) or mean_motion <= 0:
            print(f"⚠️ Invalid Mean Motion ({mean_motion}), skipping.")
            return None, None
        return mean_motion, rev_number

    except Exception as e:
        print(f"❌ Error parsing TLE Line 2: {e}")
        return None, None




def compute_orbital_params(name, tle_line1, tle_line2, ts):
    try:
        if not tle_line1 or not tle_line2:
            print(f"⚠️ Skipping {name}: Missing TLE data")
            return None
        
        # 🚀 Initialize Satellite Object
        satellite = EarthSatellite(tle_line1, tle_line2, name, ts)

        # 🔍 Extract Orbital Parameters
        norad_number, intl_designator, ephemeris_type = parse_tle_line1(tle_line1)
        mean_motion, rev_num = parse_tle_line2(tle_line2)
        epoch = extract_epoch(tle_line1)

        # 🔎 Debugging Prints: Check Values Before Processing
        print(f"\n🔍 Checking values for {name} (NORAD {norad_number}):")
        print(f"   - Mean Motion: {mean_motion}")
        print(f"   - Epoch: {epoch}")
        
        if mean_motion is None or not isfinite(mean_motion) or mean_motion <= 0:
            print(f"⚠️ Skipping {name} (NORAD {norad_number}): No valid mean_motion.")
            return None

        # ✅ **Check for bad values**
        bad_values = []
        if not isfinite(satellite.model.inclo):
            bad_values.append("inclination")
        if not isfinite(satellite.model.ecco):
            bad_values.append("eccentricity")
        if not isfinite(satellite.model.nodeo):
            bad_values.append("raan")
        if not isfinite(satellite.model.argpo):
            bad_values.append("arg_perigee")
        if not isfinite(satellite.model.bstar):
            bad_values.append("bstar")

        if bad_values:
            print(f"⚠️ Skipping {name} (NORAD {norad_number}): Bad values: {', '.join(bad_values)}")
            return None  # ❌ Skip if any required parameter is bad

        # ✅ **Compute Derived Parameters**
        inclination = satellite.model.inclo * (180 / pi)
        eccentricity = satellite.model.ecco
        bstar = satellite.model.bstar
        raan = satellite.model.nodeo * (180 / pi)
        arg_perigee = satellite.model.argpo * (180 / pi)

        # **Orbital Mechanics Constants**
        mu = 398600.4418  # Earth's gravitational parameter (km³/s²)

        # ✅ **Compute Period**
        if mean_motion > 0:
            period = (1 / mean_motion) * 1440  # Convert rev/day to minutes
        else:
            print(f"⚠️ Skipping {name} (NORAD {norad_number}): Invalid period.")
            return None

        # ✅ **Compute Semi-Major Axis**
        try:
            semi_major_axis = (mu / ((mean_motion * 2 * pi / 86400) ** 2)) ** (1 / 3)
        except Exception as e:
            print(f"⚠️ Skipping {name} (NORAD {norad_number}): Unable to compute semi-major axis: {e}")
            return None
        
        # 🔎 Debugging Prints: Check Semi-Major Axis
        print(f"   - Semi-Major Axis: {semi_major_axis} km")

        if not isfinite(semi_major_axis) or semi_major_axis <= 0:
            print(f"⚠️ Skipping {name} (NORAD {norad_number}): Invalid semi-major axis ({semi_major_axis})")
            return None

        # ✅ **Compute Perigee, Apogee**
        perigee = semi_major_axis * (1 - eccentricity) - 6378  # Earth radius subtracted
        apogee = semi_major_axis * (1 + eccentricity) - 6378

        # ✅ **Compute Velocity**
        try:
            velocity = sqrt(mu / semi_major_axis)
        except Exception as e:
            print(f"⚠️ Skipping {name} (NORAD {norad_number}): Unable to compute velocity: {e}")
            return None
        
        # 🔎 Debugging Prints: Check Velocity
        print(f"   - Velocity: {velocity} km/s")

        if not isfinite(velocity) or velocity <= 0:
            print(f"⚠️ Skipping {name} (NORAD {norad_number}): Bad velocity ({velocity})")
            return None

        # ✅ **Classify Orbit**
        orbit_type = classify_orbit_type(perigee, apogee)

        # ✅ **Compute Latitude & Longitude**
        try:
            geocentric = satellite.at(ts.now())  # Get satellite position
            subpoint = geocentric.subpoint()  # Get ground subpoint
            latitude = subpoint.latitude.degrees
            longitude = subpoint.longitude.degrees
        except Exception as e:
            print(f"⚠️ Could not determine latitude/longitude for {name} (NORAD {norad_number}): {e}")
            latitude, longitude = None, None

        # 🔎 Debugging Prints: Check Computed Values
        print(f"   - Orbit Type: {orbit_type}")
        print(f"   - Latitude: {latitude}")
        print(f"   - Longitude: {longitude}")

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
            "latitude": latitude,  # ✅ Added Latitude
            "longitude": longitude  # ✅ Added Longitude
        }

    except Exception as e:
        print(f"❌ Error computing parameters for {name}: {e}")
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



def get_max_norad_number():
    """
    Fetches the highest NORAD number from the database.
    Returns the max NORAD number or 0 if no satellites exist.
    """
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("SELECT MAX(norad_number) AS max_norad FROM satellites;")
    result = cursor.fetchone()  # Fetch result safely

    cursor.close()
    conn.close()

    # ✅ Handle case where no rows exist
    max_norad = result["max_norad"] if result and result["max_norad"] is not None else 0

    print(f"✅ Highest NORAD in the database: {max_norad}")
    return max_norad





def fetch_all_spacetrack_norads(session, batch_size=500):
    """
    Fetches all NORAD numbers available on Space-Track.
    Returns a set of NORAD numbers.
    """
    spacetrack_url = f"https://www.space-track.org/basicspacedata/query/class/satcat/format/json"
    all_norads = set()

    print("📡 Fetching all NORAD numbers from Space-Track...")

    response = rate_limited_get(session, spacetrack_url)

    if response.status_code == 200 and response.json():
        for metadata in response.json():
            try:
                norad_number = int(metadata.get("NORAD_CAT_ID", -1))
                if norad_number > 0:
                    all_norads.add(norad_number)
            except Exception as e:
                print(f"⚠️ Error processing NORAD {metadata.get('NORAD_CAT_ID', 'Unknown')}: {e}")
    
        print(f"✅ Successfully fetched {len(all_norads)} NORAD numbers from Space-Track.")
    else:
        print(f"❌ API error {response.status_code} while fetching NORAD numbers.")

    return all_norads






def fetch_new_payload_norads(session, max_norad):
    """
    Fetches NORAD numbers **ONLY for new payload satellites**
    that have NORAD numbers greater than max_norad.
    Returns a set of new NORAD numbers.
    """
    spacetrack_url = f"https://www.space-track.org/basicspacedata/query/class/satcat/format/json"

    print(f"📡 Fetching new payload satellites with NORAD > {max_norad}...")

    response = rate_limited_get(session, spacetrack_url)

    new_norads = set()

    if response.status_code == 200 and response.json():
        for metadata in response.json():
            try:
                norad_number = int(metadata.get("NORAD_CAT_ID", -1))
                
                # ✅ Only add NORADs greater than max_norad
                if norad_number > max_norad:
                    new_norads.add(norad_number)
            except Exception as e:
                print(f"⚠️ Error processing NORAD {metadata.get('NORAD_CAT_ID', 'Unknown')}: {e}")

        print(f"✅ Successfully found {len(new_norads)} new payload NORADs.")
    else:
        print(f"❌ API error {response.status_code} while fetching new payload NORADs.")

    return new_norads





def fetch_new_payload_norads(session, max_norad):
    """
    Fetches NORAD numbers **ONLY for new payload satellites**
    that have NORAD numbers greater than max_norad.
    Returns a set of new NORAD numbers.
    """
    spacetrack_url = f"https://www.space-track.org/basicspacedata/query/class/satcat/format/json"

    print(f"📡 Fetching new payload satellites with NORAD > {max_norad}...")

    response = rate_limited_get(session, spacetrack_url)

    new_norads = set()

    if response.status_code == 200 and response.json():
        for metadata in response.json():
            try:
                norad_number = int(metadata.get("NORAD_CAT_ID", -1))
                
                # ✅ Only add NORADs greater than max_norad
                if norad_number > max_norad:
                    new_norads.add(norad_number)
            except Exception as e:
                print(f"⚠️ Error processing NORAD {metadata.get('NORAD_CAT_ID', 'Unknown')}: {e}")

        print(f"✅ Successfully found {len(new_norads)} new payload NORADs.")
    else:
        print(f"❌ API error {response.status_code} while fetching new payload NORADs.")

    return new_norads


def update_satellite_data():
    """
    Fetch TLE data **ONLY for NORADs in the database**, 
    fetch **new payloads (NORADs > current max NORAD)**,
    and update SATCAT data **only for new payloads**.
    """
    conn = get_db_connection()
    cursor = conn.cursor()
    session = get_spacetrack_session()

    if not session:
        print("❌ Could not authenticate with Space-Track. Exiting update process.")
        return

    # ✅ Fetch existing NORAD numbers
    existing_norads = get_existing_norad_numbers()
    max_norad = get_max_norad_number()

    if not existing_norads:
        print("⚠️ No NORAD numbers found in the database. Skipping update.")
        return

    # ✅ Fetch TLE data **ONLY for existing NORADs**
    existing_tles = fetch_tle_data(session, existing_norads)
    print(f"📡 Fetched TLE data for {len(existing_tles)} existing satellites.")

    # ✅ Update existing satellites' TLEs in the database
    for tle in existing_tles:
        norad = tle["norad_number"]
        tle_line1, tle_line2 = tle["tle_line1"], tle["tle_line2"]
        ephemeris_type = tle.get("ephemeris_type", 0)  # Default to 0 if missing
        params = compute_orbital_params(f"Existing NORAD {norad}", tle_line1, tle_line2, ts)

        if not params:
            print(f"⚠️ Skipping NORAD {norad}: Could not compute parameters")
            continue

        try:
            cursor.execute("""
                UPDATE satellites
                SET tle_line1 = %(tle_line1)s, 
                    tle_line2 = %(tle_line2)s, 
                    epoch = %(epoch)s, 
                    mean_motion = %(mean_motion)s, 
                    inclination = %(inclination)s, 
                    eccentricity = %(eccentricity)s, 
                    raan = %(raan)s, 
                    arg_perigee = %(arg_perigee)s, 
                    velocity = %(velocity)s, 
                    latitude = %(latitude)s, 
                    longitude = %(longitude)s, 
                    orbit_type = %(orbit_type)s, 
                    period = %(period)s, 
                    perigee = %(perigee)s, 
                    apogee = %(apogee)s, 
                    semi_major_axis = %(semi_major_axis)s, 
                    bstar = %(bstar)s, 
                    rev_num = %(rev_num)s, 
                    ephemeris_type = %(ephemeris_type)s
                WHERE norad_number = %(norad_number)s;
            """, {
                "tle_line1": tle_line1,
                "tle_line2": tle_line2,
                "norad_number": norad,
                "ephemeris_type": ephemeris_type,  # ✅ Added ephemeris type
                **params  # Unpacking computed orbital parameters
            })

        except Exception as e:
            print(f"⚠️ Error updating NORAD {norad}: {e}")
            conn.rollback()

    conn.commit()
    print(f"✅ Updated TLE data for {len(existing_tles)} satellites.")

    # ✅ Fetch new payload NORADs **ONLY if they are greater than max_norad**
    new_norads = fetch_new_payload_norads(session, max_norad)
    print(f"🚀 Found {len(new_norads)} new payload satellites to be added.")

    if not new_norads:
        print("✅ No new satellites to add. Skipping new satellite processing.")
        return

    # ✅ Fetch metadata **only for new payloads**
    new_satellites_metadata = fetch_spacetrack_data_batch(session, list(new_norads))

    # ✅ Fetch TLEs for new satellites
    new_satellites_tles = fetch_tle_data(session, new_norads)

    # ✅ Merge TLE & Metadata (with additional safety checks)
    new_satellites = []
    for norad in new_norads:
        metadata = new_satellites_metadata.get(norad, {})

        # ✅ Find TLE for this NORAD
        tle = next((tle for tle in new_satellites_tles if tle["norad_number"] == norad), None)

        if not tle:
            print(f"⚠️ No TLE found for {metadata.get('name', 'Unknown')} (NORAD {norad}) - Retrying fetch...")
            retry_tle = fetch_tle_data(session, {norad})  # ✅ Retry fetching for this specific NORAD

            if retry_tle:
                tle = retry_tle[0]
                print(f"✅ Retried and found TLE for {metadata.get('name', 'Unknown')} (NORAD {norad})")
            else:
                print(f"❌ Still no TLE for {metadata.get('name', 'Unknown')} (NORAD {norad}) - Skipping.\n")
                continue  # ❌ Skip satellites without TLE data

        # ✅ Compute orbital parameters
        tle_line1, tle_line2 = tle["tle_line1"], tle["tle_line2"]
        ephemeris_type = tle.get("ephemeris_type", 0)  # Default to 0 if missing
        params = compute_orbital_params(metadata.get("name", "Unknown"), tle_line1, tle_line2, ts)

        if not params or any(v is None for v in params.values()):
            print(f"⚠️ Skipping {metadata.get('name', 'Unknown')} (NORAD {norad}): Missing computed parameters")
            continue

        # ✅ Merge metadata, TLE, and computed orbital parameters
        merged_data = {**metadata, **tle, **params, "ephemeris_type": ephemeris_type} if metadata and tle else None

        # ✅ Ensure required fields exist before appending
        if merged_data and all(merged_data.get(k) is not None for k in ["norad_number", "tle_line1", "tle_line2", "velocity"]):
            new_satellites.append(merged_data)
        else:
            print(f"❌ Skipping {metadata.get('name', 'Unknown')} (NORAD {norad}): Missing required data")

    print(f"✅ {len(new_satellites)} new satellites with valid TLEs will be added.")

    # ✅ Insert only new satellites (with valid TLEs)
    for sat in tqdm(new_satellites, desc="🚀 Adding new payload satellites"):
        if "R/B" in sat["name"] or "DEB" in sat["name"]:  # ✅ Skip debris
            print(f"🗑️ Skipping debris: {sat['name']} (NORAD {sat['norad_number']})")
            continue

        norad = sat.get("norad_number")

        try:
            # ✅ Insert new satellite with full metadata & TLE
            cursor.execute("""
                INSERT INTO satellites (name, tle_line1, tle_line2, norad_number, epoch,
                                       inclination, eccentricity, mean_motion, raan, arg_perigee, velocity,
                                       latitude, longitude, orbit_type, period, perigee, apogee,
                                       semi_major_axis, bstar, rev_num, ephemeris_type, object_type, 
                                       launch_date, launch_site, decay_date, rcs, purpose, country)
                VALUES (%(name)s, %(tle_line1)s, %(tle_line2)s, %(norad_number)s, %(epoch)s,
                        %(inclination)s, %(eccentricity)s, %(mean_motion)s, %(raan)s, %(arg_perigee)s, 
                        %(velocity)s, %(latitude)s, %(longitude)s, %(orbit_type)s, %(period)s, 
                        %(perigee)s, %(apogee)s, %(semi_major_axis)s, %(bstar)s, %(rev_num)s, 
                        %(ephemeris_type)s, %(object_type)s, %(launch_date)s, %(launch_site)s, 
                        %(decay_date)s, %(rcs)s, %(purpose)s, %(country)s)
                ON CONFLICT (norad_number) DO NOTHING;
            """, sat)

        except Exception as e:
            print(f"⚠️ Error inserting new satellite {sat['name']} (NORAD {norad}): {e}")
            conn.rollback()

    conn.commit()
    cursor.close()
    conn.close()

    print(f"✅ {len(new_satellites)} new satellites added successfully.")


if __name__ == "__main__":
    update_satellite_data()
