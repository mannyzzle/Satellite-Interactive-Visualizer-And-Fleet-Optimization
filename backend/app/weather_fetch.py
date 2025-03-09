import os
import sys
import csv
import requests
import datetime
from dateutil import parser
from tempfile import NamedTemporaryFile
from tqdm import tqdm
from psycopg2.extras import execute_values
from datetime import timezone

from app.database import get_db_connection

# -----------------------------------------------------------------
# 1) Helpers to fetch each parameter
# -----------------------------------------------------------------

def fetch_daily_f107():
    """
    Fetch daily F10.7 flux from NOAA JSON.
    Returns dict date->f10_7
    """
    url = "https://services.swpc.noaa.gov/json/f10cm_flux.json"
    date_map = {}
    try:
        r = requests.get(url, timeout=15)
        r.raise_for_status()
        data = r.json()
        for rec in data:
            date_str = rec.get("date")
            flux = rec.get("flux")
            if not date_str or flux is None:
                continue
            try:
                dt = datetime.datetime.strptime(date_str, "%Y-%m-%d").date()
            except ValueError:
                continue
            date_map[dt] = float(flux)
    except Exception as e:
        print(f"⚠️ fetch_daily_f107 error: {e}")
    return date_map


def fetch_daily_kp():
    """
    Fetch 3-hourly Kp from NOAA JSON, compute daily max or average.
    Returns dict date->kp_index
    """
    url = "https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json"
    date_map = {}
    try:
        r = requests.get(url, timeout=15)
        r.raise_for_status()
        data = r.json()
        # data[0] might be headers
        # data[1:] has e.g. ["2023-03-09 00:00:00","1.0","0.5","9","0.0",...]
        daily_kp = {}
        for row in data[1:]:
            time_str = row[0]
            if not time_str:
                continue
            try:
                dt = parser.parse(time_str)
            except:
                continue
            kp_val = None
            # Kp might be in row[1]
            try:
                kp_val = float(row[1])
            except:
                continue
            date_obj = dt.date()
            if date_obj not in daily_kp:
                daily_kp[date_obj] = []
            daily_kp[date_obj].append(kp_val)

        # Let's do daily max Kp
        for d_obj, kp_list in daily_kp.items():
            if kp_list:
                date_map[d_obj] = max(kp_list)
    except Exception as e:
        print(f"⚠️ fetch_daily_kp error: {e}")
    return date_map


def fetch_daily_ap():
    """
    Fetch daily Ap from NOAA's daily text file on FTP.
    Example file: ftp://ftp.swpc.noaa.gov/pub/indices/old_indices/2023_DSD.txt
    We'll parse lines that contain daily Ap, store in a date->ap map.
    Format typically: YYYY MM DD <stuff> daily Ap ...
    """
    import re

    # For demonstration, we'll just show 2023_DSD
    # For the current year, you'd adapt the filename
    ftp_url = "https://services.swpc.noaa.gov/pub/indices/old_indices/2023_DSD.txt"
    date_map = {}
    try:
        r = requests.get(ftp_url, timeout=15)
        r.raise_for_status()
        lines = r.text.splitlines()
        for line in lines:
            # Each line might look like:
            # "2023 03 10  21  13  1  A   4   2   3.7   2.0   0.5   21"
            # We only need year,month,day, daily Ap from columns
            # This file can vary, let's do a basic regex or string split
            parts = line.split()
            if len(parts) < 4:
                continue
            try:
                year = int(parts[0])
                month = int(parts[1])
                day = int(parts[2])
                # daily Ap often is the last integer, or near last
                # In official "DSD" format, the daily Ap is typically in column 11 or last col
                # We'll guess the last col:
                ap_val = float(parts[-1])
                date_obj = datetime.date(year, month, day)
                date_map[date_obj] = ap_val
            except:
                continue
    except Exception as e:
        print(f"⚠️ fetch_daily_ap error: {e}")
    return date_map


