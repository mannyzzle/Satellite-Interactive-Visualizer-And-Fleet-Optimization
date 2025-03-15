import os
import json
import time
import datetime
import requests
from psycopg2.extras import execute_values
from database import get_db_connection

# ✅ Constants
DATA_FOLDER = "data"
FILE_PATH = os.path.join(DATA_FOLDER, "launches.json")

# ✅ Ensure data folder exists
os.makedirs(DATA_FOLDER, exist_ok=True)

# ✅ Fetch Launch Data
def fetch_and_save_launches():
    """Fetches launch data (future & past 50 launches) and saves to a JSON file."""
    today_date = datetime.datetime.now(datetime.UTC).strftime("%Y-%m-%dT%H:%M:%SZ")

    urls = {
        "future": f"https://ll.thespacedevs.com/2.3.0/launches/?format=json&ordering=-last_updated&window_start__gte={today_date}&limit=75",
        "past": f"https://ll.thespacedevs.com/2.3.0/launches/?format=json&ordering=-last_updated&window_end__lte={today_date}&limit=75"
    }

    all_launches = []

    for key, url in urls.items():
        try:
            print(f"📡 Fetching {key} launches from: {url}")
            response = requests.get(url, timeout=10)

            print(f"🔍 HTTP Status Code: {response.status_code}")

            if response.status_code == 429:  # API Throttling
                wait_time = int(response.headers.get("Retry-After", 15))
                print(f"⏳ API is throttling. Waiting {wait_time} seconds...")
                time.sleep(wait_time)
                continue  # Retry request

            if response.status_code != 200:
                print(f"❌ API Request Failed: {response.text}")
                return

            data = response.json()
            launches = data.get("results", [])
            all_launches.extend(launches)

            print(f"✅ {len(launches)} {key} launches fetched.")

        except requests.exceptions.RequestException as e:
            print(f"❌ Request failed: {e}")

    # Save to a JSON file
    with open(FILE_PATH, "w") as file:
        json.dump(all_launches, file, indent=2)

    print(f"📂 Data saved to {FILE_PATH}")


# ✅ Load Launch Data from File
def load_launches_from_file():
    """Loads launch data from local JSON file."""
    if not os.path.exists(FILE_PATH):
        print("⚠ No saved launch data found. Fetching new data...")
        fetch_and_save_launches()

    with open(FILE_PATH, "r") as file:
        return json.load(file)


# ✅ Store Launch Data in PostgreSQL
def store_launches(launches):
    """Parses and inserts launch data into PostgreSQL."""
    conn = get_db_connection()
    cursor = conn.cursor()

    sql = """
    INSERT INTO launches (
        id, name, mission_description, image_url, launch_date, launch_status, 
        rocket_name, pad_name, map_url, payload_name, payload_orbit, mission_type, 
        orbit_abbrev, mission_agency, vehicle_type, crew_count, reused_rocket, 
        fairing_recovered, payload_mass_kg, payload_customer, launch_cost_million, 
        video_url, launch_success, failure_reason, weather_conditions, booster_count, 
        recovery_ship, landing_type, landing_success, last_updated
    ) VALUES %s
    ON CONFLICT (id) DO UPDATE 
    SET 
        name = EXCLUDED.name,
        mission_description = EXCLUDED.mission_description,
        image_url = EXCLUDED.image_url,
        launch_date = EXCLUDED.launch_date,
        launch_status = EXCLUDED.launch_status,
        rocket_name = EXCLUDED.rocket_name,
        pad_name = EXCLUDED.pad_name,
        map_url = EXCLUDED.map_url,
        payload_name = EXCLUDED.payload_name,
        payload_orbit = EXCLUDED.payload_orbit,
        mission_type = EXCLUDED.mission_type,
        orbit_abbrev = EXCLUDED.orbit_abbrev,
        mission_agency = EXCLUDED.mission_agency,
        vehicle_type = EXCLUDED.vehicle_type,
        crew_count = EXCLUDED.crew_count,
        reused_rocket = EXCLUDED.reused_rocket,
        fairing_recovered = EXCLUDED.fairing_recovered,
        payload_mass_kg = EXCLUDED.payload_mass_kg,
        payload_customer = EXCLUDED.payload_customer,
        launch_cost_million = EXCLUDED.launch_cost_million,
        video_url = EXCLUDED.video_url,
        launch_success = EXCLUDED.launch_success,
        failure_reason = EXCLUDED.failure_reason,
        weather_conditions = EXCLUDED.weather_conditions,
        booster_count = EXCLUDED.booster_count,
        recovery_ship = EXCLUDED.recovery_ship,
        landing_type = EXCLUDED.landing_type,
        landing_success = EXCLUDED.landing_success,
        last_updated = EXCLUDED.last_updated;
    """

    values_list = []

    for launch in launches:
        try:
            agencies = launch.get("mission", {}).get("agencies", [])
            mission_agency = agencies[0].get("name", "Unknown Customer") if agencies else "Unknown Customer"

            values = (
                str(launch.get("id", "")),  
                launch.get("name", "Unknown"),
                launch.get("mission", {}).get("description", "No description"),
                launch.get("image", {}).get("image_url", None),
                launch.get("net"),
                launch.get("status", {}).get("name", "Unknown"),
                launch.get("rocket", {}).get("configuration", {}).get("full_name", "Unknown Rocket"),
                launch.get("pad", {}).get("name", "Unknown Pad"),
                launch.get("pad", {}).get("map_url", None),
                launch.get("mission", {}).get("name", "Unknown Payload"),
                launch.get("mission", {}).get("orbit", {}).get("name", "Unknown Orbit"),
                launch.get("mission", {}).get("type", "Unknown"),
                launch.get("mission", {}).get("orbit", {}).get("abbrev", None),
                mission_agency,
                launch.get("rocket", {}).get("configuration", {}).get("variant", None),
                int(launch.get("is_crewed", 0)),  
                bool(launch.get("rocket", {}).get("reused", False)),  
                bool(launch.get("rocket", {}).get("fairings_recovered", False)),  
                launch.get("rocket", {}).get("spacecraft_stage", {}).get("payload_mass_kg", None),
                mission_agency,  
                launch.get("rocket", {}).get("configuration", {}).get("cost", None),
                launch.get("vid_urls", [None])[0],
                launch.get("status", {}).get("abbrev", "") == "Success",  
                launch.get("failreason", ""),
                launch.get("weather_concerns", None),
                len(launch.get("rocket", {}).get("stages", [])),  
                launch.get("rocket", {}).get("landing_ship", None),
                launch.get("rocket", {}).get("landing_type", None),
                bool(launch.get("rocket", {}).get("landing_success", False)),  
                launch.get("last_updated")
            )

            values_list.append(values)

        except Exception as e:
            print(f"❌ Error processing launch {launch.get('name', 'Unknown')}: {e}")

    # ✅ Bulk Insert
    if values_list:
        execute_values(cursor, sql, values_list)

    conn.commit()
    cursor.close()
    conn.close()
    print("✅ Data successfully inserted/updated!")


# ✅ Run Script
if __name__ == "__main__":
    launches = load_launches_from_file()
    store_launches(launches)
