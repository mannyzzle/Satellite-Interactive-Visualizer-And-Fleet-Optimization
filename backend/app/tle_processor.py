# /backend/app/tle_processor.py

import csv
import psycopg2
from skyfield.api import load
from tqdm import tqdm
from database import get_db_connection  # ✅ Use get_db_connection()
from tle_fetch import get_spacetrack_session, fetch_tle_data
from tempfile import NamedTemporaryFile
import numpy as np  # For NaN detection
from concurrent.futures import ThreadPoolExecutor
from sgp4.api import Satrec, WGS72
from datetime import datetime, timezone
import traceback
from astropy.coordinates import TEME, ITRS
from astropy import units as u
from astropy.time import Time
import math
import os
import sys
from concurrent.futures import ThreadPoolExecutor
from astropy.utils.iers import conf
conf.iers_auto_url = "https://datacenter.iers.org/data/latest/finals2000A.all"
conf.auto_download = True  # Ensure automatic updates
eph = load('de421.bsp')
earth = eph['earth']  
EARTH_RADIUS_KM = 6371 




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
        -- ❌ **Objects that have already decayed (beyond 7-day threshold)**
        (decay_date IS NOT NULL AND decay_date < NOW() - INTERVAL '7 days')

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
        OR (altitude_km IS NULL OR altitude_km < 80)


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
            #print("❌ [ERROR] Missing TLE lines!")
            return None  # Error: Missing TLE

        try:
            satrec = Satrec.twoline2rv(tle_line1, tle_line2, WGS72)
        except Exception as e:
            #print(f"❌ [ERROR] Invalid TLE parse failure: {e}")
            return None  # Error: TLE parse failure

        now = datetime.utcnow()
        obstime = Time(now, scale='utc')

        jd_total = obstime.jd
        jd = math.floor(jd_total)
        fr = jd_total - jd

        # 🚀 **Run SGP4 propagation**
        error_code, r, v = satrec.sgp4(jd, fr)
        if error_code != 0:
            #print(f"❌ [ERROR] SGP4 propagation error code: {error_code}")
            return None  # Return error code

        # 🚀 **Check if values are realistic**
        if not all(map(math.isfinite, r)) or abs(r[0]) > 1e8 or abs(r[1]) > 1e8 or abs(r[2]) > 1e8:
            #print(f"❌ [ERROR] SGP4 returned invalid position values: {r}")
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
        #print(f"⚠️ [ERROR] SGP4 computation failed: {e}")
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
    lat1, lon1 = sat.get("latitude"), sat.get("longitude")

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
                predicted_vx, predicted_vy, predicted_vz, 0)  # ✅ **Returns exactly 20 values**

    return (None, None, None, None, None, None, None, None, None, None, 
            None, None, None, None, None, None, None, None, None, -1 )  # ❌ **Returns exactly 20 values**


