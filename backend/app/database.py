import psycopg2
from psycopg2.extras import RealDictCursor
from dotenv import load_dotenv
import os

# Load environment variables from .env
load_dotenv()

def get_db_connection():
    """
    Connect to the PostgreSQL database using environment variables.
    Implements keepalive settings to prevent idle disconnections.
    Returns a psycopg2 connection object.
    """
    try:
        conn = psycopg2.connect(
            host=os.getenv("DB_HOST"),
            database=os.getenv("DB_NAME"),
            user=os.getenv("DB_USER"),
            password=os.getenv("DB_PASSWORD"),
            port=os.getenv("DB_PORT", 5432),  # Default to 5432 if not set
            cursor_factory=RealDictCursor,  # Allows dictionary-like access
            sslmode="require",  # Ensures SSL connection (Change if needed)
            connect_timeout=30,  # Timeout after 30 seconds if no response
            keepalives=1,       # Enable TCP Keepalive
            keepalives_idle=30,  # Send keepalive every 30 seconds
            keepalives_interval=10,  # Retry keepalive every 10 seconds
            keepalives_count=5   # Drop connection after 5 failed keepalives
        )
        print("✅ Database connection established successfully!")
        return conn
    except psycopg2.OperationalError as e:
        print(f"❌ Database connection error: {e}")
        raise
