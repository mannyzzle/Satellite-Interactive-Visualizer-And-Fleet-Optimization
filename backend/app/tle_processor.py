# /backend/app/tle_processor.py

import csv
import psycopg2
from skyfield.api import load
from tqdm import tqdm
from datetime import datetime, timedelta
from dotenv import load_dotenv
import os
import requests
import time
from database import get_db_connection  # ✅ Use get_db_connection()
from math import isfinite, sqrt, pi
import json
from tempfile import NamedTemporaryFile
import numpy as np  # For NaN detection
from concurrent.futures import ThreadPoolExecutor
from sgp4.api import Satrec, WGS72
from datetime import datetime, timezone
import traceback
# Astropy imports (for coordinate frames)
from astropy.coordinates import TEME, ITRS
from astropy import units as u
from astropy.time import Time
import math
ts = load.timescale()
eph = load('de421.bsp')
earth = eph['earth']
MU = 398600.4418  # Earth's standard gravitational parameter (km^3/s^2)
R_EARTH = 6378.137  # Earth's equatorial radius (km)
# Load environment variables
load_dotenv()
# Load Skyfield timescale
ts = load.timescale()
SPACETRACK_USER = os.getenv("SPACETRACK_USER")
SPACETRACK_PASS = os.getenv("SPACETRACK_PASS")
COOKIES_FILE = "cookies.txt"  # Ensure this is the correct cookie file path
TLE_FILE_PATH = "tle_latest.json"  # ✅ Store TLE data locally
CDM_API_URL = "https://www.space-track.org/basicspacedata/query/class/cdm_public/format/json"
# ✅ Batch size for inserting satellites
BATCH_SIZE = 5000  
API_WAIT_TIME = 3  # ✅ Complies with API rate limits
EARTH_RADIUS_KM = 6371 







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





def remove_expired_cdms():
    """Deletes CDM events with TCA (Time of Closest Approach) in the past."""
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("DELETE FROM cdm_events WHERE tca < NOW();")
    deleted_count = cursor.rowcount  # Count rows deleted
    conn.commit()
    cursor.close()
    conn.close()

    print(f"🗑️ Removed {deleted_count} expired CDM events.")


def fetch_cdm_data(session):
    """Fetches the latest CDM data from Space-Track."""
    response = session.get(CDM_API_URL)

    if response.status_code != 200:
        print(f"❌ API Error {response.status_code}: Unable to fetch CDM data.")
        return []

    cdm_data = response.json()
    print(f"📡 Retrieved {len(cdm_data)} CDM records from Space-Track.")

    return cdm_data


def safe_float(value):
    """Convert value to float if possible, else return None for SQL compatibility."""
    try:
        return float(value) if value not in [None, ""] else None
    except ValueError:
        return None

def insert_new_cdms(cdm_data):
    """Inserts new CDM events into the database, avoiding duplicates and ensuring required fields."""
    if not cdm_data:
        print("⚠️ No new CDM events to insert.")
        return

    conn = get_db_connection()
    cursor = conn.cursor()

    print(f"📥 Inserting {len(cdm_data)} new CDM events...")

    for cdm in tqdm(cdm_data, desc="📡 Processing CDM data", unit="CDM"):
        try:
            # Extract required fields
            required_fields = {
                "CDM_ID": int(cdm.get("CDM_ID", -1)),
                "CREATED": cdm.get("CREATED"),
                "TCA": cdm.get("TCA"),
                "MIN_RNG": safe_float(cdm.get("MIN_RNG")),
                "PC": safe_float(cdm.get("PC")),
                "SAT_1_ID": int(cdm.get("SAT_1_ID", -1)),
                "SAT_1_NAME": cdm.get("SAT_1_NAME", "Unknown"),
                "SAT1_OBJECT_TYPE": cdm.get("SAT1_OBJECT_TYPE", "Unknown"),
                "SAT_2_ID": int(cdm.get("SAT_2_ID", -1)),
                "SAT_2_NAME": cdm.get("SAT_2_NAME", "Unknown"),
                "SAT2_OBJECT_TYPE": cdm.get("SAT2_OBJECT_TYPE", "Unknown"),
                "EMERGENCY_REPORTABLE": True if cdm.get("EMERGENCY_REPORTABLE") == "Y" else False
            }

            # Ensure all required columns are non-null
            if None in required_fields.values():
                print(f"⚠️ Skipping incomplete CDM ID {required_fields['CDM_ID']} due to missing required fields.")
                continue

            # Extract optional fields with default values
            optional_fields = {
                "SAT1_RCS": cdm.get("SAT1_RCS", "Unknown"),
                "SAT_1_EXCL_VOL": safe_float(cdm.get("SAT_1_EXCL_VOL")) or 0.0,  # Default to 0.0
                "SAT2_RCS": cdm.get("SAT2_RCS", "Unknown"),
                "SAT_2_EXCL_VOL": safe_float(cdm.get("SAT_2_EXCL_VOL")) or 0.0  # Default to 0.0
            }

            # Merge required and optional fields
            cdm_entry = {**required_fields, **optional_fields}

            # Insert into database
            cursor.execute("""
                INSERT INTO cdm_events (
                    cdm_id, created, tca, min_rng, pc, 
                    sat_1_id, sat_1_name, sat_1_type, sat_1_rcs, sat_1_excl_vol,
                    sat_2_id, sat_2_name, sat_2_type, sat_2_rcs, sat_2_excl_vol,
                    emergency_reportable, is_active
                )
                VALUES (
                    %(CDM_ID)s, %(CREATED)s, %(TCA)s, %(MIN_RNG)s, %(PC)s,
                    %(SAT_1_ID)s, %(SAT_1_NAME)s, %(SAT1_OBJECT_TYPE)s, %(SAT1_RCS)s, %(SAT_1_EXCL_VOL)s,
                    %(SAT_2_ID)s, %(SAT_2_NAME)s, %(SAT2_OBJECT_TYPE)s, %(SAT2_RCS)s, %(SAT_2_EXCL_VOL)s,
                    %(EMERGENCY_REPORTABLE)s, FALSE
                )
                ON CONFLICT (cdm_id) DO NOTHING;
            """, cdm_entry)

        except Exception as e:
            print(f"⚠️ Error inserting CDM ID {cdm.get('CDM_ID', 'Unknown')}: {e}")

    conn.commit()
    cursor.close()
    conn.close()

    print(f"✅ Inserted valid CDM events.")



def update_cdm_data():
    """Main function to update CDM data: remove expired & insert new."""
    print("\n🚀 Updating CDM data...")
    session = get_spacetrack_session()
    
    if not session:
        print("❌ Could not authenticate with Space-Track. Exiting update process.")
        return

    # Step 1: Remove expired CDM events
    remove_expired_cdms()

    # Step 2: Fetch latest CDM data
    cdm_data = fetch_cdm_data(session)

    # Step 3: Insert new CDMs
    insert_new_cdms(cdm_data)

    print("✅ CDM update completed.\n")





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



def serialize_datetime(obj):
    """Convert datetime objects to ISO format strings."""
    if isinstance(obj, datetime):
        return obj.isoformat()
    raise TypeError(f"Type {type(obj)} not serializable")