def update_satellite_data():
    """
    Efficiently update and insert satellite data using PostgreSQL COPY + UPSERT with batch processing.
    Also stores historical TLEs for time-series analysis and filters invalid entries.
    """

    conn = get_db_connection()
    cursor = conn.cursor()

    existing_norads = set(get_existing_norad_numbers())  # ✅ Get existing NORADs
    existing_names = set(get_existing_satellite_names()) # ✅ Get existing names

    session = get_spacetrack_session()
    if not session:
        print("❌ Failed to authenticate with Space-Track API. Exiting.")
        return

    all_satellites = fetch_tle_data(session, existing_norads)
    if not all_satellites:
        print("⚠️ No new data to process.")
        return

    batch_existing_norads = set()
    batch_existing_names = set(existing_names)
    batch = []
    skipped_norads = []
    historical_tles = []

    print(f"📡 Processing {len(all_satellites)} satellites for database update...")

    # Determine if we are in a TTY (interactive) environment
    is_tty = sys.stdout.isatty()

    with ThreadPoolExecutor(max_workers=8) as executor:
        # We wrap the zip(...) in tqdm to track progress
        # miniters=100 updates the progress bar every 100 items
        # mininterval=1.0 updates at least every 1 second in a TTY
        # disable=not is_tty hides the bar if no TTY (cron logs)
        for sat, (accuracy, lat, lon, error_km, altitude_km, velocity,
                  mean_anomaly, eccentric_anomaly, true_anomaly,
                  argument_of_latitude, specific_angular_momentum, radial_distance,
                  flight_path_angle, predicted_x, predicted_y, predicted_z,
                  predicted_vx, predicted_vy, predicted_vz, error_code) in tqdm(
            zip(all_satellites, executor.map(compute_accuracy, all_satellites)),
            total=len(all_satellites),
            desc="Computing accuracy",
            unit="sat",
            miniters=100,
            mininterval=1.0,
            disable=not is_tty
        ):
            norad_number = sat.get("norad_number")
            if norad_number is None:
                skipped_norads.append(f"{sat['name']} (❌ Missing NORAD)")
                continue

            if error_code != 0:
                skipped_norads.append(f"{sat['name']} (❌ ERROR CODE PREDICTION)")
                # continue

            if norad_number in batch_existing_norads:
                skipped_norads.append(f"{sat['name']} (NORAD {norad_number}) - ❌ Duplicate in batch.")
                continue

            # Ensure unique name
            original_name = sat["name"]
            name = original_name
            suffix = 1
            while name in batch_existing_names:
                name = f"{original_name} ({suffix})"
                suffix += 1
            batch_existing_names.add(name)
            sat["name"] = name

            # Mark TLE for historical storage
            historical_tles.append((
                norad_number, sat["epoch"], sat["tle_line1"], sat["tle_line2"], datetime.now(timezone.utc)
            ))
            batch_existing_norads.add(norad_number)

            # Fill computed values
            sat["accuracy_percentage"] = accuracy
            sat["predicted_latitude"] = lat
            sat["predicted_longitude"] = lon
            sat["error_km"] = error_km
            sat["predicted_altitude_km"] = altitude_km
            sat["predicted_velocity"] = velocity

            sat["predicted_x"] = predicted_x
            sat["predicted_y"] = predicted_y
            sat["predicted_z"] = predicted_z
            sat["predicted_vx"] = predicted_vx
            sat["predicted_vy"] = predicted_vy
            sat["predicted_vz"] = predicted_vz
            sat["predicted_mean_anomaly"] = mean_anomaly
            sat["predicted_eccentric_anomaly"] = eccentric_anomaly
            sat["predicted_true_anomaly"] = true_anomaly
            sat["predicted_argument_of_latitude"] = argument_of_latitude
            sat["predicted_specific_angular_momentum"] = specific_angular_momentum
            sat["predicted_radial_distance"] = radial_distance
            sat["predicted_flight_path_angle"] = flight_path_angle

            # Remove or comment out the print(sat) to avoid spamming logs
            # If you *really* want a single line debug:
            # tqdm.write(f"Ingested sat: {sat['norad_number']} - {sat['name']}")

            batch.append(sat)

    # Save skipped norads
    with open("skipped_norads.log", "w") as log_file:
        log_file.write("\n".join(skipped_norads))

    # Insert historical TLEs
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
    cursor.execute("""
        INSERT INTO satellite_tle_history (norad_number, epoch, tle_line1, tle_line2, inserted_at)
        SELECT norad_number, epoch, tle_line1, tle_line2, inserted_at FROM temp_tle_history
        ON CONFLICT (norad_number, epoch) DO NOTHING;
    """)
    cursor.execute("DROP TABLE temp_tle_history;")
    os.remove(temp_file_path)
    conn.commit()

    # Now create CSV + upsert for main satellites table
    with NamedTemporaryFile(mode="w", delete=False, suffix=".csv") as temp_file:
        csv_writer = csv.writer(temp_file, delimiter=",")
        csv_writer.writerow([
            "name", "tle_line1", "tle_line2", "norad_number", "epoch",
            "inclination", "eccentricity", "mean_motion", "raan", "arg_perigee",
            "velocity", "latitude", "longitude", "orbit_type", "period",
            "perigee", "apogee", "semi_major_axis", "bstar", "rev_num",
            "ephemeris_type", "object_type", "launch_date", "launch_site",
            "decay_date", "rcs", "purpose", "country", "altitude_km",
            "x", "y", "z", "vx", "vy", "vz",
            "mean_anomaly", "eccentric_anomaly", "true_anomaly", "argument_of_latitude",
            "specific_angular_momentum", "radial_distance", "flight_path_angle", "active_status"
        ])

        # We can also wrap this in tqdm, but reduce updates similarly:
        for sat in tqdm(
            batch,
            desc="Writing to CSV",
            unit="sat",
            miniters=100,
            mininterval=1.0,
            disable=not is_tty
        ):
            csv_writer.writerow([
                sat["name"], sat["tle_line1"], sat["tle_line2"], sat["norad_number"], sat["epoch"],
                sat["inclination"], sat["eccentricity"], sat["mean_motion"], sat["raan"], sat["arg_perigee"],
                sat["velocity"], sat["latitude"], sat["longitude"], sat.get("orbit_type", "Unknown"), sat.get("period"),
                sat["perigee"], sat["apogee"], sat["semi_major_axis"], sat["bstar"], sat["rev_num"],
                sat["ephemeris_type"], sat["object_type"], sat["launch_date"], sat["launch_site"],
                sat["decay_date"], sat["rcs"], sat["purpose"], sat["country"], sat["altitude_km"],
                sat["x"], sat["y"], sat["z"], sat["vx"], sat["vy"], sat["vz"],
                sat["mean_anomaly"], sat["eccentric_anomaly"], sat["true_anomaly"], sat["argument_of_latitude"],
                sat["specific_angular_momentum"], sat["radial_distance"], sat["flight_path_angle"], sat["active_status"]
            ])

        temp_file_path = temp_file.name

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
                specific_angular_momentum, radial_distance, flight_path_angle, active_status
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
            specific_angular_momentum, radial_distance, flight_path_angle, active_status
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
            specific_angular_momentum, radial_distance, flight_path_angle, active_status
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
            flight_path_angle = EXCLUDED.flight_path_angle,
            active_status = EXCLUDED.active_status;
    """)

    conn.commit()
    cursor.close()
    conn.close()
    os.remove(temp_file_path)

    print(f"✅ Successfully processed {len(batch)} satellites using COPY + UPSERT.")
    print(f"✅ Historical TLEs added where epoch changed.")
    print(f"⚠️ {len(skipped_norads)} satellites were skipped.")


if __name__ == "__main__":
    update_satellite_data()