import psycopg2

# Database credentials
DB_HOST = "my-psql-db.c9a86w4ciyti.us-east-2.rds.amazonaws.com"
DB_PORT = 5432
DB_USER = "<your-username>"
DB_PASSWORD = "<your-password>"
DB_NAME = "<your-database>"

def connect_to_database():
    """Establish a connection to the PostgreSQL database."""
    try:
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
