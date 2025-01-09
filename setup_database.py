from dotenv import load_dotenv
import os
import psycopg2

# Load environment variables from the devcontainer.env file
dotenv_path = os.path.join(".devcontainer", "devcontainer.env")
load_dotenv(dotenv_path=dotenv_path)

def connect_to_database():
    """Establish a connection to the PostgreSQL database."""
    try:
        # Fetch database credentials from environment variables
        DB_HOST = os.getenv("DB_HOST")
        DB_PORT = os.getenv("DB_PORT", 5432)  # Default to 5432 if not set
        DB_USER = os.getenv("DB_USER")
        DB_PASSWORD = os.getenv("DB_PASSWORD")
        DB_NAME = os.getenv("DB_NAME")

        # Connect to the database
        conn = psycopg2.connect(
            host=DB_HOST,
            port=DB_PORT,
            user=DB_USER,
            password=DB_PASSWORD,
            dbname=DB_NAME
        )
        print("Database connection established successfully.")
        return conn
    except Exception as e:
        print(f"Failed to connect to the database: {e}")
        return None

if __name__ == "__main__":
    # Test the database connection
    connection = connect_to_database()
    if connection:
        # Close the connection after testing
        connection.close()
        print("Database connection closed.")
