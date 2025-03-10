import os
import sys
import requests
import datetime
import psycopg2
import re
from tqdm import tqdm
from dateutil import parser
from psycopg2.extras import execute_values
from database import get_db_connection
import json

# Directory for downloaded files
OUTPUT_DIR = "space_weather_data"
os.makedirs(OUTPUT_DIR, exist_ok=True)

# -------------------------------
# 📌 1) Download Functions
# -------------------------------

def download_file(url, filename):
    """Download file from NOAA and save locally."""
    local_path = os.path.join(OUTPUT_DIR, filename)
    print(f"📥 Downloading {filename} from {url} ...")
    
    r = requests.get(url, timeout=15)
    r.raise_for_status()
    
    with open(local_path, "wb") as f:
        f.write(r.content)
    
    print(f"✅ Saved {filename} to {local_path}")
    return local_path

# -------------------------------
# 📌 2) Parsing Functions
# -------------------------------





def parse_f107(filepath):
    """Parse F10.7 flux, sunspots, X-ray flux, and solar flares from NOAA data."""
    data = []
    with open(filepath, "r") as f:
        for line in f:
            parts = line.split()
            
            # Ignore headers and malformed lines (ensure at least 9 columns exist)
            if len(parts) < 9 or not parts[0].isdigit():
                continue
            
            try:
                # Extract Date
                year, month, day = int(parts[0]), int(parts[1]), int(parts[2])
                date = datetime.date(year, month, day)

                # Extract F10.7 Radio Flux
                f107 = float(parts[3]) if parts[3] != "-999" else None  # Convert -999 to None

                # Extract SESC Sunspot Number
                sunspot_number = int(parts[4]) if parts[4] != "-999" else None

                # Extract Sunspot Area (in 10⁻⁶ hemispheres)
                sunspot_area = int(parts[5]) if parts[5] != "-999" else None

                # Extract Number of New Regions
                new_regions = int(parts[6]) if parts[6] != "-999" else None

                # Extract Mean Magnetic Field (Stanford)
                mean_field = float(parts[7]) if parts[7] != "-999" else None

                # Extract GOES X-Ray Background Flux (if available, otherwise None)
                xray_flux = float(parts[8]) if parts[8] != "*" else None

                # Extract Solar Flare Counts (C, M, X-Class)
                flare_c = int(parts[9]) if parts[9] != "-999" else None
                flare_m = int(parts[10]) if parts[10] != "-999" else None
                flare_x = int(parts[11]) if parts[11] != "-999" else None

                # Append parsed data as a tuple
                data.append((date, f107, sunspot_number, sunspot_area, new_regions, mean_field, xray_flux, flare_c, flare_m, flare_x))

            except ValueError:
                print(f"⚠️ Skipping malformed line: {line}")
                continue  # Skip bad lines

    return data



def parse_geomagnetic_data(filepath):
    """Parse geomagnetic data from the DGD.txt file."""
    data = []
    
    with open(filepath, "r") as file:
        for line in file:
            line = line.strip()
            if line and line[0].isdigit():  # Ensure the line contains data
                parts = line.split()
                
                # Extract Date
                date = datetime.date(int(parts[0]), int(parts[1]), int(parts[2]))

                try:
                    # Extract 'Estimated Planetary A' Index
                    ap_index = float(parts[-9]) if parts[-9] != "-1" else None

                    # Extract 'Estimated Planetary Kp' Indices (Last 8 values)
                    kp_values = [float(parts[i]) if parts[i] != "-1" else None for i in range(-8, 0)]

                    # Replace -1 with None for missing data
                    kp_values = [None if v == -1 else v for v in kp_values]

                    # Append to dataset
                    data.append((date, ap_index, *kp_values))

                except (IndexError, ValueError):
                    print(f"⚠️ Skipping malformed line: {line}")
                    continue  # Skip malformed lines

    return data



def parse_dst(filepath):
    """Parse Dst data from JSON file with full timestamp."""

    with open(filepath, "r") as f:
        data_json = json.load(f)

    data = []
    for entry in data_json:
        try:
            timestamp = parser.parse(entry["time_tag"])  # Full timestamp
            dst_index = float(entry["dst"])
            data.append((timestamp, dst_index))  # Store full timestamp
        except:
            continue
    return data







