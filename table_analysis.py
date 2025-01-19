import psycopg2
from tqdm import tqdm
from dotenv import load_dotenv
import os

# Load environment variables
load_dotenv()

# Connect to the database
def connect_to_db():
    conn = psycopg2.connect(
        host=os.getenv("DB_HOST"),
        database=os.getenv("DB_NAME"),
        user=os.getenv("DB_USER"),
        password=os.getenv("DB_PASSWORD"),
    )
    return conn

# Verify satellite data
def verify_satellite_data(conn):
    cursor = conn.cursor()
    print("\n--- Verifying Duplicate Satellites ---")
    cursor.execute("SELECT norad_number, COUNT(*) FROM satellites GROUP BY norad_number HAVING COUNT(*) > 1")
    duplicates = cursor.fetchall()
    if duplicates:
        print(f"Duplicate NORAD numbers found: {duplicates}")
    else:
        print("No duplicate NORAD numbers found.")

    print("\n--- Checking for Null or Missing Values ---")
    cursor.execute("""
        SELECT column_name
        FROM information_schema.columns
        WHERE table_name = 'satellites'
    """)
    columns = [row[0] for row in cursor.fetchall()]
    missing_columns = False
    for column in columns:
        cursor.execute(f"SELECT COUNT(*) FROM satellites WHERE {column} IS NULL")
        count = cursor.fetchone()[0]
        if count > 0:
            print(f"Column {column} has {count} missing values.")
            missing_columns = True
    if not missing_columns:
        print("No missing values found.")

    print("\n--- Checking Category Consistency ---")
    cursor.execute("SELECT category, COUNT(*) FROM satellites GROUP BY category")
    categories = cursor.fetchall()
    for category, count in categories:
        print(f"{category}: {count}")

    print("\n--- Verifying Orbital Parameters ---")
    cursor.execute("""
        SELECT id, inclination, eccentricity, period, perigee, apogee
        FROM satellites
        WHERE inclination IS NULL OR eccentricity IS NULL OR period IS NULL OR perigee IS NULL OR apogee IS NULL
    """)
    invalid_orbital_params = cursor.fetchall()
    if invalid_orbital_params:
        print(f"Found {len(invalid_orbital_params)} satellites with invalid orbital parameters.")
        for row in invalid_orbital_params:
            print(f"Satellite ID: {row[0]}, Inclination: {row[1]}, Eccentricity: {row[2]}, "
                  f"Period: {row[3]}, Perigee: {row[4]}, Apogee: {row[5]}")
    else:
        print("All orbital parameters are valid.")

    print("\n--- Validating TLE Formats ---")
    cursor.execute("""
        SELECT id, tle_line1, tle_line2
        FROM satellites
        WHERE CHAR_LENGTH(tle_line1) <> 69 OR CHAR_LENGTH(tle_line2) <> 69
    """)
    invalid_tles = cursor.fetchall()
    if invalid_tles:
        print(f"Found {len(invalid_tles)} satellites with invalid TLE formats.")
        for row in invalid_tles:
            print(f"Satellite ID: {row[0]}, TLE Line 1: {row[1]}, TLE Line 2: {row[2]}")
    else:
        print("All TLE formats are valid.")

    print("\n--- Checking Satellite Age ---")
    cursor.execute("""
        SELECT id, satellite_name, epoch, satellite_age
        FROM satellites
        WHERE satellite_age < 0 OR satellite_age IS NULL
    """)
    invalid_ages = cursor.fetchall()
    if invalid_ages:
        print(f"Found {len(invalid_ages)} satellites with invalid ages.")
        for row in invalid_ages:
            print(f"Satellite ID: {row[0]}, Name: {row[1]}, Epoch: {row[2]}, Age: {row[3]}")
    else:
        print("All satellite ages are valid.")

        print("\n--- Exporting Cleaned Data ---")
    try:
        with open('cleaned_satellite_data.csv', 'w') as file:
            cursor.copy_expert("""
                COPY (
                    SELECT *
                    FROM satellites
                    WHERE satellite_age >= 0
                ) TO STDOUT WITH CSV HEADER
            """, file)
        print("Cleaned data exported successfully.")
    except Exception as e:
        print(f"Error exporting data: {e}")


    cursor.close()

if __name__ == "__main__":
    print("Connecting to the database...")
    conn = connect_to_db()
    try:
        verify_satellite_data(conn)
    finally:
        conn.close()
        print("Database connection closed.")