def fetch_tle_data(session, existing_norads):
    """
    Fetches the latest TLE data **only once per hour** and filters for existing NORADs.
    Handles first-time fetch when the file doesn't exist.
    """
    if not existing_norads:
        print("⚠️ No existing NORAD numbers found. Skipping TLE fetch.")
        return []

    # ✅ Check if the TLE file exists and is recent (<1 hour old)
    if os.path.exists(TLE_FILE_PATH):
        try:
            with open(TLE_FILE_PATH, "r") as file:
                tle_data = json.load(file)

            # ✅ If file is <1 hour old, use it instead of fetching again
            if time.time() - tle_data["timestamp"] < 3600:
                print("📡 Using cached TLE data (Last Updated: < 1 hour ago)")
                satellites = tle_data["satellites"]
                return filter_satellites(satellites, existing_norads)
        except (json.JSONDecodeError, KeyError):
            print("⚠️ TLE file is corrupt or incomplete. Fetching fresh data...")

    # ✅ **First fetch or expired file → Download fresh TLE data**
    print("📡 Fetching latest TLE data from Space-Track...")

    tle_url = "https://www.space-track.org/basicspacedata/query/class/gp/orderby/EPOCH%20desc/format/json"


    response = session.get(tle_url)

    if response.status_code == 200:
        satellites = response.json()

        # ✅ Compute orbital parameters for each satellite
        for sat in satellites:
            sat["computed_params"] = compute_orbital_params(
                sat.get("OBJECT_NAME", "Unknown"),
                sat.get("TLE_LINE1", ""),
                sat.get("TLE_LINE2", "")
            )

        # ✅ Convert `datetime` objects before saving JSON
        with open(TLE_FILE_PATH, "w") as file:
            json.dump({"timestamp": time.time(), "satellites": satellites}, file, default=serialize_datetime)

        print(f"✅ Downloaded and processed TLE data for {len(satellites)} satellites.")
        return filter_satellites(satellites, existing_norads)
    else:
        print(f"❌ API error {response.status_code}. Could not fetch TLE data.")
        return []





def compute_sgp4_position(tle_line1, tle_line2):
    """
    Computes the current satellite latitude and longitude using python-sgp4,
    and transforms TEME coordinates into geodetic coordinates using Astropy.
    """
    try:
        #print(f"\n🔍 [DEBUG] Processing Satellite TLE")
        #print(f"   ↳ TLE1: {tle_line1}")
        #print(f"   ↳ TLE2: {tle_line2}")
        

        # Validate TLE lines
        if not tle_line1 or not tle_line2:
            print("❌ [ERROR] Missing TLE lines!")
            return None, None, None

        # Create a Satrec object from TLE lines
        try:
            satrec = Satrec.twoline2rv(tle_line1, tle_line2, WGS72)
        except Exception as e:
            print(f"❌ [ERROR] Invalid TLE or parse failure: {e}")
            return None, None, None

        # Get current UTC time and create an Astropy Time object
        now = datetime.utcnow()
        #print(f"✅ [DEBUG] Current UTC time: {now}")
        obstime = Time(now, scale='utc')

        # Get total Julian Date from Astropy; split into integer and fractional parts
        jd_total = obstime.jd
        jd = math.floor(jd_total)
        fr = jd_total - jd

        # Run SGP4 propagation to get TEME coordinates (km)
        error_code, r, v = satrec.sgp4(jd, fr)
        if error_code != 0:
            print(f"❌ [ERROR] SGP4 propagation error code: {error_code}")
            return None, None, None

        # r is in TEME coordinates (km)
        # Create a TEME coordinate using Astropy with the SGP4 output
        teme_coord = TEME(
            x=r[0] * u.km,
            y=r[1] * u.km,
            z=r[2] * u.km,
            obstime=obstime
        )

        # Transform TEME to ITRS (Earth-fixed coordinate frame)
        itrs_coord = teme_coord.transform_to(ITRS(obstime=obstime))

        # Extract geodetic latitude, longitude, and altitude
        lat_deg = itrs_coord.earth_location.lat.to(u.deg).value
        lon_deg = itrs_coord.earth_location.lon.to(u.deg).value
        alt_km  = itrs_coord.earth_location.height.to(u.km).value

        #print(f"✅ [DEBUG] Computed Current lat/lon: ({lat_deg}, {lon_deg}), altitude: {alt_km} km")

        # Sanity checks on computed lat/lon
        if lat_deg is None or lon_deg is None:
            print("❌ [ERROR] Computed lat/lon are None!")
            return None, None, None

        if abs(lat_deg) > 90 or abs(lon_deg) > 180:
            print(f"❌ [ERROR] Computed lat/lon out of bounds! lat={lat_deg}, lon={lon_deg}")
            return None, None, None

        return lat_deg, lon_deg, alt_km

    except Exception as e:
        print(f"⚠️ [ERROR] SGP4 computation failed: {e}")
        traceback.print_exc()
        return None, None, None



def fetch_lat_lon(computed_params):
    """ Fetch latitude and longitude if missing or NaN. """
    try:
        if computed_params is None:
            return

        print(f"🛠️ Debug BEFORE lat/lon computation: {computed_params}")
        tle_line1 = computed_params.get("tle_line1")
        tle_line2 = computed_params.get("tle_line2")

        # ✅ Ensure we don't overwrite existing valid values
        if computed_params.get("latitude") is not None and computed_params.get("longitude") is not None:
            print("✅ Latitude and longitude already exist, skipping recomputation.")
            return  # ✅ Already has valid values, no need to compute again

        print(f"🌍 Computing new lat/lon for NORAD {computed_params.get('norad_number', 'Unknown')}")
        latitude, longitude, altitude_km = compute_sgp4_position(tle_line1, tle_line2)

        # ✅ Ensure computed values are not None before updating
        if latitude is not None and longitude is not None and altitude_km is not None:
            computed_params["latitude"] = latitude
            computed_params["longitude"] = longitude
            computed_params["altitude_km"] = altitude_km
            #print(f"✅ Debug AFTER lat/lon computation: {computed_params}")
        else:
            print(f"⚠️ Geodetic computation failed for NORAD {computed_params.get('norad_number', 'Unknown')}")

    except Exception as e:
        print(f"⚠️ Error fetching lat/lon: {e}")


def parse_datetime(date_str):
    """Safely parse a datetime string to a datetime object (UTC) or return None if invalid."""
    if not date_str or date_str in ["Unknown", ""]:
        return None
    try:
        return datetime.strptime(date_str, "%Y-%m-%dT%H:%M:%S.%f").replace(tzinfo=timezone.utc)
    except ValueError:
        try:
            return datetime.strptime(date_str, "%Y-%m-%dT%H:%M:%S").replace(tzinfo=timezone.utc)
        except ValueError:
            return None  # Return None if parsing fails





