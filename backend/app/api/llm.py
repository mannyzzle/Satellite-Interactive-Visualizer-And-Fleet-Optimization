"""LLM-backed routes: NL search + CDM conjunction briefings.

Both endpoints sit behind a per-IP rate limiter and a DB-backed daily cap.
See services/llm_service.py for the cost-control rationale.
"""

import json
import math
import os
import sys

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse
from psycopg2.extras import DictCursor
from pydantic import BaseModel, Field

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

try:
    from database import get_db_connection
    from services.filter_schema import build_sql_from_structured
    from services import llm_service
    from services.maneuver_detector import detect_events, parse_tle_history
except ImportError:
    from app.database import get_db_connection
    from app.services.filter_schema import build_sql_from_structured
    from app.services import llm_service
    from app.services.maneuver_detector import detect_events, parse_tle_history


router = APIRouter()


def _sanitize(value):
    if isinstance(value, float) and (math.isnan(value) or math.isinf(value)):
        return None
    return value


def _client_ip(req: Request) -> str:
    fwd = req.headers.get("x-forwarded-for")
    if fwd:
        return fwd.split(",")[0].strip()
    return req.client.host if req.client else "unknown"


# ---------------------------------------------------------------------------
# POST /api/llm/search
# ---------------------------------------------------------------------------
class SearchRequest(BaseModel):
    query: str = Field(..., min_length=1, max_length=500)
    limit: int = Field(500, ge=1, le=2000)


@router.post("/search")
def llm_search(payload: SearchRequest, request: Request):
    """NL → structured filter → satellites list.

    Returns:
      {
        "query": str,
        "filters": dict,                # what the model decided to apply
        "total": int,
        "satellites": [...]
      }
    """
    try:
        llm_service.check_rate_limit(_client_ip(request))
        filters = llm_service.nl_to_filters(payload.query)
    except llm_service.LLMError as exc:
        raise HTTPException(status_code=exc.status, detail=str(exc))

    # Validate country against the catalog so a hallucinated code doesn't
    # silently zero out results.
    if filters.get("country"):
        if not _country_exists(filters["country"]):
            filters.pop("country")

    where_clause, params = build_sql_from_structured(filters)

    conn = get_db_connection()
    cursor = conn.cursor(cursor_factory=DictCursor)
    try:
        cursor.execute(
            f"SELECT COUNT(*) AS count FROM satellites WHERE {where_clause}",
            params,
        )
        total = cursor.fetchone()["count"]

        cursor.execute(
            f"""
            SELECT id, name, norad_number, orbit_type, inclination, velocity,
                   latitude, longitude, bstar, rev_num, ephemeris_type,
                   eccentricity, period, perigee, apogee, epoch, raan,
                   arg_perigee, mean_motion, semi_major_axis, tle_line1,
                   tle_line2, intl_designator, object_type,
                   launch_date, launch_site, decay_date, rcs, purpose, country, active_status
            FROM satellites
            WHERE {where_clause}
            ORDER BY launch_date DESC NULLS LAST, norad_number DESC
            LIMIT %s
            """,
            (*params, payload.limit),
        )
        rows = cursor.fetchall()
    finally:
        cursor.close()
        conn.close()

    satellites = [
        {
            k: _sanitize(row[k])
            for k in row.keys()
        }
        for row in rows
    ]

    return {
        "query": payload.query,
        "filters": filters,
        "total": total,
        "satellites": satellites,
    }


def _country_exists(code: str) -> bool:
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT 1 FROM satellites WHERE country = %s LIMIT 1", (code,))
            return cur.fetchone() is not None
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# GET /api/llm/cdm/{cdm_id}/briefing
# ---------------------------------------------------------------------------
@router.get("/cdm/{cdm_id}/briefing")
def cdm_briefing(cdm_id: str, request: Request):
    try:
        llm_service.check_rate_limit(_client_ip(request))
    except llm_service.LLMError as exc:
        raise HTTPException(status_code=exc.status, detail=str(exc))

    conn = get_db_connection()
    cursor = conn.cursor(cursor_factory=DictCursor)
    try:
        cursor.execute(
            "SELECT * FROM cdm_events WHERE cdm_id = %s LIMIT 1",
            (cdm_id,),
        )
        event = cursor.fetchone()
        if not event:
            raise HTTPException(status_code=404, detail="CDM event not found")

        sat1 = _fetch_sat(cursor, event["sat_1_id"])
        sat2 = _fetch_sat(cursor, event["sat_2_id"])
    finally:
        cursor.close()
        conn.close()

    try:
        text = llm_service.cdm_briefing(dict(event), dict(sat1) if sat1 else None,
                                         dict(sat2) if sat2 else None)
    except llm_service.LLMError as exc:
        raise HTTPException(status_code=exc.status, detail=str(exc))

    return {
        "cdm_id": cdm_id,
        "briefing": text,
        "model": llm_service.MODEL,
        "disclaimer": "AI-generated. Verify against official conjunction data before operational use.",
    }


def _fetch_sat(cursor, norad: int):
    cursor.execute(
        """
        SELECT name, norad_number, orbit_type, country, purpose, object_type,
               launch_date, active_status, rcs
        FROM satellites WHERE norad_number = %s LIMIT 1
        """,
        (norad,),
    )
    return cursor.fetchone()


# ---------------------------------------------------------------------------
# A1: POST /api/llm/ask — conversational analyst
# ---------------------------------------------------------------------------
class AskRequest(BaseModel):
    question: str = Field(..., min_length=1, max_length=1000)
    history: list = Field(default_factory=list)


