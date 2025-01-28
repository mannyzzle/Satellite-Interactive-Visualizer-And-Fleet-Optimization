import psycopg2
from dotenv import load_dotenv
import os
# Load environment variables
load_dotenv()

# Database credentials
DB_HOST = os.getenv("DB_HOST")
DB_PORT = os.getenv("DB_PORT")
DB_USER = os.getenv("DB_USER")
DB_PASSWORD = os.getenv("DB_PASSWORD")
DB_NAME = os.getenv("DB_NAME")

def create_table():
    """
    Creates the `satellites` table in the PostgreSQL database.
    """
    conn = psycopg2.connect(
        host=DB_HOST,
        port=DB_PORT,
        user=DB_USER,
        password=DB_PASSWORD,
        dbname=DB_NAME
    )
    cursor = conn.cursor()

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS satellites (
            id SERIAL PRIMARY KEY,
            category VARCHAR(50),
            satellite_name VARCHAR(255),
            tle_line1 TEXT,
            tle_line2 TEXT
        );
    """)
    conn.commit()
    cursor.close()
    conn.close()
    print("Table 'satellites' created successfully.")

if __name__ == "__main__":
    create_table()
