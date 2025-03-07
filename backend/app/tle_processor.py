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
from astropy.utils.iers import conf
# ✅ Force download of latest Earth rotation parameters
conf.iers_auto_url = "https://datacenter.iers.org/data/latest/finals2000A.all"
conf.auto_download = True  # Ensure automatic updates
# ✅ Load latest IERS data
from astropy.utils import iers
iers.IERS_Auto.open()
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



def serialize_datetime(obj):
    """Convert datetime objects to ISO format strings."""
    if isinstance(obj, datetime):
        return obj.isoformat()
    raise TypeError(f"Type {type(obj)} not serializable")


def fetch_tle_data(session, existing_norads):
    """
    Fetches the latest TLE data and ensures the file is always written cleanly.
    Uses cached TLEs if available but always rewrites the file.
    """
    if not existing_norads:
        print("⚠️ No existing NORAD numbers found. Skipping TLE fetch.")
        return []

    # ✅ Initialize variable
    satellites = []

    # ✅ Check if the TLE file exists
    if os.path.exists(TLE_FILE_PATH):
        try:
            with open(TLE_FILE_PATH, "r") as file:
                tle_data = json.load(file)

            # ✅ Use cached data if <1 hour old
            if time.time() - tle_data["timestamp"] < 3600:
                print("📡 Using cached TLE data (Last Updated: < 1 hour ago)")
                satellites = tle_data["satellites"]
        except (json.JSONDecodeError, KeyError):
            print("⚠️ TLE file is corrupt or incomplete. Fetching fresh data...")

    # ✅ If no cached data is available, fetch fresh TLEs
    if not satellites:
        print("📡 Fetching latest TLE data from Space-Track...")
        tle_url = "https://www.space-track.org/basicspacedata/query/class/gp/orderby/EPOCH%20desc/format/json"
        response = session.get(tle_url)

        if response.status_code == 200:
            satellites = response.json()
        else:
            print(f"❌ API error {response.status_code}. Could not fetch TLE data.")
            return []
        
    
    # ✅ Compute orbital parameters for each satellite
    for sat in satellites:

        now = datetime.now().astimezone(timezone.utc)
        decay_date = parse_datetime(sat.get("DECAY_DATE"))
        if decay_date is not None and decay_date.tzinfo is None:
            decay_date = decay_date.replace(tzinfo=timezone.utc)

        if ((decay_date is not None and decay_date < now - timedelta(days=7))):
            continue

        epoch = sat.get("EPOCH")

        if isinstance(epoch, str):
            epoch = parse_datetime(epoch)
        if epoch is not None and epoch.tzinfo is None:
            epoch = epoch.replace(tzinfo=timezone.utc) 
                
        if (epoch is None or epoch < now - timedelta(days=730)):
            continue

        sat["computed_params"] = compute_orbital_params(
            sat.get("OBJECT_NAME", "Unknown"),
            sat.get("TLE_LINE1", ""),
            sat.get("TLE_LINE2", "")
        )

    # ✅ Always rewrite the file, even if using cached data
    with open(TLE_FILE_PATH, "w") as file:
        json.dump({"timestamp": time.time(), "satellites": satellites}, file, default=serialize_datetime)

    print(f"✅ Processed TLE data for {len(satellites)} satellites.")
    return filter_satellites(satellites, existing_norads)



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
            computed_params = sat["computed_params"]  # ✅ Maintain the reference

            # ✅ Ensure computed_params exists and contains valid lat/lon
            if not computed_params or computed_params.get("latitude") is None or computed_params.get("longitude") is None or computed_params.get("altitude_km") is None:
                continue

            for_prediction = True  # 🚀 Set to False for tracking mode

            # 🚀 **Convert decay_date & apply filtering**
            decay_date = parse_datetime(metadata.get("DECAY_DATE"))
            if decay_date is not None and decay_date.tzinfo is None:
                decay_date = decay_date.replace(tzinfo=timezone.utc)  # ✅ Ensure UTC timezone

            altitude_km = computed_params.get("altitude_km")
            orbit_type = computed_params.get("orbit_type")
            latitude = computed_params.get("latitude")
            longitude = computed_params.get("longitude")
            perigee = computed_params.get("perigee")  
            apogee = computed_params.get("apogee")
            epoch = computed_params.get("epoch")

            if norad_number is None:
                continue  

            if isinstance(epoch, str):
                epoch = parse_datetime(epoch)
            if epoch is not None and epoch.tzinfo is None:
                epoch = epoch.replace(tzinfo=timezone.utc) 
                
            

            # 🚀 **Define TLE age limits based on mode**
            now = datetime.now().astimezone(timezone.utc)
            
        

            if for_prediction:
                seven_days_ago = now - timedelta(days=30)  # **LEO extended to 30 days**
                thirty_days_ago = now - timedelta(days=180)  # **MEO extended to 6 months**
                three_months_ago = now - timedelta(days=365)  # **HEO & GEO extended to 1 year**
                six_months_ago = now - timedelta(days=365)  # **GEO max 1 year**
            else:
                seven_days_ago = now - timedelta(days=7)  # **LEO tracking mode**
                thirty_days_ago = now - timedelta(days=30)  # **MEO tracking mode**
                three_months_ago = now - timedelta(days=90)  # **HEO & GEO standard limits**
                six_months_ago = now - timedelta(days=180)  # **GEO max 6 months in tracking mode**


            if ((decay_date is not None and decay_date < now - timedelta(days=7))):
                continue
                

            if (
                # ❌ **Invalid latitude/longitude**
                (latitude in ["NaN", None] or longitude in ["NaN", None] or altitude_km in ["NaN", None]) or  

                
                # ❌ **LEO satellites with old TLE**
                (orbit_type == "LEO" and (epoch is None or epoch < seven_days_ago)) or  

                # ❌ **MEO satellites with old TLE**
                (orbit_type == "MEO" and (epoch is None or epoch < thirty_days_ago)) or  

                # ❌ **HEO satellites with different epoch limits**
                ((orbit_type == "HEO") and (
                    (perigee is not None and perigee < 2000 and (epoch is None or epoch < now - timedelta(days=30))) or  
                    (perigee is not None and perigee >= 2000 and (epoch is None or epoch < three_months_ago))  
                )) 
                
                or (orbit_type == "GEO" and (epoch is None or epoch < now - timedelta(days=730))  ) or

                
                ((altitude_km is None or altitude_km < 50))
            ):
                print(f"❌ Skipping {metadata.get('OBJECT_NAME', 'Unknown')} (NORAD {metadata.get('NORAD_CAT_ID')}): "
                    f"Invalid lat/lon, unstable orbit, or unrealistic parameters.")
                
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

            print(sat_data)

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
    Compute all possible orbital parameters strictly at the TLE epoch 
    using python-sgp4 + Astropy.
    """
    try:
        if not tle_line1 or not tle_line2:
            print(f"⚠️ Skipping {name}: Missing TLE data")
            return None

        satrec = Satrec.twoline2rv(tle_line1, tle_line2, WGS72)

        norad_number, intl_designator, ephemeris_type = parse_tle_line1(tle_line1)
        mean_motion, rev_num = parse_tle_line2(tle_line2)
        epoch = extract_epoch(tle_line1)

        if None in [norad_number, mean_motion, epoch]:
            print(f"⚠️ Skipping {name} (NORAD {norad_number}): Invalid TLE data.")
            return None

        # Convert epoch to Julian Date
        tle_epoch_time = Time(epoch, scale="utc")
        jd_total = tle_epoch_time.jd
        jd = math.floor(jd_total)
        fr = jd_total - jd  

        # 4) Extract SGP4 Model Parameters
        inclination = satrec.inclo * (180 / math.pi)  
        eccentricity = satrec.ecco
        bstar = satrec.bstar
        raan = satrec.nodeo * (180 / math.pi)  
        arg_perigee = satrec.argpo * (180 / math.pi)  

        mu = 398600.4418  
        n_rad_s = mean_motion * 2 * math.pi / 86400.0
        semi_major_axis = (mu / (n_rad_s**2)) ** (1 / 3)  

        perigee = semi_major_axis * (1 - eccentricity) - 6378.0  
        apogee  = semi_major_axis * (1 + eccentricity) - 6378.0
        period = (1.0 / mean_motion) * 1440.0  

        orbit_type = classify_orbit_type(perigee, apogee)

        error_code, r_teme, v_teme = satrec.sgp4(jd, fr)
        if error_code != 0:
            print(f"⚠️ [SGP4 Error {error_code}] for {name} (NORAD {norad_number}) at epoch {epoch}")
            return None

        teme_coord = TEME(
            x=r_teme[0] * u.km,
            y=r_teme[1] * u.km,
            z=r_teme[2] * u.km,
            obstime=tle_epoch_time
        )
        itrs_coord = teme_coord.transform_to(ITRS(obstime=tle_epoch_time))
        lat_deg = itrs_coord.earth_location.lat.to(u.deg).value
        lon_deg = itrs_coord.earth_location.lon.to(u.deg).value
        alt_km  = itrs_coord.earth_location.height.to(u.km).value

        vx, vy, vz = v_teme  
        velocity = math.sqrt(vx**2 + vy**2 + vz**2)  

        # Additional Computations
        mean_anomaly = satrec.mo * (180 / math.pi)  
        eccentric_anomaly = mean_anomaly + (eccentricity * math.sin(mean_anomaly))  
        true_anomaly = 2 * math.atan2(math.sqrt(1 + eccentricity) * math.sin(eccentric_anomaly / 2),
                                      math.sqrt(1 - eccentricity) * math.cos(eccentric_anomaly / 2))  
        argument_of_latitude = arg_perigee + true_anomaly  
        specific_angular_momentum = math.sqrt(mu * semi_major_axis * (1 - eccentricity**2))  
        radial_distance = semi_major_axis * (1 - eccentricity * math.cos(eccentric_anomaly))  
        flight_path_angle = math.atan((eccentricity * math.sin(true_anomaly)) / (1 + eccentricity * math.cos(true_anomaly)))  
        
        if vx is None:
            print(norad_number, tle_line1, tle_line2, alt_km, mean_anomaly)

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
            "altitude_km": alt_km,  # Now at TLE epoch
            "x": r_teme[0],  # TEME Position X (km)
            "y": r_teme[1],  # TEME Position Y (km)
            "z": r_teme[2],  # TEME Position Z (km)
            "vx": vx,  # TEME Velocity X (km/s)
            "vy": vy,  # TEME Velocity Y (km/s)
            "vz": vz,  # TEME Velocity Z (km/s)
            "mean_anomaly": mean_anomaly,  # Mean anomaly (deg)
            "eccentric_anomaly": eccentric_anomaly,  # Eccentric anomaly (deg)
            "true_anomaly": true_anomaly,  # True anomaly (deg)
            "argument_of_latitude": argument_of_latitude,  # Argument of latitude (deg)
            "specific_angular_momentum": specific_angular_momentum,  # Specific angular momentum (km²/s)
            "radial_distance": radial_distance,  # Distance from Earth's center (km)
            "flight_path_angle": flight_path_angle,  # Angle between velocity vector and orbital plane (deg)
        }

    except Exception as e:
        print(f"❌ Error: {e}")
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
        -- ❌ **Invalid latitude/longitude**
        (latitude IS NULL OR longitude IS NULL OR altitude_km IS NULL OR 
        latitude = 'NaN' OR longitude = 'NaN' OR altitude_km = 'NaN') 

        -- ❌ **Objects that have already decayed (beyond 7-day threshold)**
        OR (decay_date IS NOT NULL AND decay_date < NOW() - INTERVAL '7 days')

        -- ❌ **LEO satellites with old TLE (> 7 days tracking)**
        OR (orbit_type = 'LEO' AND (epoch IS NULL OR epoch < NOW() - INTERVAL '30 days'))

        -- ❌ **MEO satellites with old TLE (> 30 days tracking)**
        OR (orbit_type = 'MEO' AND (epoch IS NULL OR epoch < NOW() - INTERVAL '180 days'))

        OR (orbit_type = 'GEO' AND (epoch IS NULL OR epoch < NOW() - INTERVAL '730 days'))

        -- ❌ **HEO satellites with different epoch limits**
        OR (
            orbit_type = 'HEO' AND (
                (perigee IS NOT NULL AND perigee < 2000 AND (epoch IS NULL OR epoch < NOW() - INTERVAL '30 days'))  -- 🚀 HEO Perigee < 2000 km → Max 30 days old
                OR
                (perigee IS NOT NULL AND perigee >= 2000 AND (epoch IS NULL OR epoch < NOW() - INTERVAL '365 days'))  -- 🚀 HEO Perigee > 2000 km → Max 3 months old
            )
        )

        -- ❌ **Invalid altitude handling & old TLE check**
        OR (altitude_km IS NULL OR altitude_km < 80);

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
    Computes satellite orbital parameters using SGP4 and converts TEME coordinates to geodetic.
    Includes additional computed orbital properties such as anomalies, specific angular momentum, and flight path angle.
    """
    try:
        if not tle_line1 or not tle_line2:
            print("❌ [ERROR] Missing TLE lines!")
            return None  # Error: Missing TLE

        try:
            satrec = Satrec.twoline2rv(tle_line1, tle_line2, WGS72)
        except Exception as e:
            print(f"❌ [ERROR] Invalid TLE parse failure: {e}")
            return None  # Error: TLE parse failure

        now = datetime.utcnow()
        obstime = Time(now, scale='utc')

        jd_total = obstime.jd
        jd = math.floor(jd_total)
        fr = jd_total - jd

        # 🚀 **Run SGP4 propagation**
        error_code, r, v = satrec.sgp4(jd, fr)
        if error_code != 0:
            print(f"❌ [ERROR] SGP4 propagation error code: {error_code}")
            return None  # Return error code

        # 🚀 **Check if values are realistic**
        if not all(map(math.isfinite, r)) or abs(r[0]) > 1e8 or abs(r[1]) > 1e8 or abs(r[2]) > 1e8:
            print(f"❌ [ERROR] SGP4 returned invalid position values: {r}")
            return None  # Invalid position values

        # 🚀 **Convert TEME to ITRS (geodetic coordinates)**
        try:
            teme_coord = TEME(x=r[0] * u.km, y=r[1] * u.km, z=r[2] * u.km, obstime=obstime)
            itrs_coord = teme_coord.transform_to(ITRS(obstime=obstime))

            lat_deg = itrs_coord.earth_location.lat.to(u.deg).value
            lon_deg = itrs_coord.earth_location.lon.to(u.deg).value
            alt_km = itrs_coord.earth_location.height.to(u.km).value

        except Exception as e:
            print(f"❌ [ERROR] Astropy transformation failed: {e}")
            return None  # Error: Astropy conversion failure

        # 🚀 **Sanity checks**
        if lat_deg is None or lon_deg is None or not (-90 <= lat_deg <= 90) or not (-180 <= lon_deg <= 180):
            print(f"❌ [ERROR] Computed lat/lon out of bounds: lat={lat_deg}, lon={lon_deg}")
            return None  # Error: Out-of-bounds lat/lon

        if not math.isfinite(alt_km) or alt_km < -50 or alt_km > 500000:
            print(f"❌ [ERROR] Computed altitude out of range: {alt_km} km")
            return None  # Error: Invalid altitude

        # 🚀 **Compute Additional Orbital Parameters**
        mu = 398600.4418  # Earth's gravitational parameter (km³/s²)
        semi_major_axis = (mu / (satrec.no_kozai**2))**(1/3) if satrec.no_kozai else None

        vx, vy, vz = v  # Velocity components in TEME frame (km/s)
        velocity = math.sqrt(vx**2 + vy**2 + vz**2) if all(map(math.isfinite, v)) else None

        # Compute Anomalies (Mean, Eccentric, True)
        mean_anomaly = satrec.mo * (180 / math.pi)
        eccentric_anomaly = mean_anomaly + (satrec.ecco * math.sin(math.radians(mean_anomaly)))  # Approximation
        true_anomaly = 2 * math.atan2(math.sqrt(1 + satrec.ecco) * math.sin(math.radians(eccentric_anomaly) / 2),
                                      math.sqrt(1 - satrec.ecco) * math.cos(math.radians(eccentric_anomaly) / 2))
        true_anomaly = math.degrees(true_anomaly)

        # Argument of Latitude
        argument_of_latitude = satrec.argpo * (180 / math.pi) + true_anomaly

        # Specific Angular Momentum (h)
        specific_angular_momentum = math.sqrt(mu * semi_major_axis * (1 - satrec.ecco**2)) if semi_major_axis else None

        # Radial Distance
        radial_distance = semi_major_axis * (1 - satrec.ecco * math.cos(math.radians(eccentric_anomaly))) if semi_major_axis else None

        # Flight Path Angle (γ)
        flight_path_angle = math.atan2(satrec.ecco * math.sin(math.radians(true_anomaly)),
                                       1 + satrec.ecco * math.cos(math.radians(true_anomaly)))
        flight_path_angle = math.degrees(flight_path_angle)

        # 🚀 **Return all computed values**
        return {
            "predicted_latitude": lat_deg,
            "predicted_longitude": lon_deg,
            "error_km": None,  # Placeholder; actual error computed elsewhere
            "predicted_altitude_km": alt_km,  # Altitude at TLE epoch  
            "predicted_velocity": velocity,  # Velocity at epoch  
            "predicted_x": r[0],  # TEME Position X (km)  
            "predicted_y": r[1],  # TEME Position Y (km)  
            "predicted_z": r[2],  # TEME Position Z (km)  
            "predicted_vx": vx,  # TEME Velocity X (km/s)  
            "predicted_vy": vy,  # TEME Velocity Y (km/s)  
            "predicted_vz": vz,  # TEME Velocity Z (km/s)  
            "predicted_mean_anomaly": mean_anomaly,  # Mean anomaly (deg)  
            "predicted_eccentric_anomaly": eccentric_anomaly,  # Eccentric anomaly (deg)  
            "predicted_true_anomaly": true_anomaly,  # True anomaly (deg)  
            "predicted_argument_of_latitude": argument_of_latitude,  # Argument of latitude (deg)  
            "predicted_specific_angular_momentum": specific_angular_momentum,  # Specific angular momentum (km²/s)  
            "predicted_radial_distance": radial_distance,  # Distance from Earth's center (km)  
            "predicted_flight_path_angle": flight_path_angle,  # Flight path angle (deg)  
        }

    except Exception as e:
        print(f"⚠️ [ERROR] SGP4 computation failed: {e}")
        traceback.print_exc()
        return None