@router.post("/ask")
def ask(payload: AskRequest, request: Request):
    try:
        llm_service.check_rate_limit(_client_ip(request))
        return llm_service.ask(payload.question, payload.history)
    except llm_service.LLMError as exc:
        raise HTTPException(status_code=exc.status, detail=str(exc))


@router.post("/ask/stream")
def ask_stream(payload: AskRequest, request: Request):
    """SSE-streamed variant of /ask. Each line is `data: <json>\\n\\n`.

    Event types: text_delta, tool_call, done, error.
    """
    try:
        llm_service.check_rate_limit(_client_ip(request))
    except llm_service.LLMError as exc:
        raise HTTPException(status_code=exc.status, detail=str(exc))

    def generate():
        try:
            for event in llm_service.ask_stream(payload.question, payload.history):
                yield f"data: {json.dumps(event)}\n\n"
        except Exception as exc:
            yield f"data: {json.dumps({'type': 'error', 'message': str(exc)})}\n\n"

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )


# ---------------------------------------------------------------------------
# A2: GET /api/llm/satellite/{norad}/timeline — maneuver detection + AI narrative
# ---------------------------------------------------------------------------
@router.get("/satellite/{norad}/timeline")
def satellite_timeline(norad: int, window_days: int = 365, request: Request = None):
    if request is not None:
        try:
            llm_service.check_rate_limit(_client_ip(request))
        except llm_service.LLMError as exc:
            raise HTTPException(status_code=exc.status, detail=str(exc))

    window_days = max(7, min(int(window_days), 730))

    conn = get_db_connection()
    cursor = conn.cursor(cursor_factory=DictCursor)
    try:
        cursor.execute(
            "SELECT name FROM satellites WHERE norad_number = %s LIMIT 1",
            (norad,),
        )
        sat = cursor.fetchone()
        if not sat:
            raise HTTPException(status_code=404, detail="Satellite not found")

        cursor.execute(
            """SELECT epoch, tle_line1, tle_line2, inserted_at
               FROM satellite_tle_history
               WHERE norad_number = %s
                 AND epoch > NOW() - (%s || ' days')::interval
               ORDER BY epoch ASC""",
            (norad, window_days),
        )
        rows = cursor.fetchall()
    finally:
        cursor.close()
        conn.close()

    snapshots = parse_tle_history(rows)
    events = [e.to_dict() for e in detect_events(snapshots)]

    try:
        narrative = llm_service.timeline_narrative(sat["name"], norad, events)
    except llm_service.LLMError as exc:
        raise HTTPException(status_code=exc.status, detail=str(exc))

    return {
        "norad": norad,
        "name": sat["name"],
        "window_days": window_days,
        "snapshots": [s.to_dict() for s in snapshots],
        "events": events,
        "narrative": narrative,
        "model": llm_service.MODEL,
    }


# ---------------------------------------------------------------------------
# B1: GET /api/llm/reentry/{norad}/briefing
# ---------------------------------------------------------------------------
@router.get("/reentry/{norad}/briefing")
def reentry_briefing(norad: int, request: Request):
    try:
        llm_service.check_rate_limit(_client_ip(request))
    except llm_service.LLMError as exc:
        raise HTTPException(status_code=exc.status, detail=str(exc))

    # Fetch the satellite + decay metadata directly here (no separate /api/reentry/{norad} route).
    conn = get_db_connection()
    cursor = conn.cursor(cursor_factory=DictCursor)
    try:
        cursor.execute(
            """SELECT name, norad_number, country, purpose, object_type,
                      perigee, apogee, inclination, bstar, rcs,
                      launch_date, decay_date, active_status
               FROM satellites WHERE norad_number = %s LIMIT 1""",
            (norad,),
        )
        sat = cursor.fetchone()
    finally:
        cursor.close()
        conn.close()

    if not sat:
        raise HTTPException(status_code=404, detail="Satellite not found")
    if sat["perigee"] is None or sat["bstar"] is None:
        raise HTTPException(status_code=400, detail="Insufficient orbital data for reentry briefing")

    payload = {k: (str(v) if hasattr(v, "isoformat") else v) for k, v in dict(sat).items()}
    try:
        text = llm_service.reentry_briefing(payload)
    except llm_service.LLMError as exc:
        raise HTTPException(status_code=exc.status, detail=str(exc))

    return {
        "norad": norad,
        "briefing": text,
        "model": llm_service.MODEL,
        "disclaimer": "AI-generated. Verify against official decay predictions before operational use.",
    }


# ---------------------------------------------------------------------------
# B2: GET /api/llm/space-weather/briefing
# ---------------------------------------------------------------------------
@router.get("/space-weather/briefing")
def space_weather_briefing(request: Request):
    try:
        llm_service.check_rate_limit(_client_ip(request))
    except llm_service.LLMError as exc:
        raise HTTPException(status_code=exc.status, detail=str(exc))

    try:
        from api.space_weather import current_space_weather
    except ImportError:
        from app.api.space_weather import current_space_weather

    weather = current_space_weather()
    exposed = weather.get("most_exposed_leo", [])

    try:
        text = llm_service.space_weather_briefing(weather, exposed)
    except llm_service.LLMError as exc:
        raise HTTPException(status_code=exc.status, detail=str(exc))

    return {
        "briefing": text,
        "weather": weather,
        "model": llm_service.MODEL,
    }