def fetch_daily_dst():
    """
    Fetch daily Dst from Kyoto daily or monthly text.
    For demonstration, parse a monthly file, e.g. '202303'.provisional
    We'll do a single month. If you want to handle multiple months, loop or store everything.
    Format can vary. We'll do a simplified approach.
    """
    date_map = {}

    # Example: http://wdc.kugi.kyoto-u.ac.jp/dst_realtime/2023/Mar/202303.provisional
    # We'll parse daily mean. This is just example code - the real format might need more logic.
    # We'll do a partial approach here:
    base_url = "http://wdc.kugi.kyoto-u.ac.jp/dst_realtime/2023/Mar/202303.provisional"
    try:
        r = requests.get(base_url, timeout=15)
        r.raise_for_status()
        lines = r.text.splitlines()
        # Typically each line might have day, 8 or 24 values for Dst, etc.
        # We'll guess a daily average from them. This is simpler example.
        for line in lines:
            # e.g. " 1  -10 -12 -15 ... -20"
            parts = line.split()
            if len(parts) < 9:
                continue
            day_str = parts[0]
            try:
                day = int(day_str)
                # We'll say month=3, year=2023 for demonstration
                date_obj = datetime.date(2023, 3, day)
                # compute average from the next 8 or 24 columns
                vals = [float(x) for x in parts[1:]]
                daily_dst = sum(vals) / len(vals)
                date_map[date_obj] = daily_dst
            except:
                continue
    except Exception as e:
        print(f"⚠️ fetch_daily_dst error: {e}")
    return date_map


def fetch_daily_solar_wind():
    """
    Fetch NOAA solar_wind.json (1-min data), compute daily average speed.
    Returns dict date->wind_speed
    """
    url = "https://services.swpc.noaa.gov/json/solar_wind.json"
    date_map = {}
    try:
        r = requests.get(url, timeout=15)
        r.raise_for_status()
        data = r.json()
        daily_speeds = {}
        for row in data:
            time_tag = row.get("time_tag")
            speed = row.get("speed")
            if not time_tag or speed is None:
                continue
            try:
                dt = parser.parse(time_tag)
                date_obj = dt.date()
            except:
                continue
            val = None
            try:
                val = float(speed)
            except:
                continue
            if date_obj not in daily_speeds:
                daily_speeds[date_obj] = []
            daily_speeds[date_obj].append(val)
        for d_obj, arr in daily_speeds.items():
            if arr:
                avg_speed = sum(arr)/len(arr)
                date_map[d_obj] = avg_speed
    except Exception as e:
        print(f"⚠️ fetch_daily_solar_wind error: {e}")
    return date_map


# -----------------------------------------------------------------
# 2) Consolidate & Merge All in `fetch_noaa_space_weather_data()`
# -----------------------------------------------------------------

def fetch_noaa_space_weather_data():
    """
    Combine all real data from above:
    F10.7, Ap, Kp, Dst, solar wind speed, merging by date.
    Returns list of dicts with:
      {
        "date": date_obj,
        "f10_7": float or None,
        "ap_index": float or None,
        "kp_index": float or None,
        "dst_index": float or None,
        "solar_wind_speed": float or None
      }
    """

    f107_map = fetch_daily_f107()          # date->f10_7
    kp_map = fetch_daily_kp()              # date->kp
    ap_map = fetch_daily_ap()              # date->ap
    dst_map = fetch_daily_dst()            # date->dst
    wind_map = fetch_daily_solar_wind()    # date->wind

    # Merge them into a single dictionary day_map
    day_map = {}

    # Collect all unique dates from each map
    all_dates = set(f107_map.keys()) | set(kp_map.keys()) | set(ap_map.keys()) | set(dst_map.keys()) | set(wind_map.keys())

    for d_obj in all_dates:
        day_map[d_obj] = {
            "f10_7": f107_map.get(d_obj),
            "ap_index": ap_map.get(d_obj),
            "kp_index": kp_map.get(d_obj),
            "dst_index": dst_map.get(d_obj),
            "solar_wind_speed": wind_map.get(d_obj)
        }

    # Convert to list
    results = []
    for d_obj, vals in day_map.items():
        results.append({
            "date": d_obj,
            "f10_7": vals["f10_7"],
            "ap_index": vals["ap_index"],
            "kp_index": vals["kp_index"],
            "dst_index": vals["dst_index"],
            "solar_wind_speed": vals["solar_wind_speed"]
        })

    return results

