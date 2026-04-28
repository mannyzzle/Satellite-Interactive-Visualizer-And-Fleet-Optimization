"""Space weather endpoint — current readings + most-exposed LEO list.

Pure DB read for the banner; AI briefing route lives in api/llm.py.
"""
from __future__ import annotations

import os
import sys

from fastapi import APIRouter
from psycopg2.extras import DictCursor

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

try:
    from database import get_db_connection
except ImportError:
    from app.database import get_db_connection


router = APIRouter()


def _classify_storm(kp: float | None, dst: float | None) -> dict:
    if kp is None and dst is None:
        return {"level": "unknown", "active": False}
    kp_v = kp or 0
    dst_v = dst or 0
    if kp_v >= 8 or dst_v <= -200:
        return {"level": "severe storm", "active": True}
    if kp_v >= 7 or dst_v <= -150:
        return {"level": "strong storm", "active": True}
    if kp_v >= 5 or dst_v <= -50:
        return {"level": "minor storm", "active": True}
    if kp_v >= 4:
        return {"level": "unsettled", "active": False}
    return {"level": "quiet", "active": False}


@router.get("/current")
def current_space_weather():
    conn = get_db_connection()
    cursor = conn.cursor(cursor_factory=DictCursor)
    try:
        cursor.execute("SELECT kp_value, time FROM geomagnetic_kp_index ORDER BY time DESC LIMIT 1")
        kp_row = cursor.fetchone()

        cursor.execute("SELECT dst, time FROM dst_index ORDER BY time DESC LIMIT 1")
        dst_row = cursor.fetchone()

        cursor.execute("SELECT f107, date FROM f107_flux ORDER BY date DESC LIMIT 1")
        f_row = cursor.fetchone()

        cursor.execute("SELECT speed, density, time FROM solar_wind ORDER BY time DESC LIMIT 1")
        sw_row = cursor.fetchone()

        # Most-exposed LEO (lowest perigee with non-trivial bstar — proxies for drag exposure)
        cursor.execute(
            """SELECT name, norad_number, perigee, bstar, country
               FROM satellites
               WHERE orbit_type = 'LEO'
                 AND perigee IS NOT NULL AND perigee < 400
                 AND bstar IS NOT NULL AND bstar > 0.0001
                 AND active_status IS DISTINCT FROM 'Inactive'
               ORDER BY perigee ASC, bstar DESC
               LIMIT 5"""
        )
        exposed = cursor.fetchall()
    finally:
        cursor.close()
        conn.close()

    kp = float(kp_row["kp_value"]) if kp_row and kp_row["kp_value"] is not None else None
    dst = float(dst_row["dst"]) if dst_row and dst_row["dst"] is not None else None
    f107 = float(f_row["f107"]) if f_row and f_row["f107"] is not None else None
    sw_speed = float(sw_row["speed"]) if sw_row and sw_row["speed"] is not None else None

    storm = _classify_storm(kp, dst)

    return {
        "kp": kp,
        "kp_time": kp_row["time"].isoformat() if kp_row and kp_row.get("time") else None,
        "dst": dst,
        "dst_time": dst_row["time"].isoformat() if dst_row and dst_row.get("time") else None,
        "f107": f107,
        "f107_date": str(f_row["date"]) if f_row and f_row.get("date") else None,
        "sw_speed_km_s": sw_speed,
        "storm": storm,
        "most_exposed_leo": [
            {
                "name": e["name"],
                "norad_number": e["norad_number"],
                "perigee_km": float(e["perigee"]) if e["perigee"] is not None else None,
                "bstar": float(e["bstar"]) if e["bstar"] is not None else None,
                "country": e["country"],
            }
            for e in exposed
        ],
    }
