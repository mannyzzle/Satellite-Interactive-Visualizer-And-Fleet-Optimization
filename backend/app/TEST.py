import psycopg2
from skyfield.api import load
from tqdm import tqdm
from datetime import datetime, timedelta
from dotenv import load_dotenv
import os
import requests
import json
from database import get_db_connection  # ✅ Use get_db_connection()

# Load environment variables
load_dotenv()
ts = load.timescale()
SPACETRACK_USER = os.getenv("SPACETRACK_USER")
SPACETRACK_PASS = os.getenv("SPACETRACK_PASS")
COOKIES_FILE = "cookies.txt"
SATCAT_FILE = "satcat.json"
API_WAIT_TIME = 3  # ✅ Complies with API rate limits


# ✅ Space-Track Authentication
def get_spacetrack_session():
    session = requests.Session()
    login_url = "https://www.space-track.org/ajaxauth/login"
    payload = {"identity": SPACETRACK_USER, "password": SPACETRACK_PASS}
    response = session.post(login_url, data=payload)
    
    if response.status_code == 200:
        print("✅ Space-Track login successful.")
        return session
    else:
        print(f"❌ Space-Track login failed! HTTP {response.status_code}")
        return None


# ✅ Fetch SATCAT Data and Save to File
def fetch_satcat_data(session):
    satcat_url = "https://www.space-track.org/basicspacedata/query/class/satcat/format/json"
    response = session.get(satcat_url)
    
    if response.status_code == 200:
        satcat_data = response.json()
        with open(SATCAT_FILE, "w") as f:
            json.dump(satcat_data, f, indent=2)
        print(f"✅ SATCAT data saved to {SATCAT_FILE} ({len(satcat_data)} objects).")
    else:
        print(f"❌ Failed to fetch SATCAT data. HTTP {response.status_code}")


# ✅ Fetch TLEs for Recent Launches (Last 30 Days)
def fetch_recent_tles(session):
    start_date = (datetime.utcnow() - timedelta(days=30)).strftime("%Y-%m-%d")
    tle_url = f"https://www.space-track.org/basicspacedata/query/class/gp/DECAY/null/LAUNCH>{start_date}/orderby/NORAD_CAT_ID/format/json"
    response = session.get(tle_url)
    
    if response.status_code == 200:
        tle_data = response.json()
        print(f"✅ Fetched {len(tle_data)} recent TLEs from Space-Track.")
        return tle_data
    else:
        print(f"❌ Failed to fetch recent TLEs. HTTP {response.status_code}")
        return []


# ✅ Insert/Update Database

def update_database(satcat_data, tle_data):
    conn = get_db_connection()
    cur = conn.cursor()
    
    for sat in tqdm(satcat_data, desc="📡 Updating SATCAT"):
        cur.execute(
            """
            INSERT INTO satcat (norad_id, name, launch_date, decay_date, object_type)
            VALUES (%s, %s, %s, %s, %s)
            ON CONFLICT (norad_id) DO UPDATE SET
            name = EXCLUDED.name, launch_date = EXCLUDED.launch_date,
            decay_date = EXCLUDED.decay_date, object_type = EXCLUDED.object_type;
            """,
            (sat.get("NORAD_CAT_ID"), sat.get("OBJECT_NAME"), sat.get("LAUNCH"), sat.get("DECAY"), sat.get("OBJECT_TYPE")),
        )
    
    for tle in tqdm(tle_data, desc="📡 Updating TLEs"):
        cur.execute(
            """
            INSERT INTO tle (norad_id, tle_line1, tle_line2, epoch)
            VALUES (%s, %s, %s, %s)
            ON CONFLICT (norad_id) DO UPDATE SET
            tle_line1 = EXCLUDED.tle_line1, tle_line2 = EXCLUDED.tle_line2, epoch = EXCLUDED.epoch;
            """,
            (tle.get("NORAD_CAT_ID"), tle.get("TLE_LINE1"), tle.get("TLE_LINE2"), tle.get("EPOCH")),
        )
    
    conn.commit()
    cur.close()
    conn.close()
    print("✅ Database updated.")


# ✅ Main Execution
if __name__ == "__main__":
    session = get_spacetrack_session()
    
    if session:
        fetch_satcat_data(session)
        
        with open(SATCAT_FILE, "r") as f:
            satcat_data = json.load(f)
        
        tle_data = fetch_recent_tles(session)
        update_database(satcat_data, tle_data)