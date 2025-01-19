import psycopg2
import pandas as pd
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

def analyze_database(conn):
    cursor = conn.cursor()

    # Fetch all data
    query = "SELECT * FROM satellites"
    print("Fetching data from the database...")
    data = pd.read_sql_query(query, conn)

    # Data size
    print(f"Total rows in the database: {data.shape[0]}")
    print(f"Total columns in the database: {data.shape[1]}")

    # Check for duplicates
    print("Checking for duplicates...")
    duplicates = data.duplicated()
    num_duplicates = duplicates.sum()
    print(f"Number of duplicate rows: {num_duplicates}")

    # Show duplicate rows if any
    if num_duplicates > 0:
        print("\nDuplicate rows:")
        print(data[duplicates])

    # Missing values
    print("\nChecking for missing values...")
    missing_values = data.isnull().sum()
    print("Missing values per column:")
    print(missing_values)

    cursor.close()

if __name__ == "__main__":
    print("Connecting to the database...")
    conn = connect_to_db()
    try:
        analyze_database(conn)
    finally:
        conn.close()
