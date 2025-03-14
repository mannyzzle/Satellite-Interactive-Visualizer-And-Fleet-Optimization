
from fastapi import APIRouter, HTTPException, Query
from app.database import get_db_connection
import math

router = APIRouter()

@router.get("/api/satellites/count")
async def get_satellite_count():
    db = get_db_connection()
    result = db.execute("SELECT COUNT(*) FROM satellites;").fetchone()
    return {"total": result[0]}