def is_valid_lat_lon(latitude, longitude, altitude_km):
    """
    Ensures latitude, longitude, and altitude are valid (not NaN, None, or unrealistic).
    """
    if latitude is None or longitude is None or altitude_km is None:
        return False

    if isinstance(latitude, float) and math.isnan(latitude):
        return False
    if isinstance(longitude, float) and math.isnan(longitude):
        return False
    if isinstance(altitude_km, float) and math.isnan(altitude_km):
        return False

    # ✅ **Geographic Constraints**
    if not (-90 <= latitude <= 90):
        return False
    if not (-180 <= longitude <= 180):
        return False

    # ✅ **Altitude Constraints** (must be above -50 km to allow deep space probes & realistic)
    if altitude_km < -50 or altitude_km > 500000:
        return False

    return True


def compute_accuracy(sat):
    """
    Computes:
    - Accuracy percentage
    - Computed latitude and longitude
    - Error in kilometers (km)
    - Altitude (km)
    - SGP4 error code (0 = success, other values indicate failure)
    - Additional orbital parameters (Mean Anomaly, True Anomaly, etc.)
    - TEME Position and Velocity Components
    """

    computed_params = compute_sgp4_position1(sat["tle_line1"], sat["tle_line2"])

    if computed_params is None:
        return (None, None, None, None, None, None, None, None, None, None, 
                None, None, None, None, None, None, None, None, None, -5)  # ❌ SGP4 computation failed

    # Extract computed values
    lat = computed_params["predicted_latitude"]
    lon = computed_params["predicted_longitude"]
    altitude_km = computed_params["predicted_altitude_km"]
    velocity = computed_params["predicted_velocity"]
    mean_anomaly = computed_params["predicted_mean_anomaly"]
    eccentric_anomaly = computed_params["predicted_eccentric_anomaly"]
    true_anomaly = computed_params["predicted_true_anomaly"]
    argument_of_latitude = computed_params["predicted_argument_of_latitude"]
    specific_angular_momentum = computed_params["predicted_specific_angular_momentum"]
    radial_distance = computed_params["predicted_radial_distance"]
    flight_path_angle = computed_params["predicted_flight_path_angle"]

    # 🚀 **Include TEME Position and Velocity**
    predicted_x = computed_params["predicted_x"]
    predicted_y = computed_params["predicted_y"]
    predicted_z = computed_params["predicted_z"]
    predicted_vx = computed_params["predicted_vx"]
    predicted_vy = computed_params["predicted_vy"]
    predicted_vz = computed_params["predicted_vz"]

    # ✅ **Sanity check: Ensure valid computed values**
    if not is_valid_lat_lon(lat, lon, altitude_km):
        return (None, None, None, None, None, None, None, None, None, None, 
                None, None, None, None, None, None, None, None, None, -3)  # ❌ Invalid lat/lon/altitude

    # ✅ **Compute Accuracy by comparing with previous position**
    lat1, lon1, altitude_km1 = sat.get("computed_latitude"), sat.get("computed_longitude"), sat.get("predicted_altitude_km")

    if lat1 is not None and lon1 is not None:
        delta_lat = np.radians(lat1 - lat)
        delta_lon = np.radians(lon1 - lon)

        a = np.sin(delta_lat / 2) ** 2 + np.cos(np.radians(lat1)) * np.cos(np.radians(lat)) * np.sin(delta_lon / 2) ** 2
        c = 2 * np.arctan2(np.sqrt(a), np.sqrt(1 - a))
        error_km = EARTH_RADIUS_KM * c  # Convert to km

        # Accuracy scaling based on Earth's max angular error in degrees
        max_possible_error = 180  
        accuracy = max(0, 100 - (np.degrees(c) / max_possible_error) * 100)

        return (accuracy, lat, lon, error_km, altitude_km, velocity, mean_anomaly, eccentric_anomaly,
                true_anomaly, argument_of_latitude, specific_angular_momentum, radial_distance, 
                flight_path_angle, predicted_x, predicted_y, predicted_z, 
                predicted_vx, predicted_vy, predicted_vz)  # ✅ **Returns exactly 20 values**

    return (None, None, None, None, None, None, None, None, None, None, 
            None, None, None, None, None, None, None, None, None, 0 )  # ❌ **Returns exactly 20 values**



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
        for sat, (accuracy, lat, lon, error_km, altitude_km, velocity, mean_anomaly, eccentric_anomaly, 
                true_anomaly, argument_of_latitude, specific_angular_momentum, radial_distance, 
                flight_path_angle, predicted_x, predicted_y, predicted_z, 
                predicted_vx, predicted_vy, predicted_vz, error_code) in tqdm(
            zip(all_satellites, executor.map(compute_accuracy, all_satellites)), 
            total=len(all_satellites), desc="Computing accuracy", unit="sat"
        ):


            norad_number = sat.get("norad_number", None)

            if norad_number is None:
                skipped_norads.append(f"{sat['name']} (❌ Missing NORAD)")
                continue 

            if error_code != 0:
                skipped_norads.append(f"{sat['name']} (❌ ERROR CODE PREDICTION)")
                print(sat)
                #continue
                 



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



            # ✅ Assign real computed values (Accuracy & Position Error)
            sat["accuracy_percentage"] = accuracy  
            sat["predicted_latitude"] = lat  
            sat["predicted_longitude"] = lon  
            sat["error_km"] = error_km  
            # ✅ Assign predicted values
            sat["predicted_altitude_km"] = altitude_km  
            sat["predicted_velocity"] = velocity  
            # ✅ Assign **all** predicted computed values for TEME position & velocity
            sat["predicted_x"] = predicted_x  # TEME Position X (km)  
            sat["predicted_y"] = predicted_y  # TEME Position Y (km)  
            sat["predicted_z"] = predicted_z  # TEME Position Z (km)  
            sat["predicted_vx"] = predicted_vx  # TEME Velocity X (km/s)  
            sat["predicted_vy"] = predicted_vy  # TEME Velocity Y (km/s)  
            sat["predicted_vz"] = predicted_vz  # TEME Velocity Z (km/s)  
            sat["predicted_mean_anomaly"] = mean_anomaly  # Mean anomaly (deg)  
            sat["predicted_eccentric_anomaly"] = eccentric_anomaly  # Eccentric anomaly (deg)  
            sat["predicted_true_anomaly"] = true_anomaly  # True anomaly (deg)  
            sat["predicted_argument_of_latitude"] = argument_of_latitude  # Argument of latitude (deg)  
            sat["predicted_specific_angular_momentum"] = specific_angular_momentum  # Specific angular momentum (km²/s)  
            sat["predicted_radial_distance"] = radial_distance  # Distance from Earth's center (km)  
            sat["predicted_flight_path_angle"] = flight_path_angle  # Angle between velocity vector and orbital plane (deg)  

            

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
        
        # ✅ Updated columns (excluding accuracy-related fields)
        csv_writer.writerow([
            "name", "tle_line1", "tle_line2", "norad_number", "epoch",
            "inclination", "eccentricity", "mean_motion", "raan", "arg_perigee",
            "velocity", "latitude", "longitude", "orbit_type", "period",
            "perigee", "apogee", "semi_major_axis", "bstar", "rev_num",
            "ephemeris_type", "object_type", "launch_date", "launch_site",
            "decay_date", "rcs", "purpose", "country", "altitude_km",
            "x", "y", "z", "vx", "vy", "vz",
            "mean_anomaly", "eccentric_anomaly", "true_anomaly", "argument_of_latitude",
            "specific_angular_momentum", "radial_distance", "flight_path_angle"
        ])

        for sat in tqdm(batch, desc="Writing to CSV", unit="sat"):
            csv_writer.writerow([
                sat["name"], sat["tle_line1"], sat["tle_line2"], sat["norad_number"], sat["epoch"],
                sat["inclination"], sat["eccentricity"], sat["mean_motion"], sat["raan"], sat["arg_perigee"],
                sat["velocity"], sat["latitude"], sat["longitude"], sat["orbit_type"], sat["period"],
                sat["perigee"], sat["apogee"], sat["semi_major_axis"], sat["bstar"], sat["rev_num"],
                sat["ephemeris_type"], sat["object_type"], sat["launch_date"], sat["launch_site"],
                sat["decay_date"], sat["rcs"], sat["purpose"], sat["country"], sat["altitude_km"],
                sat["x"], sat["y"], sat["z"], sat["vx"], sat["vy"], sat["vz"],
                sat["mean_anomaly"], sat["eccentric_anomaly"], sat["true_anomaly"], sat["argument_of_latitude"],
                sat["specific_angular_momentum"], sat["radial_distance"], sat["flight_path_angle"]
            ])

        temp_file_path = temp_file.name

    # Drop and recreate temp_satellites to ensure it has all columns
    cursor.execute("DROP TABLE IF EXISTS temp_satellites;")
    cursor.execute("CREATE UNLOGGED TABLE temp_satellites AS TABLE satellites WITH NO DATA;")
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
                decay_date, rcs, purpose, country, altitude_km,
                x, y, z, vx, vy, vz,
                mean_anomaly, eccentric_anomaly, true_anomaly, argument_of_latitude,
                specific_angular_momentum, radial_distance, flight_path_angle
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
            decay_date, rcs, purpose, country, altitude_km,
            x, y, z, vx, vy, vz,
            mean_anomaly, eccentric_anomaly, true_anomaly, argument_of_latitude,
            specific_angular_momentum, radial_distance, flight_path_angle
        )
        SELECT 
            name, tle_line1, tle_line2, norad_number, epoch,
            inclination, eccentricity, mean_motion, raan, arg_perigee,
            velocity, latitude, longitude, orbit_type, period,
            perigee, apogee, semi_major_axis, bstar, rev_num,
            ephemeris_type, object_type, launch_date, launch_site,
            decay_date, rcs, purpose, country, altitude_km,
            x, y, z, vx, vy, vz,
            mean_anomaly, eccentric_anomaly, true_anomaly, argument_of_latitude,
            specific_angular_momentum, radial_distance, flight_path_angle
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
            altitude_km = EXCLUDED.altitude_km,
            x = EXCLUDED.x,
            y = EXCLUDED.y,
            z = EXCLUDED.z,
            vx = EXCLUDED.vx,
            vy = EXCLUDED.vy,
            vz = EXCLUDED.vz,
            mean_anomaly = EXCLUDED.mean_anomaly,
            eccentric_anomaly = EXCLUDED.eccentric_anomaly,
            true_anomaly = EXCLUDED.true_anomaly,
            argument_of_latitude = EXCLUDED.argument_of_latitude,
            specific_angular_momentum = EXCLUDED.specific_angular_momentum,
            radial_distance = EXCLUDED.radial_distance,
            flight_path_angle = EXCLUDED.flight_path_angle
        WHERE main.epoch != EXCLUDED.epoch;
    """)

    conn.commit()
    cursor.close()
    conn.close()
    os.remove(temp_file_path)

    print(f"✅ Successfully processed {len(batch)} satellites using COPY + UPSERT.")
    print(f"✅ Historical TLEs added where epoch changed.")
    print(f"⚠️ {len(skipped_norads)} satellites were skipped.")
   

if __name__ == "__main__":
    update_cdm_data()
    update_satellite_data()
    
