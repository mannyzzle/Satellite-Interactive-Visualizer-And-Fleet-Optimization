import psycopg2
from dotenv import load_dotenv
import os

# Load environment variables
load_dotenv()

DB_HOST = os.getenv("DB_HOST")
DB_PORT = os.getenv("DB_PORT")
DB_USER = os.getenv("DB_USER")
DB_PASSWORD = os.getenv("DB_PASSWORD")
DB_NAME = os.getenv("DB_NAME")

def connect_to_db():
    try:
        conn = psycopg2.connect(
            host=DB_HOST,
            port=DB_PORT,
            user=DB_USER,
            password=DB_PASSWORD,
            dbname=DB_NAME
        )
        return conn
    except psycopg2.Error as e:
        print(f"Error connecting to the database: {e}")
        return None

def get_schema(conn):
    query = """
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'satellites';
    """
    try:
        with conn.cursor() as cursor:
            cursor.execute(query)
            schema = cursor.fetchall()
            return schema
    except Exception as e:
        print(f"Error fetching schema: {e}")
        return None

if __name__ == "__main__":
    conn = connect_to_db()
    if conn:
        schema = get_schema(conn)
        if schema:
            print("Satellites Table Schema:")
            for column in schema:
                print(column)
        conn.close()