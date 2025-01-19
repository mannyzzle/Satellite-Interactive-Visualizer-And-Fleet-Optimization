import psycopg2
from skyfield.api import EarthSatellite
from dotenv import load_dotenv
from tqdm import tqdm
import os

# Load environment variables
load_dotenv()

# Connect to the database
def connect_to_db():
    return psycopg2.connect(
        host=os.getenv("DB_HOST"),
        database=os.getenv("DB_NAME"),
        user=os.getenv("DB_USER"),
        password=os.getenv("DB_PASSWORD"),
    )

# Compare raw mean motion and kozai mean motion for the first 10 satellites
def compare_mean_motion():
    conn = connect_to_db()
    cursor = conn.cursor()
    cursor.execute("SELECT id, tle_line1, tle_line2 FROM satellites LIMIT 10")
    rows = cursor.fetchall()

    print(f"Total satellites (first 10): {len(rows)}")
    print(f"{'ID':<10} {'Raw Mean Motion':<20} {'Kozai Mean Motion':<20} {'TLE Line 2'}")

    for row in tqdm(rows, desc="Comparing Mean Motion"):
        sat_id, tle_line1, tle_line2 = row
        try:
            satellite = EarthSatellite(tle_line1, tle_line2)
            raw_mean_motion = satellite.model.no  # Raw mean motion
            kozai_mean_motion = satellite.model.no_kozai  # Kozai mean motion
            
            print(f"{sat_id:<10} {raw_mean_motion:<20} {kozai_mean_motion:<20} {tle_line2}")
        
        except Exception as e:
            print(f"Error processing satellite ID {sat_id}: {e}")

    cursor.close()
    conn.close()

if __name__ == "__main__":
    print("Connecting to the database...")
    compare_mean_motion()