def parse_solar_wind(file_path):
    """Parse solar wind data, filtering out invalid values."""
    with open(file_path, "r") as file:
        data = json.load(file)

    clean_data = [
        (entry["time_tag"], entry["dens"], entry["speed"], entry["temperature"])
        for entry in data
        if entry["dens"] is not None and entry["speed"] is not None and entry["temperature"] is not None
    ]
    
    return clean_data


# -------------------------------
# 📌 3) Database Functions
# -------------------------------



def insert_f107(data):
    """Insert F10.7 solar flux and related solar activity into PostgreSQL."""
    if not data:
        print("⚠️ No F10.7 data to insert.")
        return

    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS f107_flux (
            date DATE PRIMARY KEY,
            f107 FLOAT,
            sunspot_number INT,
            sunspot_area INT,
            new_regions INT,
            mean_field FLOAT,
            xray_flux FLOAT,
            flare_c INT,
            flare_m INT,
            flare_x INT
        );
    """)

    execute_values(cursor, """
        INSERT INTO f107_flux (
            date, f107, sunspot_number, sunspot_area, new_regions, mean_field, xray_flux, flare_c, flare_m, flare_x
        )
        VALUES %s
        ON CONFLICT (date) DO UPDATE SET
            f107 = EXCLUDED.f107,
            sunspot_number = EXCLUDED.sunspot_number,
            sunspot_area = EXCLUDED.sunspot_area,
            new_regions = EXCLUDED.new_regions,
            mean_field = EXCLUDED.mean_field,
            xray_flux = EXCLUDED.xray_flux,
            flare_c = EXCLUDED.flare_c,
            flare_m = EXCLUDED.flare_m,
            flare_x = EXCLUDED.flare_x;
    """, data)

    conn.commit()
    cursor.close()
    conn.close()
    print(f"✅ Inserted {len(data)} F10.7 records into DB")





def insert_geomagnetic(data):
    """Insert Ap/Kp indices into PostgreSQL."""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS geomagnetic_indices (
            date DATE PRIMARY KEY,
            ap_index FLOAT,
            kp1 FLOAT, kp2 FLOAT, kp3 FLOAT, kp4 FLOAT,
            kp5 FLOAT, kp6 FLOAT, kp7 FLOAT, kp8 FLOAT
        );
    """)
    
    execute_values(cursor, """
        INSERT INTO geomagnetic_indices 
        (date, ap_index, kp1, kp2, kp3, kp4, kp5, kp6, kp7, kp8)
        VALUES %s
        ON CONFLICT (date) DO UPDATE SET
        ap_index = EXCLUDED.ap_index,
        kp1 = EXCLUDED.kp1, kp2 = EXCLUDED.kp2, kp3 = EXCLUDED.kp3, kp4 = EXCLUDED.kp4,
        kp5 = EXCLUDED.kp5, kp6 = EXCLUDED.kp6, kp7 = EXCLUDED.kp7, kp8 = EXCLUDED.kp8;
    """, data)
    
    conn.commit()
    cursor.close()
    conn.close()
    print(f"✅ Inserted {len(data)} Geomagnetic records into DB")