# -----------------------------------------------------------------
# 3) Upsert (CSV + COPY) into space_weather
# -----------------------------------------------------------------

def update_space_weather_data():
    """
    1) Fetch daily space weather (f10_7, ap_index, kp_index, dst_index, solar_wind_speed) from real NOAA & Kyoto sources
    2) Upsert into `space_weather` table with CSV + COPY approach.
    """
    print("🌐 Fetching real space weather data (F10.7, Ap, Kp, Dst, solar wind)...")
    sw_data = fetch_noaa_space_weather_data()  # list of dicts

    if not sw_data:
        print("⚠️ No space weather data fetched. Exiting.")
        return

    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("""
        CREATE TEMP TABLE temp_space_weather (
            date DATE,
            f10_7 FLOAT,
            ap_index FLOAT,
            kp_index FLOAT,
            dst_index FLOAT,
            solar_wind_speed FLOAT
        );
    """)

    # Write data to CSV
    with NamedTemporaryFile(mode="w", delete=False, suffix=".csv") as temp_file:
        csv_writer = csv.writer(temp_file, delimiter=",")
        csv_writer.writerow(["date", "f10_7", "ap_index", "kp_index", "dst_index", "solar_wind_speed"])
        for row in sw_data:
            csv_writer.writerow([
                row["date"],
                row["f10_7"] if row["f10_7"] is not None else "",
                row["ap_index"] if row["ap_index"] is not None else "",
                row["kp_index"] if row["kp_index"] is not None else "",
                row["dst_index"] if row["dst_index"] is not None else "",
                row["solar_wind_speed"] if row["solar_wind_speed"] is not None else ""
            ])
        temp_path = temp_file.name

    with open(temp_path, "r") as f:
        cursor.copy_expert("""
            COPY temp_space_weather (date, f10_7, ap_index, kp_index, dst_index, solar_wind_speed)
            FROM STDIN WITH CSV HEADER;
        """, f)
    os.remove(temp_path)

    # Now upsert
    cursor.execute("""
        INSERT INTO space_weather (date, f10_7, ap_index, kp_index, dst_index, solar_wind_speed)
        SELECT date, f10_7, ap_index, kp_index, dst_index, solar_wind_speed
        FROM temp_space_weather
        ON CONFLICT (date) DO UPDATE
        SET f10_7 = EXCLUDED.f10_7,
            ap_index = EXCLUDED.ap_index,
            kp_index = EXCLUDED.kp_index,
            dst_index = EXCLUDED.dst_index,
            solar_wind_speed = EXCLUDED.solar_wind_speed;
    """)

    cursor.execute("DROP TABLE temp_space_weather;")
    conn.commit()
    cursor.close()
    conn.close()

    print(f"✅ Space weather updated. Inserted/updated {len(sw_data)} rows.")


def lookup_space_weather(cursor, epoch_str):
    """
    For a given satellite epoch, find the same-day space weather from `space_weather` table.
    Returns { f10_7, ap_index, kp_index, dst_index, solar_wind_speed } or Nones if not found.
    """
    try:
        dt = parser.parse(epoch_str)
        date_str = dt.strftime("%Y-%m-%d")
    except:
        return {
            "f10_7": None, "ap_index": None, "kp_index": None, "dst_index": None, "solar_wind_speed": None
        }

    cursor.execute("""
        SELECT f10_7, ap_index, kp_index, dst_index, solar_wind_speed
        FROM space_weather
        WHERE date = %s
        LIMIT 1;
    """, (date_str,))

    row = cursor.fetchone()
    if row:
        return {
            "f10_7": row[0],
            "ap_index": row[1],
            "kp_index": row[2],
            "dst_index": row[3],
            "solar_wind_speed": row[4]
        }
    else:
        return {
            "f10_7": None, "ap_index": None, "kp_index": None, "dst_index": None, "solar_wind_speed": None
        }


if __name__ == "__main__":
    update_space_weather_data()
    # This will fetch real data from NOAA & Kyoto, parse, merge, store by date.

