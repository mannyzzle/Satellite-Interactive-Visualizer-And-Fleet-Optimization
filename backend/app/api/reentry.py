"""Reentry Watch — predicted decay leaderboard.

Pulls satellites where Space-Track has populated decay_date with a future
prediction. Adds simple risk metrics (RCS-driven fragment risk, days-until,
inclination band) and orders by imminence.

LLM briefings live in api/llm.py — this route is a pure DB read.
"""
from __future__ import annotations

import math
import os
import sys
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Query
from psycopg2.extras import DictCursor

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

try:
    from database import get_db_connection
except ImportError:
    from app.database import get_db_connection


router = APIRouter()


def _fragment_risk(rcs: str | None) -> str:
    """Heuristic only — Space-Track RCS values come as 'SMALL' / 'MEDIUM' / 'LARGE' / null."""
    if not rcs:
        return "unknown"
    r = rcs.upper()
    if "LARGE" in r:
        return "elevated"
    if "MEDIUM" in r:
        return "moderate"
    return "low"


def _inclination_band(inc: float | None) -> str:
    if inc is None:
        return "unknown"
    if inc < 30:
        return "equatorial"
    if inc < 60:
        return "mid-latitude"
    if inc < 80:
        return "polar-adjacent"
    return "polar"


def _sanitize(v):
    if isinstance(v, float) and (math.isnan(v) or math.isinf(v)):
        return None
    return v


def _imminence_score(perigee: float | None, bstar: float | None) -> float:
    """Composite "how soon will this come down" score, higher = more imminent.

    Captures the two physics inputs that dominate orbital lifetime in LEO:
    perigee altitude (lower = denser air = more drag) and bstar (the drag
    term encoded in every TLE). We don't try to compute days-to-decay —
    that needs full atmospheric modeling — but the relative ordering is
    what powers the leaderboard.
    """
    if perigee is None or bstar is None:
        return 0.0
    if perigee <= 0:
        return 0.0
    # bstar typical range 1e-6 to 1e-2 for decaying objects. Perigee 100-500 km.
    # Score maps to roughly 0-1 for "extremely imminent" decays.
    return float(bstar) * 1e4 / max(perigee, 50.0)


@router.get("/upcoming")
def upcoming_reentries(limit: int = Query(20, ge=1, le=100)):
    """Top imminent LEO reentries ordered by drag-imminence score.

    Decay_date isn't reliably populated in our catalog (Space-Track doesn't
    publish predicted decay for most objects), so we infer imminence from
    physics: low perigee × high bstar = short remaining lifetime.
    """
    conn = get_db_connection()
    cursor = conn.cursor(cursor_factory=DictCursor)
    try:
        cursor.execute(
            """SELECT name, norad_number, country, purpose, object_type,
                      perigee, apogee, inclination, bstar, rcs,
                      launch_date, decay_date, active_status
               FROM satellites
               WHERE perigee IS NOT NULL AND perigee < 350
                 AND bstar IS NOT NULL AND bstar > 0.0001
                 AND active_status IS DISTINCT FROM 'Inactive'
               ORDER BY (bstar / NULLIF(perigee, 0)) DESC
               LIMIT %s""",
            (limit,),
        )
        rows = cursor.fetchall()
    finally:
        cursor.close()
        conn.close()

    out = []
    for r in rows:
        out.append(
            {
                "name": r["name"],
                "norad_number": r["norad_number"],
                "country": r["country"],
                "purpose": r["purpose"],
                "object_type": r["object_type"],
                "perigee_km": _sanitize(r["perigee"]),
                "apogee_km": _sanitize(r["apogee"]),
                "inclination_deg": _sanitize(r["inclination"]),
                "bstar": _sanitize(r["bstar"]),
                "rcs": r["rcs"],
                "launch_date": str(r["launch_date"]) if r["launch_date"] else None,
                "decay_date": str(r["decay_date"]) if r["decay_date"] else None,
                "imminence_score": round(_imminence_score(r["perigee"], r["bstar"]), 3),
                "fragment_risk": _fragment_risk(r["rcs"]),
                "inclination_band": _inclination_band(r["inclination"]),
                "active_status": r["active_status"],
            }
        )

    return {"count": len(out), "reentries": out}