def filter_satellites(satellites, existing_norads):
    """
    Filters the downloaded TLE dataset to:
    - Keep satellites in our database
    - Store additional metadata fields
    - Prevent duplicates (NORADs)
    - Ignore satellites with NaN lat/lon
    """
    filtered_satellites = []
    existing_norads_set = set(existing_norads)
    seen_norads = set()  # ✅ Track added NORADs

    for sat in satellites:
        try:
            norad_number = int(sat.get("NORAD_CAT_ID", -1))
            metadata = sat  

            # 🚀 **Skip if NORAD already processed**
            if norad_number in seen_norads:
                print(f"⚠️ Skipping duplicate NORAD {norad_number}: {metadata.get('OBJECT_NAME', 'Unknown')}")
                continue

            tle_line1 = sat.get("TLE_LINE1", "").strip()
            tle_line2 = sat.get("TLE_LINE2", "").strip()

            # ✅ Ensure `computed_params` exists and references the right object
            if "computed_params" not in sat or sat["computed_params"] is None:
                sat["computed_params"] = {}  # ✅ Ensure it exists
            computed_params = sat["computed_params"]  # ✅ Maintain the reference

            # ✅ **Fallback to metadata if computed_params is missing or incomplete**
            if not computed_params or computed_params.get("latitude") is None or computed_params.get("longitude") is None or computed_params.get("altitude_km") is None:
                print(f"⚠️ Using metadata to compute parameters for {metadata.get('OBJECT_NAME', 'Unknown')} (NORAD {norad_number})")

                # ✅ Extract required parameters, falling back to metadata
                computed_params.update({
                    "tle_line1": tle_line1,
                    "tle_line2": tle_line2,
                    "norad_number": int(metadata.get("NORAD_CAT_ID", -1)),
                    "intl_designator": metadata.get("OBJECT_ID", "Unknown"),
                    "ephemeris_type": int(metadata.get("EPHEMERIS_TYPE", 0)),
                    "epoch": metadata.get("EPOCH", None),
                    "inclination": float(metadata.get("INCLINATION", 0.0)),
                    "eccentricity": float(metadata.get("ECCENTRICITY", 0.0)),
                    "mean_motion": float(metadata.get("MEAN_MOTION", 0.0)),
                    "raan": float(metadata.get("RA_OF_ASC_NODE", 0.0)),
                    "arg_perigee": float(metadata.get("ARG_OF_PERICENTER", 0.0)),
                    "period": float(metadata.get("PERIOD", 0.0)),
                    "semi_major_axis": float(metadata.get("SEMIMAJOR_AXIS", 0.0)),
                    "perigee": float(metadata.get("PERIAPSIS", 0.0)),
                    "apogee": float(metadata.get("APOAPSIS", 0.0)),
                    "velocity": math.sqrt(MU / computed_params["semi_major_axis"]) if math.isfinite(computed_params["semi_major_axis"]) else None,
                    "orbit_type": classify_orbit_type(computed_params["perigee"], computed_params["apogee"]),
                    "bstar": float(metadata.get("BSTAR", 0.0)),
                    "rev_num": int(metadata.get("REV_AT_EPOCH", 0)),
                    "latitude": None,
                    "longitude": None,
                    "altitude_km": None
                })

                # ✅ Compute latitude, longitude, altitude & modify in-place
                fetch_lat_lon(computed_params)

            # 🚀 **Final check: If still NaN, skip**
            if (
                computed_params.get("latitude") is None 
                or computed_params.get("longitude") is None 
                or computed_params.get("altitude_km") is None
                or (isinstance(computed_params["latitude"], float) and math.isnan(computed_params["latitude"]))
                or (isinstance(computed_params["longitude"], float) and math.isnan(computed_params["longitude"]))
                or (isinstance(computed_params["altitude_km"], float) and math.isnan(computed_params["altitude_km"]))
                or computed_params.get("perigee") < 0  # ✅ Remove negative perigee
                or computed_params.get("semi_major_axis") < 0  # ✅ Remove negative semi-major axis
                or computed_params.get("apogee") < computed_params.get("perigee")  # ✅ Apogee must be >= perigee
            ):
                print(f"❌ Skipping {metadata.get('OBJECT_NAME', 'Unknown')} (NORAD {norad_number}): Lat/Lon still missing or invalid after recomputation.")
                continue

                # 🚀 **Convert decay_date & apply filtering**
            decay_date = parse_datetime(metadata.get("DECAY_DATE"))
            altitude_km = computed_params.get("altitude_km")
            orbit_type = computed_params.get("orbit_type")
            latitude = computed_params.get("latitude")
            longitude = computed_params.get("longitude")
            perigee = computed_params.get("perigee")
            apogee = computed_params.get("apogee")
            semi_major_axis = computed_params.get("semi_major_axis")

            # 🚀 **Filter Out Invalid & Non-Orbiting Objects**
            if (
                # 1️⃣ **Invalid Latitude/Longitude**
                (latitude in ["NaN", None] or longitude in ["NaN", None]) or  

                # 2️⃣ **Objects with Confirmed Decay (Beyond 7-Day Threshold)**
                (decay_date is not None and decay_date < datetime.now(timezone.utc) - timedelta(days=7)) or  

                # 3️⃣ **LEO Objects with Bad Altitude**
                (orbit_type == "LEO" and (
                    (altitude_km is not None and (altitude_km < 120 or altitude_km > 2000)) or  # ❌ Below 120 km (too low) or Above 2000 km (not LEO)
                    (perigee is not None and perigee < 120) or  # ❌ Perigee below 120 km (immediate reentry)
                    (apogee is not None and apogee > 2000)  # ❌ Apogee outside of LEO range
                )) or  

                # 4️⃣ **Unrealistic Orbits (Filtering out unstable or decayed objects)**
                (semi_major_axis is not None and semi_major_axis < 6378) or  # ❌ Semi-major axis below Earth's radius (inside planet!)
                (perigee is not None and perigee < 120)  # ❌ Perigee below 120 km (guaranteed deorbit)
            ):
                print(f"❌ Skipping {metadata.get('OBJECT_NAME', 'Unknown')} (NORAD {metadata.get('NORAD_CAT_ID')}): "
                    f"Invalid lat/lon, old decay date, unstable orbit, or unrealistic parameters.")
                continue  # ✅ Skip this satellite


            
            # ✅ **Prepare satellite data for insertion**
            sat_data = {
                "norad_number": norad_number,
                "name": metadata.get("OBJECT_NAME", "Unknown"),
                "tle_line1": tle_line1,
                "tle_line2": tle_line2,
                "object_type": metadata.get("OBJECT_TYPE", "Unknown"),
                "launch_date": metadata.get("LAUNCH_DATE") if metadata.get("LAUNCH_DATE") != "Unknown" else None,
                "launch_site": metadata.get("SITE") if metadata.get("SITE") != "Unknown" else None,
                "decay_date": decay_date,  # ✅ Now a datetime object
                "rcs": metadata.get("RCS_SIZE") if metadata.get("RCS_SIZE") != "Unknown" else None,
                "country": metadata.get("COUNTRY_CODE", "Unknown"),
                **computed_params,  # ✅ Add all computed orbital parameters
                "purpose": infer_purpose(metadata) or "Unknown",
            }

            # ✅ Add to filtered satellites & prevent future duplicates
            filtered_satellites.append(sat_data)
            seen_norads.add(norad_number)

        except Exception as e:
            print(f"⚠️ Error processing satellite {sat.get('OBJECT_NAME', 'Unknown')} (NORAD {norad_number}): {e}")

    print(f"✅ Returning {len(filtered_satellites)} satellites (filtered for active and valid lat/lon).")
    return filtered_satellites






