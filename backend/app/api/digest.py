"""Daily digest — single 5-paragraph briefing per UTC day.

Generated lazily on first request per day if not yet cached, then served
from `llm_daily_briefings` thereafter. A nightly cron can pre-warm the
cache by hitting GET /today, but it's not required.
"""
from __future__ import annotations

import os
import sys
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException
from psycopg2.extras import DictCursor

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

try:
    from database import get_db_connection
    from services import llm_service
except ImportError:
    from app.database import get_db_connection
    from app.services import llm_service


router = APIRouter()


def _build_summary() -> dict:
    """Aggregate data the digest writer needs from the past 24h."""
    conn = get_db_connection()
    cursor = conn.cursor(cursor_factory=DictCursor)
    try:
        # Top conjunctions next 24h
        cursor.execute(
            """SELECT cdm_id, tca, pc, min_rng,
                      sat_1_id, sat_1_name, sat_1_type,
                      sat_2_id, sat_2_name, sat_2_type,
                      emergency_reportable
               FROM cdm_events
               WHERE is_active = TRUE
                 AND tca BETWEEN NOW() AND NOW() + INTERVAL '24 hours'
               ORDER BY pc DESC LIMIT 5"""
        )
        cdms = [
            {k: (v.isoformat() if hasattr(v, "isoformat") else v) for k, v in dict(r).items()}
            for r in cursor.fetchall()
        ]

        # Launches in the last 24h
        cursor.execute(
            """SELECT id, name, mission_description, launch_date, launch_status,
                      rocket_name, mission_agency, payload_name, launch_success
               FROM launches
               WHERE launch_date BETWEEN NOW() - INTERVAL '24 hours' AND NOW()
               ORDER BY launch_date DESC LIMIT 5"""
        )
        recent_launches = [
            {k: (v.isoformat() if hasattr(v, "isoformat") else v) for k, v in dict(r).items()}
            for r in cursor.fetchall()
        ]

        # Upcoming launches in the next 24h
        cursor.execute(
            """SELECT id, name, launch_date, rocket_name, mission_agency, payload_name
               FROM launches
               WHERE launch_date BETWEEN NOW() AND NOW() + INTERVAL '24 hours'
               ORDER BY launch_date ASC LIMIT 5"""
        )
        upcoming_launches = [
            {k: (v.isoformat() if hasattr(v, "isoformat") else v) for k, v in dict(r).items()}
            for r in cursor.fetchall()
        ]

        # Imminent decays (next 7 days)
        cursor.execute(
            """SELECT name, norad_number, decay_date, rcs, country, perigee
               FROM satellites
               WHERE decay_date IS NOT NULL
                 AND decay_date BETWEEN NOW() AND NOW() + INTERVAL '7 days'
               ORDER BY decay_date ASC LIMIT 5"""
        )
        decays = [
            {k: (str(v) if hasattr(v, "isoformat") else v) for k, v in dict(r).items()}
            for r in cursor.fetchall()
        ]

        # Space weather snapshot
        cursor.execute("SELECT MAX(kp_value) AS kp FROM geomagnetic_kp_index WHERE time > NOW() - INTERVAL '24 hours'")
        kp_max = cursor.fetchone()
        cursor.execute("SELECT MIN(dst) AS dst FROM dst_index WHERE time > NOW() - INTERVAL '24 hours'")
        dst_min = cursor.fetchone()
        cursor.execute("SELECT f107 FROM f107_flux ORDER BY date DESC LIMIT 1")
        f107 = cursor.fetchone()

        return {
            "as_of": datetime.now(timezone.utc).isoformat(),
            "top_conjunctions_24h": cdms,
            "launches_past_24h": recent_launches,
            "launches_next_24h": upcoming_launches,
            "imminent_decays_7d": decays,
            "space_weather_24h": {
                "kp_max": float(kp_max["kp"]) if kp_max and kp_max["kp"] is not None else None,
                "dst_min": float(dst_min["dst"]) if dst_min and dst_min["dst"] is not None else None,
                "f107_latest": float(f107["f107"]) if f107 and f107["f107"] is not None else None,
            },
        }
    finally:
        cursor.close()
        conn.close()


@router.get("/today")
def todays_digest():
    today = datetime.now(timezone.utc).date()
    conn = get_db_connection()
    cursor = conn.cursor(cursor_factory=DictCursor)
    try:
        cursor.execute("SELECT briefing, model, generated FROM llm_daily_briefings WHERE day = %s", (today,))
        cached = cursor.fetchone()
        if cached:
            return {
                "day": today.isoformat(),
                "briefing": cached["briefing"],
                "model": cached["model"],
                "generated": cached["generated"].isoformat(),
                "cached": True,
            }
    finally:
        cursor.close()
        conn.close()

    summary = _build_summary()
    try:
        text = llm_service.daily_digest(summary)
    except llm_service.LLMError as exc:
        raise HTTPException(status_code=exc.status, detail=str(exc))

    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute(
            """INSERT INTO llm_daily_briefings (day, briefing, model)
               VALUES (%s, %s, %s)
               ON CONFLICT (day) DO UPDATE
                 SET briefing = EXCLUDED.briefing, model = EXCLUDED.model, generated = NOW()""",
            (today, text, llm_service.MODEL),
        )
        conn.commit()
    finally:
        cursor.close()
        conn.close()

    return {
        "day": today.isoformat(),
        "briefing": text,
        "model": llm_service.MODEL,
        "generated": datetime.now(timezone.utc).isoformat(),
        "cached": False,
    }
