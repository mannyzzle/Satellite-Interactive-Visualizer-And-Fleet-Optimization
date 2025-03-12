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




import datetime

def parse_f107(filepath):
    """Parse only relevant F10.7 flux, sunspots, and X-ray flux for AI-enhanced SGP4 modeling."""
    data = []
    with open(filepath, "r") as f:
        for line in f:
            parts = line.split()
            
            # Ignore headers and malformed lines (ensure at least required columns exist)
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

                

                # Append only relevant data
                data.append((date, f107, sunspot_number))

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
    """Parse solar wind data, allowing NULL values for density, speed, and temperature but requiring dsflag."""
    with open(file_path, "r") as file:
        data = json.load(file)

    clean_data = [
        (
            entry["time_tag"],  
            entry.get("dens"),  # Allow NULL if missing
            entry.get("speed"),  # Allow NULL if missing
            entry.get("temperature"),  # Allow NULL if missing
            entry["dsflag"]  # Ensure dsflag is always present
        )
        for entry in data
        if entry.get("dsflag") is not None  # ✅ Filter out entries with NULL dsflag
    ]
    

    return clean_data


# -------------------------------
# 📌 3) Database Functions
# -------------------------------



def insert_f107(data):
    """
    Insert F10.7 solar flux, sunspot number, and X-ray flux into PostgreSQL for AI-enhanced SGP4 modeling.
    Drops irrelevant columns to optimize storage and speed.
    """
    if not data:
        print("⚠️ No F10.7 data to insert.")
        return

    conn = get_db_connection()
    cursor = conn.cursor()

    # ✅ Create optimized table (keeping only relevant columns)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS f107_flux (
            date DATE PRIMARY KEY,
            f107 FLOAT(6),        -- ✅ Limits precision for efficiency
            sunspot_number INT   -- ✅ Sunspot activity affects atmospheric drag
            
        );
    """)

    try:
        # ✅ Insert only necessary columns
        execute_values(cursor, """
            INSERT INTO f107_flux (date, f107, sunspot_number)
            VALUES %s
            ON CONFLICT (date) DO UPDATE SET
                f107 = EXCLUDED.f107,
                sunspot_number = EXCLUDED.sunspot_number;
        """, data)

        conn.commit()
        print(f"✅ Inserted {len(data)} F10.7 records into DB")

    except Exception as e:
        conn.rollback()
        print(f"❌ Database insert failed: {e}")

    finally:
        cursor.close()
        conn.close()





def insert_geomagnetic(data):
    """
    Insert Ap/Kp indices into PostgreSQL using the new unpivoted format.
    Ensures each Kp value corresponds to its 3-hour interval and avoids duplicates.
    """
    if not data:
        print("⚠️ No geomagnetic data to insert.")
        return

    conn = get_db_connection()
    cursor = conn.cursor()

    # ✅ Ensure the new table exists (time-based Kp values)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS geomagnetic_kp_index (
            time TIMESTAMP PRIMARY KEY,
            original_date DATE NOT NULL,
            ap_index FLOAT NOT NULL,
            kp_value FLOAT NOT NULL,
            kp_interval INT NOT NULL
        );
    """)

    # ✅ Transform data into unpivoted format (convert each daily record into 8 rows)
    transformed_data = []
    for row in data:
        date, ap_index, kp1, kp2, kp3, kp4, kp5, kp6, kp7, kp8 = row
        
        # ✅ Convert each Kp value into a separate row with its correct 3-hour timestamp
        base_time = datetime.datetime.combine(date, datetime.time(0, 0))  # Start of day
        kp_values = [kp1, kp2, kp3, kp4, kp5, kp6, kp7, kp8]

        for i, kp in enumerate(kp_values, start=1):
            if kp is not None:  # ✅ Ensure valid values only
                time = base_time + datetime.timedelta(hours=(i - 1) * 3)
                transformed_data.append((time, date, ap_index, kp, i))

    # ✅ Insert the transformed data
    execute_values(cursor, """
        INSERT INTO geomagnetic_kp_index (time, original_date, ap_index, kp_value, kp_interval)
        VALUES %s
        ON CONFLICT (time) DO UPDATE SET
            ap_index = EXCLUDED.ap_index,
            kp_value = EXCLUDED.kp_value,
            kp_interval = EXCLUDED.kp_interval;
    """, transformed_data)

    conn.commit()
    cursor.close()
    conn.close()
    print(f"✅ Inserted {len(transformed_data)} geomagnetic records into DB")








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