def infer_purpose(metadata):
    """
    Infers the purpose of the satellite based on its name, type, and operational status.
    """
    name = metadata.get("OBJECT_NAME", "").upper()
    object_type = metadata.get("OBJECT_TYPE", "").upper()

    # Rocket Bodies
    if object_type in ["R/B", "ROCKET BODY"]:
        return "Rocket Body (Debris)"

    # Debris
    if object_type in ["DEB", "DEBRIS"]:
        return "Space Debris"


    # 🛰️ Starlink Constellation (Distinct Category)
    if "STARLINK" in name:
        return "Starlink Constellation"

    # 🛰️ OneWeb Constellation (Distinct Category)
    if "ONEWEB" in name:
        return "OneWeb Constellation"

    # 🛰️ Iridium NEXT Constellation (Distinct Category)
    if "IRIDIUM" in name:
        return "Iridium NEXT Constellation"

        # 🌐 **Traditional Communications Satellites**  
    if any(keyword in name for keyword in [
        "SES", "INTELSAT", "VIASAT", "EUTELSAT", "INMARSAT", "THURAYA", "HUGHES",
        "O3B", "JCSAT", "SKYNET", "TDRS", "ANIK", "ASTRA", "TELSTAR", "TDRSS", "ECHO",
        "MARISAT", "OPTUS", "CHINASAT", "YAMAL", "LORAL", "AMOS", "SHINASAT", "TELKOM", "GSAT",
        "TIBA", "KACIFIC", "HYLAS", "NBN", "NORSAT", "SESAT", "JUPITER", "TURKSAT", "ARABSAT",
        "NILESAT", "TANGO", "ABS", "KA-SAT", "CINAHASAT", "ST-2", "MEASAT", "BULSATCOM",
        "ECO-STAR", "SPACEWAY", "EUTELSAT KONNECT", "SES-4", "SYRACUSE", "TAMPA", "ECO-1",
        "VHTS", "VINASAT", "ES'HAIL", "JDRS", "SIRIUS", "GALAXY", "STARONE", "AUSSAT",
        "C-COM", "MOLNIYA", "ECHO", "HORIZONS", "INTELBIRD", "TELENOR", "MERCURY",
        "WGS", "EQUANT", "SES-17", "SES-22", "TURKSAT 5A", "TURKSAT 5B", "GSAT-30",
        "TURKSAT-6A", "THAICOM", "ASTARTE", "ORBCOMM", "TERRASAR", "HISPASAT",
        "GLOBALSTAR", "TIANMU-", "ZHONGXING-", "KOREASAT", "APSTAR-", "TIANLIAN",
        "ASIASAT", "DIRECTV", "EXPRESS-AM", "NIMIQ", "SATELIOT", "BSAT-", "MUOS-",
        "AMAZONAS", "HELLAS-SAT", "TIANTONG-", "QZS-", "YAHSAT", "TURKMENALEM", "XM-", "HELLAS-SAT", "DUBAISAT-", "COMSATBW-", "EXPRESS-AT", "ARSAT", "RADUGA-", "YAHSAT", "XM-", 
        "EXPRESS-AMU", "ASIASTAR"

    ]):
        return "Communications"




    # 📡 **Navigation Satellites**  
    if any(keyword in name for keyword in [
        "GPS", "GLONASS", "GALILEO", "BEIDOU", "NAVSTAR", "QZSS", "COSPAS-SARSAT", "IRNSS",
        "COMPASS", "EGNOS", "WAAS", "MSAS", "GAGAN", "DORIS", "LAGEOS", "NANJING", "ZHY",
        "TUPL", "BDS", "NASS", "NAVIC", "DRAGONFLY", "MICROSCOPE", "PRN", "KASS",
        "PAS-10", "OMNISTAR", "DORIS-2", "NAVSTAR-66", "PAS-12", "NAVIC-9", "GLONASS-K", "TIANMU-", "QZS-", "GNOMES-", "POLAR", "CSC-", "LEO"


    ]):
        return "Navigation"



    # 🌦️ **Weather Monitoring Satellites**  
    if any(keyword in name for keyword in [
        "WEATHER", "METEOR", "NOAA", "GOES", "HIMAWARI", "METOP", "DMSP", "FENGYUN", "GOMS",
        "INSAT", "SCATSAT", "TIROS", "NIMBUS", "GPM", "SMAP", "TROPICS", "OMI", "OCO", "COSMIC",
        "JPSS", "SUOMI", "HY-2", "FY-4", "SEVIRI", "MTSAT", "NPOESS", "NSCAT", "CALIPSO",
        "CLOUDSAT", "GCOM", "GOSAT", "I-5 F4", "MSG-3", "MSG-4", "SCISAT", "OMPS", "LAGRANGE-1",
        "CYGNSS", "AURA", "GOSAT-2", "GRACE-FO", "SMOS", "TANSAT", "GRACE", "OCO-3", "VIIRS",
        "JASON", "CRYOSAT", "AMSR", "TRMM", "ERS", "ENVISAT", "OZONE", "HAIYANG-", "TIANHUI", "HJ-", "FGRST (GLAST)", "OCEANSAT-", "S-NET", "CYGFM", "MDASAT-", "HULIANWAN", "HULIANGWANG", "YUNYAO-", "FARADAY", "DAQI"


    ]):
        return "Weather Monitoring"




    # 🛰️ **Military & Reconnaissance Satellites**  
    if any(keyword in name for keyword in [
        "SPY", "NROL", "RECON", "USA", "KH-11", "ONYX", "LACROSSE", "MISTY", "DIA", "SATCOM",
        "DSP", "ORION", "SBIRS", "ADVANCED", "MILSTAR", "SICRAL", "YAOGAN", "GEO-IK", "TITAN",
        "GRU", "ZUMA", "GAOFEN", "JL-1", "JL-2", "XHSAT", "SHIJIAN", "NAVY", "ARSENAL",
        "GRUMMAN", "KOSMOS", "SICH", "RORSAT", "SATCOM", "QIAN", "TIANCHENG", "SPIRA",
        "TITAN-2", "ORION-5", "GEO-11", "FIREBIRD", "EWS", "MUSIS", "UFO", "AEHF", "KOSMOS-2549",
        "ALOUETTE", "ORBIT-1", "ZONAL", "SKYMED", "KOMETA", "GOVSAT", "VORTEX", "NOSS", "SHIYAN", "TIANQI", "YUNHAI-", "SJ-", "GHOST-", "LUCH-", "GNOMES-", "RISAT-", "BLACKJACK", 
        "TIANTONG-", "ORS-", "ION", "SKYKRAFT-", "ZHEDA PIXING-", "RADUGA-", "SWARM", "CSG-", 
        "NINGXIA-", "TJS-", "MUOS-", "UMBRA-", "LEGION", "BRO-", "CHECKMATE", "GJZ", "GEESAT-", "TIANTONG-", "ZIYUAN", "RISAT-", "KL-BETA", "KAZSAT-", 
        "GOKTURK", "ZHIHUI", "YARILO", "HUANJING", "SPARK", "XW-", "KONDOR-FKA", "KL-ALPHA", 
        "ELSA-D", "EROS"


    ]):
        return "Military/Reconnaissance"



    # 🏞️ **Earth Observation Satellites**  
    if any(keyword in name for keyword in [
        "EARTH", "SENTINEL", "LANDSAT", "TERRA", "AQUA", "SPOT", "RADARSAT", "ICEYE", "PLEIADES",
        "CARTOSAT", "KOMPSAT", "NUSAT", "HYSIS", "HYPERSAT", "CUBESAT", "BLACKSKY", "PLANET",
        "WORLDVIEW", "QUICKBIRD", "ORBVIEW", "DOVE", "SKYSAT", "BIRD", "RESURS", "PHOTON",
        "VHR", "EOSAT", "LAGEOS", "TANDEM", "PAZ", "SWOT", "TET-1", "GEOEYE", "FASAT", "KASAT",
        "TUBIN", "VNREDSAT", "HYPERSAT-2", "MOROCCO", "NUSAT-7", "HYPSO", "RESOURCESAT",
        "IKONOS", "THEOS", "SIRIS", "IRS", "OHSAT", "HISUI", "PLEIADES-NEO", "BILSAT",
        "FLOCK", "SPECTRA", "AEROSAT", "SARSAT", "GRACE-2", "CHRIS", "MOS-1", "LEMUR-", "JILIN-", "GONETS-M", "HEAD-", "SUPERVIEW", "FORMOSAT", "EOS-", "ZIYUAN", 
        "ALSAT", "KANOPUS-V", "DMC", "KONDOR-FKA", "CAPELLA-", "TISAT", "QUETZSAT", "BEIJING", 
        "RSW-", "EROS", "ZHUHAI-", "EOS-", "DMC", "CANX-", "ELEKTRO-L", "SUPERVIEW-", "PRSS", "TELEOS-", "KANOPUS-V-IK", 
        "SHARJAHSAT-", "CASSIOPE", "PRISMA", "SOCRATES", "DS-EO"


    ]):
        return "Earth Observation"




        # 🔬 **Scientific Research Satellites**
    if any(keyword in name for keyword in [
        "HUBBLE", "JWST", "X-RAY", "FERMI", "GAIA", "KEPLER", "TESS", "WISE", "SPITZER",
        "MRO", "MAVEN", "INSIGHT", "DAWN", "BICEP", "XMM-NEWTON", "SWIFT", "GEMS",
        "NUSTAR", "PLATO", "SPICA", "GONG", "HELIO", "MAGELLAN", "CHANDRA", "ULYSSES",
        "HITOMI", "SUNRISE", "HELIOPHYSICS", "KECK ARRAY", "NICER", "GONG", "HELIOS",
        "SOLAR-B", "BICEP ARRAY", "JAMES WEBB", "QUANTUM", "XMM", "ASTRO-H", "LARES",
        "IRIS", "MICE", "SDO", "PROBA-", "CORIOLIS", "JAS-", "TIMED", "BIROS", "SAPPHIRE", "RADFXSAT", 
        "ITASAT", "ASNARO-", "BIROS", "CHEOPS", "LOPEN", "SPARTAN", "WEINA", "KANOPUS-V-IK", "INTEGRAL"


    ]):
        return "Scientific Research"



    # 🛠️ **Technology Demonstration Satellites**
    if any(keyword in name for keyword in [
        "EXPERIMENT", "TEST", "TECHNOLOGY", "DEMO", "TECHSAT", "PROTOTYPE", "MICROSAT",
        "NANOSAT", "RAVAN", "ECHO", "VCLS", "CUBERIDER", "FIREBIRD", "COPPER", "OSCAR",
        "ICECUBE", "DISCOSAT", "GOMX", "GOMX-4", "EQUULEUS", "PICSAT", "CANYVAL-X",
        "INSPIRATION", "NANORACKS", "CENTISPACE-", "XJS-", "AEROCUBE", "LDPE-", "LINUSS", "OMNI-L", "TIGRISAT", "SMDC", 
        "LEMUR-2", "ASTROCAST-", "KINEIS-", "NEXTSAT-", "CENTAURI-", "GOKTURK", "STAR-", "APRIZESAT", "PICO-", "AAC-AIS-SAT", "RCM-", "LDPE-", "CORVUS", "SXM-", "PREFIRE-", 
        "QB", "SCD", "IONOSFERA-M", "PROMETHEUS", "CSG-", "LINGQIAO", "MOHAMMED", "AYRIS-", "TACSAT", 
        "MANDRAKE", "OPS", "CUTE-", "CLUSTER", "OMNI-L", "ALOS-", "RSW-", "LAPAN-A", "VIGORIDE-", 
        "SINOD-D", "VRSS-", "DRUMS", "PROGRESS-MS", "PEARL", "UNISAT-", "NANOFF", "ANSER-FLW", 
        "LINUSS", "JACKAL", "AETHER-", "FOX-", "XJS", "FALCONSAT-", "CS", "CAPELLA-", "UWE-", 
        "PLATFORM-", "NUVIEW", "GUANGCHUAN", "SDX", "POEM-", "PROPCUBE", "CENTAURI-", "MH-", 
        "ORESAT", "WNISAT", "EXO-", "CUBEBUG-", "SEDNA-", "GENMAT-", "HIBARI", "HYPERFIELD-", 
        "MKA-PN", "CUAVA-", "RADFXSAT", "OTB", "STARS", "EDRS-C", "TANAGER-", "ONGLAISAT", 
        "MONOLITH", "INTEGRAL", "EXCITE", "TYCHE", "ADRAS-J", "NINJASAT", "RROCI-", "ROCK", 
        "OOV-CUBE", "STEP", "LACE-", "RANDEV"


    ]):
        return "Technology Demonstration"



    # 🚀 **Human Spaceflight / Crewed Missions**
    if any(keyword in name for keyword in [
        "ISS", "CREW", "TIANGONG", "SHENZHOU", "SOYUZ", "DRAGON", "STARLINER", "APOLLO",
        "GAGANYAAN", "ARTEMIS", "COLUMBIA", "CHALLENGER", "SATURN V", "ORION", "VOSTOK",
        "MERCURY", "GEMINI", "ZVEZDA", "UNITY", "TRANQUILITY", "MIR", "LUNAR MODULE",
        "SPACEX", "DEARMOON", "BOEING CST-100", "BLUE ORIGIN", "SPACESHIPTWO", "X-37B", "CSS", "ISS Modules (MENGTIAN, TIANHE, WENTIAN)"

    ]):
        return "Human Spaceflight"



    # 🛰️ **Space Infrastructure (Relay, Experimental, Interplanetary)**
    if any(keyword in name for keyword in [
        "TDRS", "RELAY", "GEO-COM", "LAGRANGE", "LUCY", "HAYABUSA", "MARS", "VENUS",
        "JUPITER", "SATURN", "PLUTO", "KUIPER", "DEEP SPACE", "EXPLORER", "MOON", "LUNAR",
        "INSIGHT", "ODYSSEY", "MAVEN", "BEPICOLOMBO", "GAGANYAAN", "HERMES", "MERCURY",
        "SOLAR ORBITER", "LUNAR PATHFINDER", "LUNAR RECONNAISSANCE ORBITER", "HORIZONS",
        "SELENE", "MARS PATHFINDER", "CURIOSITY", "OPPORTUNITY", "SPIRIT", "ROSCOSMOS",
        "JAXA", "TIANWEN", "VIPER", "GATEWAY", "CALLISTO", "SPACEBUS", "MARS SAMPLE RETURN", "CSS", "TIANLIAN", "XW-", "EXPRESS-AT", "SPACEBEE-", "CSS", "TIANLIAN"


    ]):
        return "Space Infrastructure"



    # 🚗 **Satellite Servicing & Logistics (Tugs, Refueling, Reboost)**
    if any(keyword in name for keyword in [
        "MEV", "MISSION EXTENSION", "TUG", "SATELLITE SERVICING", "ORBIT TRANSFER",
        "ORBIT FAB", "RENDEZVOUS", "FUEL DEPOT", "OSAM", "POD", "REPAIR", "RESTORE",
        "SPACE DRAG", "IN-ORBIT REFUELING", "ACTIVE DEBRIS REMOVAL", "MISSION REBOOST",
        "SHERPA", "EXTENSION VEHICLE", "GEO SERVICING", "DEORBIT", "ON-ORBIT REPAIR", "ELSA-D", "PROX-", "ORBASTRO-AF"

    ]):
        return "Satellite Servicing & Logistics"



    # 🌌 **Deep Space Exploration Missions (Interplanetary & Lunar)**
    if any(keyword in name for keyword in [
        "VOYAGER", "PIONEER", "NEW HORIZONS", "ULYSSES", "CASSINI", "JUNO", "BEPICOLOMBO",
        "MAVEN", "MARS EXPRESS", "VENUS EXPRESS", "MAGELLAN", "AKATSUKI", "VENERA",
        "MARINER", "GALILEO", "ODYSSEY", "INSIGHT", "JUPITER ICY MOONS", "GANYMEDE",
        "EUROPA", "TITAN", "DRAGONFLY", "LUNAR RECONNAISSANCE", "CHANG'E", "LUNA",
        "LUNOKHOD", "APOLLO", "ARTEMIS", "SMART-1", "KAGUYA", "SELENE", "YUTU", "VIPER",
        "LUNAR PATHFINDER", "LUNAR GATEWAY", "CAPSTONE", "EXOMARS", "TITAN SATURN SYSTEM MISSION", "MMS", "THOR", "HST", "CXO", "EYESAT", "RADIO ROSTO (RS-15)"

    ]):
        return "Deep Space Exploration"


    # 🛑 Default classifications
    if object_type == "PAYLOAD":
        return "Unknown Payload"
    

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






