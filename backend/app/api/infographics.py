from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
import os

router = APIRouter()

INFOGRAPHICS_DIR = "backend/infographics"


@router.get("/{filter_name}/{graph_type}")
def get_infographic(filter_name: str, graph_type: str):
    """
    Fetches a specific infographic for a given filter.
    Example: /infographics/LEO/velocity_distribution
    """
    file_path = f"{INFOGRAPHICS_DIR}/{filter_name}_{graph_type}.png"

    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail=f"Infographic '{graph_type}' for '{filter_name}' not found")

    return FileResponse(file_path)
