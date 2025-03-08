
# /backend/app/tle_processor.py

from tqdm import tqdm
from dotenv import load_dotenv
import os
import requests
from database import get_db_connection  # ✅ Use get_db_connection()

load_dotenv()
SPACETRACK_USER = os.getenv("SPACETRACK_USER")
SPACETRACK_PASS = os.getenv("SPACETRACK_PASS")
COOKIES_FILE = "cookies.txt"  # Ensure this is the correct cookie file path
TLE_FILE_PATH = "tle_latest.json"  # ✅ Store TLE data locally
CDM_API_URL = "https://www.space-track.org/basicspacedata/query/class/cdm_public/format/json"




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


if __name__ == "__main__":
    update_cdm_data()