def parse_tle_line2(tle_line2):
    """
    Extracts Mean Motion and Revolution Number from TLE Line 2.
    """
    try:
        mean_motion = float(tle_line2[52:63].strip())  # Extract Mean Motion
        rev_number = int(tle_line2[63:68].strip())  # Extract Revolution Number

        # 🔍 Debugging: Print extracted values
        #print(f"🔎 Parsed Mean Motion: {mean_motion}, Rev Number: {rev_number}")

        if not isfinite(mean_motion) or mean_motion <= 0:
            print(f"⚠️ Invalid Mean Motion ({mean_motion}), skipping.")
            return None, None
        return mean_motion, rev_number

    except Exception as e:
        print(f"❌ Error parsing TLE Line 2: {e}")
        return None, None





def compute_orbital_params(name, tle_line1, tle_line2):
    """
     python-sgp4 + Astropy to compute orbital parameters and 
    current geodetic coordinates (lat, lon, altitude) from TLEs.
    """
    try:
        # 1) Check TLE validity
        if not tle_line1 or not tle_line2:
            print(f"⚠️ Skipping {name}: Missing TLE data")
            return None

        # 2) Create a Satrec object from TLE lines
        try:
            satrec = Satrec.twoline2rv(tle_line1, tle_line2, WGS72)
        except Exception as e:
            print(f"❌ Error initializing Satrec for {name}: {e}")
            return None

        # 3) Extract TLE metadata (norad_number, mean_motion, epoch, etc.)
        # Assume these helper functions are defined elsewhere in your code
        norad_number, intl_designator, ephemeris_type = parse_tle_line1(tle_line1)
        if norad_number is None:
            print(f"⚠️ Skipping {name}: Could not parse NORAD number from TLE")
            return None

        mean_motion, rev_num = parse_tle_line2(tle_line2)
        if mean_motion is None:
            print(f"⚠️ Skipping {name} (NORAD {norad_number}): Invalid mean motion.")
            return None

        epoch = extract_epoch(tle_line1)  # e.g. "2023-09-15T12:34:56"
        if epoch is None:
            print(f"⚠️ Skipping {name} (NORAD {norad_number}): Invalid epoch.")
            return None

        # 4) Extract SGP4 Model Parameters from satrec
        inclination = satrec.inclo * (180 / pi)  # deg
        eccentricity = satrec.ecco
        bstar = satrec.bstar
        raan = satrec.nodeo * (180 / pi)  # deg
        arg_perigee = satrec.argpo * (180 / pi)  # deg

        bad_values = []
        for param_name, param_val in [
            ("inclination", inclination),
            ("eccentricity", eccentricity),
            ("bstar", bstar),
            ("raan", raan),
            ("arg_perigee", arg_perigee),
        ]:
            if not isfinite(param_val):
                bad_values.append(param_name)
        if bad_values:
            print(f"⚠️ Skipping {name} (NORAD {norad_number}): Bad values: {', '.join(bad_values)}")
            return None

        # 5) Compute Semi-Major Axis, Perigee, Apogee, Period, Velocity
        mu = 398600.4418  # km^3/s^2
        try:
            n_rad_s = mean_motion * 2 * pi / 86400.0
            semi_major_axis = (mu / (n_rad_s**2)) ** (1 / 3)  # km
            if not isfinite(semi_major_axis) or semi_major_axis <= 0:
                raise ValueError(f"Invalid semi-major axis computed: {semi_major_axis}")

            perigee = semi_major_axis * (1 - eccentricity) - 6378.0
            apogee  = semi_major_axis * (1 + eccentricity) - 6378.0
            velocity = math.sqrt(mu / semi_major_axis)  # km/s
            period = (1.0 / mean_motion) * 1440.0  # minutes
        except Exception as e:
            print(f"⚠️ {name} (NORAD {norad_number}): Error computing orbital parameters: {e}")
            return None

        orbit_type = classify_orbit_type(perigee, apogee)

        # 6) Propagate to Current UTC Time using SGP4
        now = datetime.utcnow()
        #print(f"✅ [DEBUG] Current UTC time: {now}")
        # Use Astropy Time for high precision Julian date conversion
        obstime = Time(now, scale='utc')
        jd_total = obstime.jd
        jd = math.floor(jd_total)
        fr = jd_total - jd

        error_code, r_teme, v_teme = satrec.sgp4(jd, fr)
        if error_code != 0:
            print(f"⚠️ [SGP4 Error {error_code}] for {name} (NORAD {norad_number}) at time {now}")
            return None

        # 7) Convert TEME coordinates to geodetic coordinates using Astropy
        teme_coord = TEME(
            x=r_teme[0] * u.km,
            y=r_teme[1] * u.km,
            z=r_teme[2] * u.km,
            obstime=obstime
        )
        itrs_coord = teme_coord.transform_to(ITRS(obstime=obstime))
        lat_deg = itrs_coord.earth_location.lat.to(u.deg).value
        lon_deg = itrs_coord.earth_location.lon.to(u.deg).value
        alt_km  = itrs_coord.earth_location.height.to(u.km).value

        # 8) Return final dictionary
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
            "latitude": lat_deg,
            "longitude": lon_deg,
            "altitude_km": alt_km,
        }

    except Exception as e:
        print(f"❌ Critical error computing {name} (NORAD {norad_number}): {e}")
        traceback.print_exc()
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






