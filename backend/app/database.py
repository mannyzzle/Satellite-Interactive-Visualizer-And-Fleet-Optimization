import psycopg2
from psycopg2.extras import RealDictCursor
from dotenv import load_dotenv
import os


# Load environment variables from .env
load_dotenv()

def get_db_connection():
    """
    Connect to the PostgreSQL database using environment variables.
    """
    try:
        conn = psycopg2.connect(
            host=os.getenv("DB_HOST"),
            database=os.getenv("DB_NAME"),
            user=os.getenv("DB_USER"),
            password=os.getenv("DB_PASSWORD"),
            port=os.getenv("DB_PORT", 5432),
            cursor_factory=RealDictCursor
        )
        return conn
    except Exception as e:
        print(f"Database connection error: {e}")
        raise
