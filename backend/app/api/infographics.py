#api/infographics.py

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
import os
import urllib.parse

router = APIRouter()

INFOGRAPHICS_DIR = "backend/infographics"  # ✅ Use a relative path

# Ensure directory at runtime (just in case)
os.makedirs(INFOGRAPHICS_DIR, exist_ok=True)

@router.get("/{filter_name}/{graph_type}.png")
def get_infographic(filter_name: str, graph_type: str):
    """
    Returns a pre-generated .png from /app/backend/infographics.
    e.g. /api/infographics/LEO/orbit_distribution.png
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
    if graph_type not in valid_graphs:
        raise HTTPException(status_code=400, detail=f"Invalid graph type: {graph_type}")

    decoded_filter_name = urllib.parse.unquote(filter_name)
    safe_filter_name = (
        decoded_filter_name.strip()
        .replace(" ", "_")
        .replace(":", "")
        .replace("(", "")
        .replace(")", "")
    )

    file_name = f"{safe_filter_name}_{graph_type}.png"
    file_path = os.path.join(INFOGRAPHICS_DIR, file_name)
    print(f"🔍 Looking for infographic: {file_path}")

    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail=f"Infographic not found at {file_path}")

    return FileResponse(file_path)
