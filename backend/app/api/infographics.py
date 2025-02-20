# api/infographics.py

from fastapi import APIRouter, HTTPException
from fastapi.responses import Response
import urllib.parse
from sqlalchemy.orm import sessionmaker
from app.generate_infographics import Infographic, engine

router = APIRouter()

# ✅ Set up SQLAlchemy session
Session = sessionmaker(bind=engine)
session = Session()

@router.get("/{filter_name}/{graph_type}.png")
def get_infographic(filter_name: str, graph_type: str):
    """
    Fetches an infographic from the AWS PostgreSQL database.
    Returns the image as a binary response.
    """

    valid_graphs = {
        "orbit_distribution",
        "velocity_distribution",
        "perigee_apogee",
        "purpose_breakdown",
        "country_distribution",
        "cumulative_launch_trend",
        "orbital_period_vs_mean_motion",
        "inclination_mean_motion",
        "bstar_altitude",
        "launch_sites",
    }

    # Ensure graph type is valid
    if graph_type not in valid_graphs:
        raise HTTPException(status_code=400, detail=f"Invalid graph type: {graph_type}")

    # Decode and sanitize filter name
    decoded_filter_name = urllib.parse.unquote(filter_name)
    safe_filter_name = (
        decoded_filter_name.strip()
        .replace(" ", "_")
        .replace(":", "")
        .replace("(", "")
        .replace(")", "")
    )

    # Construct the file name to match the format in the database
    file_name = f"{safe_filter_name}_{graph_type}"
    print(f"🔍 Fetching infographic from DB: {file_name}")

    # Query the database for the infographic entry based on the combination of filter_name and graph_type
    infographic = session.query(Infographic).filter_by(filter_name=file_name).first()

    # If no infographic is found or it doesn't have image data
    if not infographic or not infographic.image_data:
        raise HTTPException(status_code=404, detail=f"Infographic not found: {file_name}")

    print(f"✅ Successfully retrieved infographic: {file_name}")

    # Return the image data as a PNG response
    return Response(content=infographic.image_data, media_type="image/png")
