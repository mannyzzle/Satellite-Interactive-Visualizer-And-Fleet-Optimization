
# /backend/app/tle_processor.py

# /backend/app/tle_processor.py

from tqdm import tqdm
from dotenv import load_dotenv
import os
import requests
import sys  # <-- NEW: for isatty()
from database import get_db_connection  # ✅ Use get_db_connection()
from datetime import datetime, timezone
import datetime as dt  # to differentiate
from dateutil import parser  # ✅ Used for parsing datetime strings
from dotenv import load_dotenv
from database import get_db_connection  # ✅ Your database connection function


load_dotenv()
SPACETRACK_USER = os.getenv("SPACETRACK_USER")
SPACETRACK_PASS = os.getenv("SPACETRACK_PASS")
COOKIES_FILE = "cookies.txt"
CDM_API_URL = "https://www.space-track.org/basicspacedata/query/class/cdm_public/format/json"


def get_spacetrack_session():
    """Logs in to Space-Track and returns an authenticated session."""
    session = requests.Session()
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





def expired_cdms():
    """
    Marks CDM events as inactive if their TCA (Time of Closest Approach) is in the past.
    This preserves historical data while keeping active monitoring relevant.
    """
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("""
        UPDATE cdm_events 
        SET is_active = FALSE 
        WHERE tca < NOW() AND is_active = TRUE;
    """)
    
    updated_count = cursor.rowcount
    conn.commit()
    cursor.close()
    conn.close()

    print(f"🔄 Marked {updated_count} past CDM events as inactive.")




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

    is_tty = sys.stdout.isatty()

    for cdm in tqdm(
        cdm_data,
        desc="📡 Processing CDM data",
        unit="CDM",
        miniters=500,
        mininterval=2.0,
        disable=not is_tty
    ):
        try:
            # Parse and ensure TIMEZONE-AWARE datetimes for CREATED and TCA
            created_str = cdm.get("CREATED")
            tca_str = cdm.get("TCA")

            if not created_str or not tca_str:
                # Missing essential timestamps, skip
                continue

            created_dt = parser.parse(created_str)
            tca_dt = parser.parse(tca_str)

            # If the parsed datetime is naive (no tzinfo), assume UTC
            if created_dt.tzinfo is None:
                created_dt = created_dt.replace(tzinfo=timezone.utc)
            if tca_dt.tzinfo is None:
                tca_dt = tca_dt.replace(tzinfo=timezone.utc)

            required_fields = {
                "CDM_ID": int(cdm.get("CDM_ID", -1)),
                "CREATED": created_dt,
                "TCA": tca_dt,
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

            # If any required field is missing or invalid, skip
            if None in required_fields.values():
                continue

            optional_fields = {
                "SAT1_RCS": cdm.get("SAT1_RCS", "Unknown"),
                "SAT_1_EXCL_VOL": safe_float(cdm.get("SAT_1_EXCL_VOL")) or 0.0,
                "SAT2_RCS": cdm.get("SAT2_RCS", "Unknown"),
                "SAT_2_EXCL_VOL": safe_float(cdm.get("SAT_2_EXCL_VOL")) or 0.0
            }

            # Determine active status based on whether TCA is in the future
            now_utc = dt.datetime.now(timezone.utc)
            is_active = tca_dt >= now_utc

            cdm_entry = {
                **required_fields,
                **optional_fields,
                "IS_ACTIVE": is_active
            }

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
                    %(EMERGENCY_REPORTABLE)s, %(IS_ACTIVE)s
                )
                ON CONFLICT (cdm_id) DO UPDATE SET
                    created = EXCLUDED.created,
                    tca = EXCLUDED.tca,
                    min_rng = EXCLUDED.min_rng,
                    pc = EXCLUDED.pc,
                    sat_1_id = EXCLUDED.sat_1_id,
                    sat_1_name = EXCLUDED.sat_1_name,
                    sat_1_type = EXCLUDED.sat_1_type,
                    sat_1_rcs = EXCLUDED.sat_1_rcs,
                    sat_1_excl_vol = EXCLUDED.sat_1_excl_vol,
                    sat_2_id = EXCLUDED.sat_2_id,
                    sat_2_name = EXCLUDED.sat_2_name,
                    sat_2_type = EXCLUDED.sat_2_type,
                    sat_2_rcs = EXCLUDED.sat_2_rcs,
                    sat_2_excl_vol = EXCLUDED.sat_2_excl_vol,
                    emergency_reportable = EXCLUDED.emergency_reportable,
                    is_active = EXCLUDED.is_active;
            """, cdm_entry)

        except Exception as e:
            tqdm.write(f"⚠️ Error inserting CDM ID {cdm.get('CDM_ID', 'Unknown')}: {e}")

    conn.commit()
    cursor.close()
    conn.close()

    print(f"✅ Inserted/updated valid CDM events.")







def update_cdm_data():
    """Main function to update CDM data: remove expired & insert new."""
    print("\n🚀 Updating CDM data...")
    session = get_spacetrack_session()
    if not session:
        print("❌ Could not authenticate with Space-Track. Exiting update process.")
        return

    expired_cdms()
    cdm_data = fetch_cdm_data(session)
    insert_new_cdms(cdm_data)

    print("✅ CDM update completed.\n")


if __name__ == "__main__":
    update_cdm_data()
