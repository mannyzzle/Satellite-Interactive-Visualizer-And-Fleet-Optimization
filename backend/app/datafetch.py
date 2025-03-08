# /backend/app/tle_processor.py
from datetime import datetime, timedelta
from dotenv import load_dotenv
from variables import compute_orbital_params, infer_purpose
import os
import requests
import time
import json
from datetime import datetime, timezone
# ✅ Load latest IERS data
load_dotenv()
SPACETRACK_USER = os.getenv("SPACETRACK_USER")
SPACETRACK_PASS = os.getenv("SPACETRACK_PASS")
COOKIES_FILE = "cookies.txt"  # Ensure this is the correct cookie file path
TLE_FILE_PATH = "tle_latest.json"  # ✅ Store TLE data locally


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
                
        if (epoch is None or epoch < now - timedelta(days=730) or epoch > now):
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
                six_months_ago = now - timedelta(days=180)  # **MEO extended to 6 months**
                one_year_ago = now - timedelta(days=365)  # **HEO & GEO extended to 1 year**
                six_months1_ago = now - timedelta(days=365)  # **GEO max 1 year**
            else:
                seven_days_ago = now - timedelta(days=7)  # **LEO tracking mode**
                six_months_ago = now - timedelta(days=30)  # **MEO tracking mode**
                one_year_ago = now - timedelta(days=90)  # **HEO & GEO standard limits**
                six_months1_ago = now - timedelta(days=180)  # **GEO max 6 months in tracking mode**


            if ((decay_date is not None and decay_date < now - timedelta(days=7))):
                continue
                

            if (
                # ❌ **Invalid latitude/longitude**
                (latitude in ["NaN", None] or longitude in ["NaN", None] or altitude_km in ["NaN", None]) or  

                # ❌ **LEO satellites with old TLE**
                (orbit_type == "LEO" and (epoch is None or epoch < seven_days_ago)) or  

                # ❌ **MEO satellites with old TLE**
                (orbit_type == "MEO" and (epoch is None or epoch < six_months_ago)) or  

                # ❌ **HEO satellites with different epoch limits**
                ((orbit_type == "HEO") and (
                    (perigee is not None and perigee < 2000 and (epoch is None or epoch < now - timedelta(days=30))) or  
                    (perigee is not None and perigee >= 2000 and (epoch is None or epoch < one_year_ago))  
                )) 
                
                or (orbit_type == "GEO" and (epoch is None or epoch < now - timedelta(days=730))  ) or

                
                ((altitude_km is None or altitude_km < 80))
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

            

            # ✅ Add to filtered satellites & prevent future duplicates
            filtered_satellites.append(sat_data)
            seen_norads.add(norad_number)

        except Exception as e:
            print(f"⚠️ Error processing satellite {sat.get('OBJECT_NAME', 'Unknown')} (NORAD {norad_number}): {e}")

    print(f"✅ Returning {len(filtered_satellites)} satellites (filtered for active and valid lat/lon).")
    return filtered_satellites




