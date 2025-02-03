# /backend/app/database.py

import psycopg2
from psycopg2.extras import RealDictCursor
from dotenv import load_dotenv
import os


# Load environment variables from .env
load_dotenv()

def get_db_connection():
    """
    Connect to the PostgreSQL database using environment variables.
    Returns a psycopg2 connection object.
    """
    try:
        conn = psycopg2.connect(
            host=os.getenv("DB_HOST"),
            database=os.getenv("DB_NAME"),
            user=os.getenv("DB_USER"),
            password=os.getenv("DB_PASSWORD"),
            port=os.getenv("DB_PORT", 5432),  # Default port 5432 if not set
            cursor_factory=RealDictCursor  # Allows dictionary-like access to query results
        )
        print("✅ Database connection established successfully!")
        return conn
    except Exception as e:
        print(f"❌ Database connection error: {e}")
        raise