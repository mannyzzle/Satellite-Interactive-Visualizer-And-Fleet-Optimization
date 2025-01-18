import pandas as pd
import psycopg2
import seaborn as sns
import matplotlib.pyplot as plt
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
    """Connect to the PostgreSQL database."""
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

def fetch_data(conn):
    """Fetch satellite data from the database."""
    query = """
    SELECT category, inclination, eccentricity, period, perigee, apogee
    FROM satellites;
    """
    try:
        data = pd.read_sql_query(query, conn)
        return data
    except Exception as e:
        print(f"Error fetching data: {e}")
        return None

def analyze_data(data):
    """Analyze correlations and plot a heatmap."""
    print("Calculating correlations...")
    correlations = data.corr()

    print("Plotting correlation heatmap...")
    plt.figure(figsize=(10, 8))
    sns.heatmap(correlations, annot=True, cmap="coolwarm", fmt=".2f", square=True)
    plt.title("Feature Correlation Heatmap")
    plt.savefig("correlation_heatmap.png")
    plt.show()

    print("Correlation heatmap saved as 'correlation_heatmap.png'.")
    return correlations

def main():
    """Main script to analyze satellite data."""
    print("Connecting to the database...")
    conn = connect_to_db()
    if not conn:
        return

    print("Fetching satellite data...")
    data = fetch_data(conn)
    if data is not None:
        print(f"Data fetched successfully! {data.shape[0]} rows.")
        print("Performing analysis...")
        correlations = analyze_data(data)
        print("Correlations:")
        print(correlations)
    else:
        print("No data to analyze.")

    conn.close()

if __name__ == "__main__":
    main()
