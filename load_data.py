import psycopg2
from dotenv import load_dotenv
import os
import json

# Load environment variables
load_dotenv()

# Database credentials
DB_HOST = os.getenv("DB_HOST")
DB_PORT = os.getenv("DB_PORT")
DB_USER = os.getenv("DB_USER")
DB_PASSWORD = os.getenv("DB_PASSWORD")
DB_NAME = os.getenv("DB_NAME")

def connect_to_db():
    """
    Establishes a connection to the PostgreSQL database.
    """
    conn = psycopg2.connect(
        host=DB_HOST,
        port=DB_PORT,
        user=DB_USER,
        password=DB_PASSWORD,
        dbname=DB_NAME
    )
    return conn

def insert_satellites(conn, satellites):
    """
    Inserts satellite data into the PostgreSQL database.
    """
    cursor = conn.cursor()
    for satellite in satellites:
        cursor.execute("""
            INSERT INTO satellites (category, satellite_name, tle_line1, tle_line2)
            VALUES (%s, %s, %s, %s)
        """, (satellite["category"], satellite["name"], satellite["line1"], satellite["line2"]))
    conn.commit()
    cursor.close()

if __name__ == "__main__":
    # Load satellite data from JSON file
    with open("data/satellites.json", "r") as file:
        satellites = json.load(file)

    # Connect to the database and insert data
    conn = connect_to_db()
    insert_satellites(conn, satellites)
    conn.close()

    print(f"Inserted {len(satellites)} satellites into the database.")