def clean_old_norads():
    """
    Deletes NORAD numbers from the database that no longer meet the criteria based on orbit type and decay date.
    """

    conn = get_db_connection()
    cursor = conn.cursor()

    print("🧹 Cleaning outdated NORADs from the database...")

    
    delete_query =  """
    DELETE FROM satellites
    WHERE 
        -- ❌ Remove objects with invalid position
        (latitude IS NULL OR longitude IS NULL OR latitude = 'NaN' OR longitude = 'NaN') 

        -- ❌ Remove decayed objects (older than 7 days)
        OR (decay_date IS NOT NULL AND decay_date < NOW() - INTERVAL '7 days')

        -- ❌ Remove unrealistic orbits (satellites that have already reentered)
        OR (perigee IS NOT NULL AND perigee < 120)  -- Below 80 km = Atmospheric burn-up

        -- ❌ Remove objects with invalid semi-major axis (should not be inside the Earth)
        OR (semi_major_axis IS NOT NULL AND semi_major_axis < 6378)

        -- ❌ Remove broken entries where altitude is missing
        OR (altitude_km IS NULL OR altitude_km = 'NaN' OR altitude_km < 120) AND (epoch < NOW() - INTERVAL '7 days');

        """

    cursor.execute(delete_query)
    conn.commit()
    
    deleted_rows = cursor.rowcount
    print(f"✅ Deleted {deleted_rows} outdated NORADs.")

    cursor.close()
    conn.close()




def get_existing_norad_numbers():
    """
    Fetches all existing NORAD numbers from the database after cleaning old entries.
    Returns a set of NORAD numbers.
    """

    # 🔥 First, clean old NORADs
    clean_old_norads()

    conn = get_db_connection()
    cursor = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)  # ✅ Use dictionary cursor

    cursor.execute("SELECT norad_number FROM satellites;")
    rows = cursor.fetchall()

    if not rows:
        print("⚠️ No NORAD numbers found in the database!")
        return set()

    norads = {int(row["norad_number"]) for row in rows}  # ✅ Access using column name

    cursor.close()
    conn.close()

    print(f"✅ Found {len(norads)} existing NORAD numbers in the database.")
    return norads





def get_existing_satellite_names():
    """
    Fetches all existing satellite names from the database.
    Returns a set of names.
    """
    conn = get_db_connection()
    cursor = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)  # ✅ Use dictionary cursor

    cursor.execute("SELECT name FROM satellites;")
    rows = cursor.fetchall()

    if not rows:
        print("⚠️ No satellite names found in the database!")
        return set()

    names = {row["name"] for row in rows if row["name"]}  # ✅ Ensure names are valid

    cursor.close()
    conn.close()
    
    print(f"✅ Found {len(names)} existing satellite names in the database.")
    return names




