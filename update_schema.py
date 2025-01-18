import psycopg2
from dotenv import load_dotenv
import os

load_dotenv()

def update_schema():
    conn = psycopg2.connect(
        host=os.getenv("DB_HOST"),
        database=os.getenv("DB_NAME"),
        user=os.getenv("DB_USER"),
        password=os.getenv("DB_PASSWORD"),
    )
    cursor = conn.cursor()
    try:
        cursor.execute("""
        ALTER TABLE satellites
        ADD COLUMN inclination FLOAT,
        ADD COLUMN eccentricity FLOAT,
        ADD COLUMN period FLOAT,
        ADD COLUMN perigee FLOAT,
        ADD COLUMN apogee FLOAT;
        """)
        conn.commit()
        print("Database schema updated successfully.")
    except Exception as e:
        print(f"Error updating schema: {e}")
    finally:
        cursor.close()
        conn.close()

if __name__ == "__main__":
    update_schema()