def insert_solar_wind(solar_wind_data):
    """Insert Solar Wind and IMF data into PostgreSQL, ensuring timestamps are sequential."""

    # ✅ Fetch IMF Data
    url = "https://services.swpc.noaa.gov/json/ace/mag/ace_mag_1h.json"

    try:
        response = requests.get(url)
        response.raise_for_status()
        imf_data = response.json()

        # ✅ Ensure `imf_data` is a list and has values
        if not isinstance(imf_data, list) or len(imf_data) == 0:
            print("⚠️ IMF API returned an empty list or invalid format.")
            imf_data = []

    except requests.exceptions.RequestException as e:
        print(f"❌ Error fetching IMF data: {e}")
        imf_data = []  # Proceed with only Solar Wind data

    conn = get_db_connection()
    cursor = conn.cursor()

    try:
        # ✅ Ensure the necessary tables exist
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS time_series (
                time TIMESTAMP PRIMARY KEY
            );
            CREATE TABLE IF NOT EXISTS solar_wind (
                time TIMESTAMP PRIMARY KEY,
                density FLOAT,
                speed FLOAT,
                temperature FLOAT,
                sw_flag INT,
                gse_bx FLOAT,
                gse_by FLOAT,
                gse_bz FLOAT,
                gse_lat FLOAT,
                gse_lon FLOAT,
                gsm_bx FLOAT,
                gsm_by FLOAT,
                gsm_bz FLOAT,
                gsm_lat FLOAT,
                gsm_lon FLOAT,
                bt FLOAT,
                imf_flag INT,
                numpts INT
            );
        """)

        # ✅ Generate a time-series table to ensure timestamps exist for ALL data
        cursor.execute("""
            INSERT INTO time_series (time)
            SELECT generate_series(
                (SELECT MIN(time) FROM solar_wind),  -- ✅ Start from the earliest timestamp
                (SELECT MAX(time) FROM solar_wind),  -- ✅ Cover up to the most recent timestamp
                '1 hour'::interval
            )
            ON CONFLICT DO NOTHING;
        """)

        # ✅ Prepare batch insert for Solar Wind
        solar_wind_insert = [(time, density, speed, temperature, sw_flag, None, None, None, None, None, None, None, None, None, None, None, None, None) 
                             for time, density, speed, temperature, sw_flag in solar_wind_data]

        # ✅ Prepare batch insert for IMF (ALL FIELDS including `numpts`)
        imf_insert = [(entry["time_tag"], entry.get("gse_bx"), entry.get("gse_by"), entry.get("gse_bz"), 
                       entry.get("gse_lat"), entry.get("gse_lon"), entry.get("gsm_bx"), entry.get("gsm_by"), 
                       entry.get("gsm_bz"), entry.get("gsm_lat"), entry.get("gsm_lon"), entry.get("bt"), 
                       entry.get("dsflag"), entry.get("numpts"))  # ✅ New field
                      for entry in imf_data if "time_tag" in entry]

        # ✅ Merge both datasets (ensuring all timestamps exist)
        merged_data = {t[0]: list(t[1:]) for t in solar_wind_insert}  # Convert Solar Wind list to dict
        for t, gse_bx, gse_by, gse_bz, gse_lat, gse_lon, gsm_bx, gsm_by, gsm_bz, gsm_lat, gsm_lon, bt, imf_flag, numpts in imf_insert:
            if t in merged_data:
                merged_data[t][4] = gse_bx   # gse_bx
                merged_data[t][5] = gse_by   # gse_by
                merged_data[t][6] = gse_bz   # gse_bz
                merged_data[t][7] = gse_lat  # gse_lat
                merged_data[t][8] = gse_lon  # gse_lon
                merged_data[t][9] = gsm_bx   # gsm_bx
                merged_data[t][10] = gsm_by  # gsm_by
                merged_data[t][11] = gsm_bz  # gsm_bz
                merged_data[t][12] = gsm_lat # gsm_lat
                merged_data[t][13] = gsm_lon # gsm_lon
                merged_data[t][14] = bt      # bt
                merged_data[t][15] = imf_flag  # imf_flag
                merged_data[t][16] = numpts  # ✅ numpts
            else:
                merged_data[t] = [None, None, None, None, gse_bx, gse_by, gse_bz, gse_lat, gse_lon, gsm_bx, gsm_by, gsm_bz, gsm_lat, gsm_lon, bt, imf_flag, numpts]  # Fill missing Solar Wind data

        # ✅ Convert merged data back to list for batch insert
        final_insert_data = [(t, *vals) for t, vals in merged_data.items()]

        if final_insert_data:
            execute_values(cursor, """
                INSERT INTO solar_wind (time, density, speed, temperature, sw_flag, 
                                       gse_bx, gse_by, gse_bz, gse_lat, gse_lon, 
                                       gsm_bx, gsm_by, gsm_bz, gsm_lat, gsm_lon, 
                                       bt, imf_flag, numpts)
                VALUES %s
                ON CONFLICT (time) DO UPDATE SET
                    density = COALESCE(EXCLUDED.density, solar_wind.density),
                    speed = COALESCE(EXCLUDED.speed, solar_wind.speed),
                    temperature = COALESCE(EXCLUDED.temperature, solar_wind.temperature),
                    sw_flag = COALESCE(EXCLUDED.sw_flag, solar_wind.sw_flag),
                    gse_bx = COALESCE(EXCLUDED.gse_bx, solar_wind.gse_bx),
                    gse_by = COALESCE(EXCLUDED.gse_by, solar_wind.gse_by),
                    gse_bz = COALESCE(EXCLUDED.gse_bz, solar_wind.gse_bz),
                    gse_lat = COALESCE(EXCLUDED.gse_lat, solar_wind.gse_lat),
                    gse_lon = COALESCE(EXCLUDED.gse_lon, solar_wind.gse_lon),
                    gsm_bx = COALESCE(EXCLUDED.gsm_bx, solar_wind.gsm_bx),
                    gsm_by = COALESCE(EXCLUDED.gsm_by, solar_wind.gsm_by),
                    gsm_bz = COALESCE(EXCLUDED.gsm_bz, solar_wind.gsm_bz),
                    gsm_lat = COALESCE(EXCLUDED.gsm_lat, solar_wind.gsm_lat),
                    gsm_lon = COALESCE(EXCLUDED.gsm_lon, solar_wind.gsm_lon),
                    bt = COALESCE(EXCLUDED.bt, solar_wind.bt),
                    imf_flag = COALESCE(EXCLUDED.imf_flag, solar_wind.imf_flag),
                    numpts = COALESCE(EXCLUDED.numpts, solar_wind.numpts);
            """, final_insert_data)

        conn.commit()
        print(f"✅ Inserted/Updated {len(final_insert_data)} Solar Wind & IMF records into DB.")

    except psycopg2.Error as e:
        print(f"❌ Database Error: {e}")
        conn.rollback()
    finally:
        cursor.close()
        conn.close()




def merge_and_store_unified_table():
    """
    Merge f107_flux, geomagnetic_kp_index, dst_index, and solar_wind into a single unified table.
    Ensures data alignment on the minimum available timestamp granularity (1-minute).
    Uses an UPSERT strategy to update records while preserving existing values if new data is missing.
    """

    conn = get_db_connection()
    cursor = conn.cursor()

    # ✅ Ensure the table exists with the correct schema
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS unified_space_weather (
            epoch TIMESTAMP PRIMARY KEY,
            geo_dst FLOAT,
            geo_ap_index FLOAT,
            geo_kp_value FLOAT,
            geo_kp_interval INT,
            imf_flag INT,
            imf_gsm_bz FLOAT,
            imf_bt FLOAT,
            imf_gse_bx FLOAT,
            imf_gse_by FLOAT,
            imf_gse_bz FLOAT,
            imf_gsm_bx FLOAT,
            imf_gsm_by FLOAT,
            imf_gse_lat FLOAT,
            imf_gse_lon FLOAT,
            imf_gsm_lat FLOAT,
            imf_gsm_lon FLOAT,
            imf_numpts INT,
            sw_flag INT,  
            sw_density FLOAT,  
            sw_speed FLOAT,  
            sw_temperature FLOAT,  
            solar_f107 FLOAT,
            solar_sunspot_number INT  
        );
    """)

    # ✅ Perform the merge operation with an UPSERT
    merge_query = """
        WITH time_series AS (
            -- Ensure `epoch` timestamps are unique
            SELECT DISTINCT time AS epoch FROM dst_index
        ),
        interpolated_solar_wind AS (
            -- Get only the most recent valid solar wind data per `epoch`
            SELECT DISTINCT ON (ts.epoch) 
                ts.epoch, 
                sw.density AS sw_density, 
                sw.speed AS sw_speed, 
                sw.temperature AS sw_temperature, 
                sw.sw_flag  
            FROM time_series ts
            LEFT JOIN solar_wind sw 
                ON ts.epoch BETWEEN sw.time - INTERVAL '30 minutes' AND sw.time + INTERVAL '30 minutes'
            ORDER BY ts.epoch, sw.time DESC
        ),
        interpolated_geomagnetic AS (
            -- Get only the most recent valid geomagnetic data per `epoch`
            SELECT DISTINCT ON (ts.epoch)
                ts.epoch, 
                gkp.ap_index AS geo_ap_index, 
                gkp.kp_value AS geo_kp_value, 
                gkp.kp_interval AS geo_kp_interval
            FROM time_series ts
            LEFT JOIN geomagnetic_kp_index gkp 
                ON ts.epoch BETWEEN gkp.time - INTERVAL '1 hour' AND gkp.time + INTERVAL '1 hour'
            ORDER BY ts.epoch, gkp.time DESC
        ),
        interpolated_f107 AS (
            -- Get the most recent F10.7 data
            SELECT DISTINCT ON (ts.epoch)
                ts.epoch, 
                f.f107 AS solar_f107, 
                f.sunspot_number AS solar_sunspot_number
            FROM time_series ts
            LEFT JOIN f107_flux f 
                ON ts.epoch::date = f.date
            ORDER BY ts.epoch, f.date DESC
        ),
        interpolated_imf AS (
            -- Get the most recent valid IMF data
            SELECT DISTINCT ON (ts.epoch)
                ts.epoch, 
                imf.gsm_bz AS imf_gsm_bz, 
                imf.bt AS imf_bt, 
                imf.imf_flag,
                imf.gse_bx AS imf_gse_bx, 
                imf.gse_by AS imf_gse_by, 
                imf.gse_bz AS imf_gse_bz, 
                imf.gsm_bx AS imf_gsm_bx, 
                imf.gsm_by AS imf_gsm_by, 
                imf.gse_lat AS imf_gse_lat, 
                imf.gse_lon AS imf_gse_lon,  
                imf.gsm_lat AS imf_gsm_lat,  
                imf.gsm_lon AS imf_gsm_lon,  
                imf.numpts AS imf_numpts  
            FROM time_series ts
            LEFT JOIN solar_wind imf 
                ON ts.epoch BETWEEN imf.time - INTERVAL '30 minutes' AND imf.time + INTERVAL '30 minutes'
            ORDER BY ts.epoch, imf.time DESC
        )
        INSERT INTO unified_space_weather (epoch, geo_dst, geo_ap_index, geo_kp_value, geo_kp_interval, 
                                           imf_flag, imf_gsm_bz, imf_bt,
                                           imf_gse_bx, imf_gse_by, imf_gse_bz,
                                           imf_gsm_bx, imf_gsm_by,
                                           imf_gse_lat, imf_gse_lon,
                                           imf_gsm_lat, imf_gsm_lon,
                                           imf_numpts, sw_flag, 
                                           sw_density, sw_speed, sw_temperature, 
                                           solar_f107, solar_sunspot_number)
        SELECT 
            ts.epoch, 
            d.dst AS geo_dst, 
            gkp.geo_ap_index, 
            gkp.geo_kp_value, 
            gkp.geo_kp_interval, 
            imf.imf_flag, 
            imf.imf_gsm_bz, 
            imf.imf_bt, 
            imf.imf_gse_bx, imf.imf_gse_by, imf.imf_gse_bz,
            imf.imf_gsm_bx, imf.imf_gsm_by,
            imf.imf_gse_lat, imf.imf_gse_lon,
            imf.imf_gsm_lat, imf.imf_gsm_lon,
            imf.imf_numpts, sw.sw_flag,  
            sw.sw_density, sw.sw_speed, sw.sw_temperature, 
            f.solar_f107, f.solar_sunspot_number
        FROM time_series ts
        LEFT JOIN dst_index d ON ts.epoch = d.time
        LEFT JOIN interpolated_solar_wind sw ON ts.epoch = sw.epoch
        LEFT JOIN interpolated_geomagnetic gkp ON ts.epoch = gkp.epoch
        LEFT JOIN interpolated_f107 f ON ts.epoch = f.epoch
        LEFT JOIN interpolated_imf imf ON ts.epoch = imf.epoch
        ON CONFLICT (epoch) 
        DO UPDATE SET
            geo_dst = COALESCE(EXCLUDED.geo_dst, unified_space_weather.geo_dst),
            geo_ap_index = COALESCE(EXCLUDED.geo_ap_index, unified_space_weather.geo_ap_index),
            geo_kp_value = COALESCE(EXCLUDED.geo_kp_value, unified_space_weather.geo_kp_value),
            geo_kp_interval = COALESCE(EXCLUDED.geo_kp_interval, unified_space_weather.geo_kp_interval),
            imf_flag = COALESCE(EXCLUDED.imf_flag, unified_space_weather.imf_flag),
            imf_gsm_bz = COALESCE(EXCLUDED.imf_gsm_bz, unified_space_weather.imf_gsm_bz),
            imf_bt = COALESCE(EXCLUDED.imf_bt, unified_space_weather.imf_bt),
            imf_gse_bx = COALESCE(EXCLUDED.imf_gse_bx, unified_space_weather.imf_gse_bx),
            imf_gse_by = COALESCE(EXCLUDED.imf_gse_by, unified_space_weather.imf_gse_by),
            imf_gse_bz = COALESCE(EXCLUDED.imf_gse_bz, unified_space_weather.imf_gse_bz),
            imf_gsm_bx = COALESCE(EXCLUDED.imf_gsm_bx, unified_space_weather.imf_gsm_bx),
            imf_gsm_by = COALESCE(EXCLUDED.imf_gsm_by, unified_space_weather.imf_gsm_by),
            imf_gse_lat = COALESCE(EXCLUDED.imf_gse_lat, unified_space_weather.imf_gse_lat),
            imf_gse_lon = COALESCE(EXCLUDED.imf_gse_lon, unified_space_weather.imf_gse_lon),
            imf_gsm_lat = COALESCE(EXCLUDED.imf_gsm_lat, unified_space_weather.imf_gsm_lat),
            imf_gsm_lon = COALESCE(EXCLUDED.imf_gsm_lon, unified_space_weather.imf_gsm_lon),
            imf_numpts = COALESCE(EXCLUDED.imf_numpts, unified_space_weather.imf_numpts),
            sw_flag = COALESCE(EXCLUDED.sw_flag, unified_space_weather.sw_flag),
            sw_density = COALESCE(EXCLUDED.sw_density, unified_space_weather.sw_density),
            sw_speed = COALESCE(EXCLUDED.sw_speed, unified_space_weather.sw_speed),
            sw_temperature = COALESCE(EXCLUDED.sw_temperature, unified_space_weather.sw_temperature),
            solar_f107 = COALESCE(EXCLUDED.solar_f107, unified_space_weather.solar_f107),
            solar_sunspot_number = COALESCE(EXCLUDED.solar_sunspot_number, unified_space_weather.solar_sunspot_number);
    """

    try:
        cursor.execute(merge_query)
        conn.commit()
        print("✅ Successfully merged and updated data in unified_space_weather.")

    except Exception as e:
        conn.rollback()
        print(f"❌ Merge operation failed: {e}")

    finally:
        cursor.close()
        conn.close()



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
    """Insert all datasets into DB and then update the unified table."""
    insert_f107(parse_f107(data_files["f107"]))
    insert_geomagnetic(parse_geomagnetic_data(data_files["geomagnetic"]))
    insert_dst(parse_dst(data_files["dst"]))
    insert_solar_wind(parse_solar_wind(data_files["solar_wind"]))
    # ✅ Merge into unified table after inserting all datasets
    merge_and_store_unified_table()

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