def compute_sgp4_position1(tle_line1, tle_line2):
    """
    Computes the current satellite latitude and longitude using python-sgp4,
    and transforms TEME coordinates into geodetic coordinates using Astropy.
    """
    try:
        if not tle_line1 or not tle_line2:
            print("❌ [ERROR] Missing TLE lines!")
            return None, None, None, -1  # -1 = Missing TLE

        try:
            satrec = Satrec.twoline2rv(tle_line1, tle_line2, WGS72)
        except Exception as e:
            print(f"❌ [ERROR] Invalid TLE parse failure: {e}")
            return None, None, None, -2  # -2 = TLE parse error

        now = datetime.utcnow()
        obstime = Time(now, scale='utc')

        jd_total = obstime.jd
        jd = math.floor(jd_total)
        fr = jd_total - jd

        # 🚀 **Run SGP4 propagation**
        error_code, r, v = satrec.sgp4(jd, fr)
        if error_code != 0:
            print(f"❌ [ERROR] SGP4 propagation error code: {error_code}")
            return None, None, None, error_code  # Return error code

        # 🚀 **Check if values are realistic**
        if not all(map(isfinite, r)) or abs(r[0]) > 1e8 or abs(r[1]) > 1e8 or abs(r[2]) > 1e8:
            print(f"❌ [ERROR] SGP4 returned invalid position values: {r}")
            return None, None, None, -6  # -6 = Invalid position values

        # 🚀 **Convert TEME to ITRS only if the values are valid**
        try:
            teme_coord = TEME(x=r[0] * u.km, y=r[1] * u.km, z=r[2] * u.km, obstime=obstime)
            itrs_coord = teme_coord.transform_to(ITRS(obstime=obstime))

            lat_deg = itrs_coord.earth_location.lat.to(u.deg).value
            lon_deg = itrs_coord.earth_location.lon.to(u.deg).value
            alt_km = itrs_coord.earth_location.height.to(u.km).value

        except Exception as e:
            print(f"❌ [ERROR] Astropy transformation failed: {e}")
            return None, None, None, -7  # -7 = Astropy conversion error

        # 🚀 **Sanity checks**
        if lat_deg is None or lon_deg is None or not (-90 <= lat_deg <= 90) or not (-180 <= lon_deg <= 180):
            print(f"❌ [ERROR] Computed lat/lon out of bounds: lat={lat_deg}, lon={lon_deg}")
            return None, None, None, -3  # -3 = Out-of-bounds lat/lon

        if not isfinite(alt_km) or alt_km < -50 or alt_km > 500000:
            print(f"❌ [ERROR] Computed altitude out of range: {alt_km} km")
            return None, None, None, -4  # -4 = Invalid altitude

        return lat_deg, lon_deg, alt_km, 0  # 0 = success

    except Exception as e:
        print(f"⚠️ [ERROR] SGP4 computation failed: {e}")
        traceback.print_exc()
        return None, None, None, -5  # -5 = Unknown failure





def is_valid_lat_lon(latitude, longitude):
    """
    Ensures latitude and longitude are valid (not NaN, None, or invalid).
    """
    if latitude is None or longitude is None:
        #print(f"❌ [FILTER] Invalid lat/lon detected: None values → lat={latitude}, lon={longitude}")
        return False
    if isinstance(latitude, float) and math.isnan(latitude):
        #print(f"❌ [FILTER] Invalid lat/lon detected: Float NaN → lat={latitude}, lon={longitude}")
        return False
    if isinstance(longitude, float) and math.isnan(longitude):
        #print(f"❌ [FILTER] Invalid lat/lon detected: Float NaN → lat={latitude}, lon={longitude}")
        return False

    # ✅ Debugging valid cases
    
    return True



def compute_accuracy(sat):
    """
    Computes:
    - Accuracy percentage
    - Computed latitude and longitude
    - Error in kilometers (km)
    - Altitude (km)
    - SGP4 error code (0 = success, other values indicate failure)
    """
    lat, lon, altitude_km, sgp4_error_code = compute_sgp4_position1(sat["tle_line1"], sat["tle_line2"])
    
    if sgp4_error_code != 0:
        return None, None, None, None, None, sgp4_error_code  # Include error code in return

    lat1, lon1, altitude_km1, _ = compute_sgp4_position1(sat["tle_line1"], sat["tle_line2"])

    if not is_valid_lat_lon(lat1, lon1):
        return None, None, None, None, None, -3  # Indicate invalid lat/lon

    if lat is not None and lon is not None:
        delta_lat = np.radians(lat1 - lat)
        delta_lon = np.radians(lon1 - lon)

        a = np.sin(delta_lat / 2) ** 2 + np.cos(np.radians(lat1)) * np.cos(np.radians(lat)) * np.sin(delta_lon / 2) ** 2
        c = 2 * np.arctan2(np.sqrt(a), np.sqrt(1 - a))
        error_km = EARTH_RADIUS_KM * c  # Convert to km

        max_possible_error = 180  # Earth's max angular error in degrees
        accuracy = max(0, 100 - (np.degrees(c) / max_possible_error) * 100)

        return accuracy, lat, lon, error_km, altitude_km, 0  # 0 = success

    return None, None, None, None, None, -4  # Indicate unknown failure



