from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import List
import psycopg2
import os
from dotenv import load_dotenv
from datetime import datetime

app = FastAPI()

# Utility function: Serialize satellite data
def serialize_satellite(row):
    """
    Serializes satellite data, ensuring the epoch field is converted to a string if necessary.
    Handles datetime objects, strings, and None values for epoch.
    """
    epoch = row["epoch"]
    if isinstance(epoch, datetime):
        epoch = epoch.isoformat()  # Convert datetime to ISO 8601 string
    elif epoch is None:
        epoch = "Unknown"  # Placeholder for missing epochs

    return {
        "id": row["id"],
        "satellite_name": row["satellite_name"],
        "tle_line1": row["tle_line1"],
        "tle_line2": row["tle_line2"],
        "inclination": row["inclination"],
        "eccentricity": row["eccentricity"],
        "period": row["period"],
        "perigee": row["perigee"],
        "apogee": row["apogee"],
        "epoch": epoch,  # Serialized epoch
        "raan": row["raan"],
        "arg_perigee": row["arg_perigee"],
        "mean_anomaly": row["mean_anomaly"],
        "mean_motion": row["mean_motion"],
        "semi_major_axis": row["semi_major_axis"],
        "velocity": row["velocity"],
        "orbit_type": row["orbit_type"],
        "satellite_age": row["satellite_age"],
        "bstar": row["bstar"],
        "rev_num": row["rev_num"],
        "norad_number": row["norad_number"],
        "ephemeris_type": row["ephemeris_type"],
        "intl_designator": row["intl_designator"],
    }

# Load environment variables
load_dotenv()

def connect_to_db():
    try:
        conn = psycopg2.connect(
            host=os.getenv("DB_HOST"),
            port=os.getenv("DB_PORT"),
            database=os.getenv("DB_NAME"),
            user=os.getenv("DB_USER"),
            password=os.getenv("DB_PASSWORD"),
        )
        print("Database connection successful")
        return conn
    except Exception as e:
        print(f"Database connection failed: {e}")
        raise

# Satellite Model
class Satellite(BaseModel):
    id: int
    satellite_name: str
    tle_line1: str
    tle_line2: str
    inclination: float
    eccentricity: float
    period: float
    perigee: float
    apogee: float
    epoch: str
    raan: float
    arg_perigee: float
    mean_anomaly: float
    mean_motion: float
    semi_major_axis: float
    velocity: float
    orbit_type: str
    satellite_age: int
    bstar: float
    rev_num: int
    norad_number: int
    ephemeris_type: str
    intl_designator: str

# Root route
@app.get("/")
def read_root():
    return {"message": "Welcome to the Satellite API!"}

# Get all satellites
@app.get("/satellites", response_model=List[Satellite])
def get_all_satellites(page: int = 1, limit: int = 100):
    conn = connect_to_db()
    cursor = conn.cursor()
    offset = (page - 1) * limit
    query = f"""
        SELECT id, satellite_name, tle_line1, tle_line2, inclination, eccentricity, period, perigee, apogee, epoch, 
               raan, arg_perigee, mean_anomaly, mean_motion, semi_major_axis, velocity, orbit_type, satellite_age, 
               bstar, rev_num, norad_number, ephemeris_type, intl_designator
        FROM satellites
        LIMIT {limit} OFFSET {offset}
    """
    cursor.execute(query)
    rows = cursor.fetchall()
    conn.close()

    satellites = [
        Satellite(
            id=row[0],
            satellite_name=row[1],
            tle_line1=row[2],
            tle_line2=row[3],
            inclination=row[4],
            eccentricity=row[5],
            period=row[6],
            perigee=row[7],
            apogee=row[8],
            epoch=row[9].isoformat() if isinstance(row[9], datetime) else "Unknown",  # Serialize epoch
            raan=row[10],
            arg_perigee=row[11],
            mean_anomaly=row[12],
            mean_motion=row[13],
            semi_major_axis=row[14],
            velocity=row[15],
            orbit_type=row[16],
            satellite_age=row[17],
            bstar=row[18],
            rev_num=row[19],
            norad_number=row[20],
            ephemeris_type=row[21],
            intl_designator=row[22]
        )
        for row in rows
    ]
    return satellites
