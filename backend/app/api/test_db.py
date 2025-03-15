import psycopg2
from psycopg2.extras import RealDictCursor
from dotenv import load_dotenv
import os

# Load environment variables
load_dotenv()

def test_db_connection():
    try:
        conn = psycopg2.connect(
            host=os.getenv("DB_HOST"),
            database=os.getenv("DB_NAME"),
            user=os.getenv("DB_USER"),
            password=os.getenv("DB_PASSWORD"),
            port=os.getenv("DB_PORT", 5432),  # Default 5432
            cursor_factory=RealDictCursor
        )
        print("✅ Database connection established successfully!")

        with conn.cursor() as cursor:
            cursor.execute("SELECT COUNT(*) FROM satellites;")
            result = cursor.fetchone()
            print("🔍 Satellite count:", result)

        conn.close()
    
    except Exception as e:
        print(f"❌ Database connection error: {e}")

# Run the test
test_db_connection()