def insert_dst(data):
    """Insert Dst index into PostgreSQL, ensuring unique timestamps."""
    if not data:
        print("⚠️ No Dst data to insert.")
        return
    
    conn = get_db_connection()
    cursor = conn.cursor()
    
    try:
        # Ensure the table exists
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS dst_index (
                time TIMESTAMP PRIMARY KEY,
                dst FLOAT
            );
        """)

        # Batch insert using execute_values to handle large datasets
        execute_values(cursor, """
            INSERT INTO dst_index (time, dst)
            VALUES %s
            ON CONFLICT (time) DO UPDATE SET dst = EXCLUDED.dst;
        """, data)

        conn.commit()  # Commit only after successful execution

    except psycopg2.Error as e:
        print(f"❌ Database Error: {e}")
        conn.rollback()  # Rollback on failure
    finally:
        cursor.close()  # Ensure cursor is closed properly
        conn.close()  # Ensure connection is closed properly

    print(f"✅ Inserted {len(data)} Dst records into DB")




def insert_solar_wind(data):
    """Insert solar wind data into PostgreSQL while preventing duplicate conflicts."""
    if not data:
        print("⚠️ No valid solar wind data to insert.")
        return

    conn = get_db_connection()
    cursor = conn.cursor()

    try:
        # Ensure the table exists
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS solar_wind (
                time TIMESTAMP PRIMARY KEY,
                density FLOAT,
                speed FLOAT,
                temperature FLOAT
            );
        """)

        # Remove duplicate timestamps before inserting
        unique_data = {time: (density, speed, temperature) for time, density, speed, temperature in data}
        cleaned_data = [(time, density, speed, temperature) for time, (density, speed, temperature) in unique_data.items()]

        # Insert values safely
        execute_values(cursor, """
            INSERT INTO solar_wind (time, density, speed, temperature)
            VALUES %s
            ON CONFLICT (time) DO UPDATE SET
                density = EXCLUDED.density,
                speed = EXCLUDED.speed,
                temperature = EXCLUDED.temperature;
        """, cleaned_data)

        conn.commit()  # Commit only after successful execution

    except psycopg2.Error as e:
        print(f"❌ Database Error: {e}")
        conn.rollback()  # Rollback on failure
    finally:
        cursor.close()  # Ensure cursor is closed properly
        conn.close()  # Ensure connection is closed properly

    print(f"✅ Inserted {len(cleaned_data)} Solar Wind records into DB")


# -------------------------------
# 📌 4) Main Execution
# -------------------------------

# -------------------------------
# 📌 4) Main Execution
# -------------------------------

def fetch_all():
    """Fetch all space weather datasets."""
    f107_path = download_file("https://services.swpc.noaa.gov/text/daily-solar-indices.txt", "F1O7.txt")
    geomagnetic_path = download_file("https://services.swpc.noaa.gov/text/daily-geomagnetic-indices.txt", "geomagnetic_indices.txt")
    dst_path = download_file("https://services.swpc.noaa.gov/json/geospace/geospace_dst_7_day.json", "DST.json")
    solar_wind_path = download_file("https://services.swpc.noaa.gov/json/ace/swepam/ace_swepam_1h.json", "solar_wind.json")

    return {
        "f107": f107_path,
        "geomagnetic": geomagnetic_path,
        "dst": dst_path,
        "solar_wind": solar_wind_path
    }

def insert_all(data_files):
    """Insert all datasets into DB."""
    insert_f107(parse_f107(data_files["f107"]))
    insert_geomagnetic(parse_geomagnetic_data(data_files["geomagnetic"]))
    insert_dst(parse_dst(data_files["dst"]))
    insert_solar_wind(parse_solar_wind(data_files["solar_wind"]))

def main():
    """Main function to fetch, parse, and insert space weather data in one step."""

    if len(sys.argv) > 1:
        task = sys.argv[1]

        if task == "fetch_all":
            print("📥 Fetching, parsing, and inserting all space weather data...")
            data_files = fetch_all()
            insert_all(data_files)

        elif task == "fetch_f107":
            print("📥 Fetching, parsing, and inserting F10.7 data...")
            insert_f107(parse_f107(download_file("https://services.swpc.noaa.gov/text/daily-solar-indices.txt", "F1O7.txt")))

        elif task == "fetch_geomagnetic":
            print("📥 Fetching, parsing, and inserting Geomagnetic data...")
            insert_geomagnetic(parse_geomagnetic_data(download_file("https://services.swpc.noaa.gov/text/daily-geomagnetic-indices.txt", "geomagnetic_indices.txt")))

        elif task == "fetch_dst":
            print("📥 Fetching, parsing, and inserting Dst data...")
            insert_dst(parse_dst(download_file("https://services.swpc.noaa.gov/json/geospace/geospace_dst_7_day.json", "DST.json")))

        elif task == "fetch_solar_wind":
            print("📥 Fetching, parsing, and inserting Solar Wind data...")
            insert_solar_wind(parse_solar_wind(download_file("https://services.swpc.noaa.gov/json/ace/swepam/ace_swepam_1h.json", "solar_wind.json")))

        else:
            print(f"⚠️ Unknown task: {task}")

    else:
        # Default: Fetch, parse, and insert all
        print("ℹ️ Fetching, parsing, and inserting all space weather data...")
        data_files = fetch_all()
        insert_all(data_files)

if __name__ == "__main__":
    main()