def update_satellite_data():
    """
    Efficiently update and insert satellite data using PostgreSQL COPY + UPSERT with batch processing.
    Also stores historical TLEs for time-series analysis and filters invalid entries.
    """

    conn = get_db_connection()
    cursor = conn.cursor()

    existing_norads = set(get_existing_norad_numbers())  # ✅ Get existing NORADs
    existing_names = set(get_existing_satellite_names())  # ✅ Get existing names

    session = get_spacetrack_session()
    if not session:
        print("❌ Failed to authenticate with Space-Track API. Exiting.")
        return

    all_satellites = fetch_tle_data(session, existing_norads)
    if not all_satellites:
        print("⚠️ No new data to process.")
        return

    batch_existing_norads = set()  # ✅ Track NORADs only in the current batch
    batch_existing_names = set(existing_names)  # ✅ Track already known names
    batch = []
    skipped_norads = []  
    historical_tles = []  

    print(f"📡 Processing {len(all_satellites)} satellites for database update...")

    with ThreadPoolExecutor(max_workers=8) as executor:
        for sat, (accuracy, lat, lon, error_km, altitude_km, sgp4_error_code) in tqdm(
            zip(all_satellites, executor.map(compute_accuracy, all_satellites)), 
            total=len(all_satellites), desc="Computing accuracy", unit="sat"
        ):

            norad_number = sat.get("norad_number", None)
            decay_date = parse_datetime(sat.get("decay_date"))

            if norad_number is None:
                skipped_norads.append(f"{sat['name']} (❌ Missing NORAD)")
                continue  

            # 🚀 **Skip invalid satellites**
            if sgp4_error_code and sgp4_error_code != 0:
                skipped_norads.append(f"{sat['name']} (NORAD {norad_number}) - ❌ SGP4 error {sgp4_error_code}")
                continue

            perigee = sat.get("perigee")

            apogee = sat.get("apogee")

            epoch = sat.get("epoch")
            if isinstance(epoch, str):
                epoch = parse_datetime(epoch)


            if (
            # ❌ **Invalid latitude/longitude**
            (lat in ["NaN", None] or lon in ["NaN", None] or altitude_km in ["NaN", None]) or  

            # ❌ **Objects that have already decayed (beyond 7-day threshold)**
            (decay_date is not None and decay_date < datetime.now(timezone.utc) - timedelta(days=7)) or  

            # ❌ **LEO satellites with invalid altitude, perigee, or apogee**
            (sat.get("orbit_type") == "LEO" and (
                (altitude_km < 120 or altitude_km > 2000) or  # 🚀 Below 120 km (decayed) or Above 2000 km (not LEO)
                (perigee is not None and perigee < 120) or  # 🚀 Perigee < 120 km = Immediate reentry
                (apogee is not None and apogee > 2000)  # 🚀 Apogee > 2000 km = Not LEO
            )) or  

           
            # ❌ **Invalid altitude handling & old TLE check**
            ((altitude_km is None or altitude_km < 120) and (epoch is not None and epoch < datetime.now(timezone.utc) - timedelta(days=7)))
            ):
                skipped_norads.append(f"{sat['name']} (NORAD {norad_number}) - ❌ Invalid lat/lon, decay date too old, unstable orbit, or outdated TLE.")
                print(f"SKIPPING INCORRECT NORAD {norad_number}")
                continue

            # ✅ **Check for duplicate NORAD numbers only within this batch**
            if norad_number in batch_existing_norads:
                skipped_norads.append(f"{sat['name']} (NORAD {norad_number}) - ❌ Already processed in batch.")
                continue  

            # ✅ **Ensure Unique Name**
            original_name = sat["name"]
            name = original_name
            suffix = 1

            while name in batch_existing_names:
                name = f"{original_name} ({suffix})"
                suffix += 1

            batch_existing_names.add(name)  # ✅ Track name in this batch
            sat["name"] = name  

            # ✅ **Check if this is a new TLE for historical storage**
            historical_tles.append((
                norad_number, sat["epoch"], sat["tle_line1"], sat["tle_line2"], datetime.now(timezone.utc)
            ))

            # ✅ **Mark NORAD as processed only after passing all checks**
            batch_existing_norads.add(norad_number)

            sat["accuracy_percentage"] = accuracy  
            sat["computed_latitude"] = lat  
            sat["computed_longitude"] = lon  
            sat["error_km"] = error_km  

            batch.append(sat)  

    # ✅ Log skipped NORADs
    with open("skipped_norads.log", "w") as log_file:
        log_file.write("\n".join(skipped_norads))



    # ✅ Create a TEMP table for historical TLEs to handle conflicts properly
    cursor.execute("CREATE TEMP TABLE temp_tle_history AS TABLE satellite_tle_history WITH NO DATA;")

    print(f"📜 Inserting {len(historical_tles)} historical TLEs...")
    with NamedTemporaryFile(mode="w", delete=False, suffix=".csv") as temp_file:
        csv_writer = csv.writer(temp_file, delimiter=",")
        csv_writer.writerow(["norad_number", "epoch", "tle_line1", "tle_line2", "inserted_at"])
        csv_writer.writerows(historical_tles)
        temp_file_path = temp_file.name

    with open(temp_file_path, "r") as temp_file:
        cursor.copy_expert("""
            COPY temp_tle_history (norad_number, epoch, tle_line1, tle_line2, inserted_at)
            FROM STDIN WITH CSV HEADER;
        """, temp_file)

    # ✅ Insert TLEs from TEMP table while avoiding duplicates
    cursor.execute("""
        INSERT INTO satellite_tle_history (norad_number, epoch, tle_line1, tle_line2, inserted_at)
        SELECT norad_number, epoch, tle_line1, tle_line2, inserted_at FROM temp_tle_history
        ON CONFLICT (norad_number, epoch) DO NOTHING;
    """)

    cursor.execute("DROP TABLE temp_tle_history;")  # ✅ Cleanup TEMP table
    os.remove(temp_file_path)  # ✅ Remove temporary CSV FILE
    conn.commit()


    # ✅ Create a temporary CSV file for batch insertion
    with NamedTemporaryFile(mode="w", delete=False, suffix=".csv") as temp_file:
        csv_writer = csv.writer(temp_file, delimiter=",")
        csv_writer.writerow([
            "name", "tle_line1", "tle_line2", "norad_number", "epoch",
            "inclination", "eccentricity", "mean_motion", "raan", "arg_perigee",
            "velocity", "latitude", "longitude", "orbit_type", "period",
            "perigee", "apogee", "semi_major_axis", "bstar", "rev_num",
            "ephemeris_type", "object_type", "launch_date", "launch_site",
            "decay_date", "rcs", "purpose", "country", "accuracy_percentage",
            "error_km", "altitude_km", "computed_latitude", "computed_longitude"
        ])

        for sat in tqdm(batch, desc="Writing to CSV", unit="sat"):
            csv_writer.writerow([
                sat["name"], sat["tle_line1"], sat["tle_line2"], sat["norad_number"], sat["epoch"],
                sat["inclination"], sat["eccentricity"], sat["mean_motion"], sat["raan"], sat["arg_perigee"],
                sat["velocity"], sat["latitude"], sat["longitude"], sat["orbit_type"], sat["period"],
                sat["perigee"], sat["apogee"], sat["semi_major_axis"], sat["bstar"], sat["rev_num"],
                sat["ephemeris_type"], sat["object_type"], sat["launch_date"], sat["launch_site"],
                sat["decay_date"], sat["rcs"], sat["purpose"], sat["country"], sat["accuracy_percentage"],
                sat["error_km"], sat["altitude_km"], sat["computed_latitude"], sat["computed_longitude"]
            ])

        temp_file_path = temp_file.name

    cursor.execute("CREATE UNLOGGED TABLE IF NOT EXISTS temp_satellites AS TABLE satellites WITH NO DATA;")
    cursor.execute("TRUNCATE temp_satellites;")

    print("📤 Loading CSV into temp_satellites...")
    with open(temp_file_path, "r") as temp_file:
        cursor.copy_expert("""
            COPY temp_satellites (
                name, tle_line1, tle_line2, norad_number, epoch,
                inclination, eccentricity, mean_motion, raan, arg_perigee,
                velocity, latitude, longitude, orbit_type, period,
                perigee, apogee, semi_major_axis, bstar, rev_num,
                ephemeris_type, object_type, launch_date, launch_site,
                decay_date, rcs, purpose, country, accuracy_percentage,
                error_km, altitude_km, computed_latitude, computed_longitude
            )
            FROM STDIN WITH CSV HEADER;
        """, temp_file)

    print("🔄 Performing UPSERT on satellites...")
    cursor.execute("""
        INSERT INTO satellites AS main (
            name, tle_line1, tle_line2, norad_number, epoch,
            inclination, eccentricity, mean_motion, raan, arg_perigee,
            velocity, latitude, longitude, orbit_type, period,
            perigee, apogee, semi_major_axis, bstar, rev_num,
            ephemeris_type, object_type, launch_date, launch_site,
            decay_date, rcs, purpose, country, accuracy_percentage,
            error_km, altitude_km, computed_latitude, computed_longitude
        )
        SELECT 
            name, tle_line1, tle_line2, norad_number, epoch,
            inclination, eccentricity, mean_motion, raan, arg_perigee,
            velocity, latitude, longitude, orbit_type, period,
            perigee, apogee, semi_major_axis, bstar, rev_num,
            ephemeris_type, object_type, launch_date, launch_site,
            decay_date, rcs, purpose, country, accuracy_percentage,
            error_km, altitude_km, computed_latitude, computed_longitude
        FROM temp_satellites
        ON CONFLICT (norad_number) DO UPDATE 
        SET 
            epoch = EXCLUDED.epoch,
            tle_line1 = EXCLUDED.tle_line1,
            tle_line2 = EXCLUDED.tle_line2,
            inclination = EXCLUDED.inclination,
            eccentricity = EXCLUDED.eccentricity,
            mean_motion = EXCLUDED.mean_motion,
            raan = EXCLUDED.raan,
            arg_perigee = EXCLUDED.arg_perigee,
            velocity = EXCLUDED.velocity,
            latitude = EXCLUDED.latitude,
            longitude = EXCLUDED.longitude,
            orbit_type = EXCLUDED.orbit_type,
            period = EXCLUDED.period,
            perigee = EXCLUDED.perigee,
            apogee = EXCLUDED.apogee,
            semi_major_axis = EXCLUDED.semi_major_axis,
            bstar = EXCLUDED.bstar,
            rev_num = EXCLUDED.rev_num,
            ephemeris_type = EXCLUDED.ephemeris_type,
            object_type = EXCLUDED.object_type,
            launch_date = EXCLUDED.launch_date,
            launch_site = EXCLUDED.launch_site,
            decay_date = EXCLUDED.decay_date,
            rcs = EXCLUDED.rcs,
            purpose = EXCLUDED.purpose,
            country = EXCLUDED.country,
            accuracy_percentage = EXCLUDED.accuracy_percentage,
            error_km = EXCLUDED.error_km,
            altitude_km = EXCLUDED.altitude_km,
            computed_latitude  = EXCLUDED.computed_latitude,
            computed_longitude = EXCLUDED.computed_longitude
        WHERE main.epoch != EXCLUDED.epoch;
    """)


    cursor.execute("TRUNCATE temp_satellites;")  

    conn.commit()
    cursor.close()
    conn.close()
    os.remove(temp_file_path)

    print(f"✅ Successfully processed {len(batch)} satellites using COPY + UPSERT.")
    print(f"✅ Historical TLEs added where epoch changed.")
    print(f"⚠️ {len(skipped_norads)} satellites were skipped.")


if __name__ == "__main__":
    #update_cdm_data()
    update_satellite_data()
    
