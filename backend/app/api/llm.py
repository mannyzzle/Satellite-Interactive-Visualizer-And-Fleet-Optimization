"""LLM-backed routes: NL search + CDM conjunction briefings.

Both endpoints sit behind a per-IP rate limiter and a DB-backed daily cap.
See services/llm_service.py for the cost-control rationale.
"""

import math
import os
import sys

from fastapi import APIRouter, HTTPException, Request
from psycopg2.extras import DictCursor
from pydantic import BaseModel, Field

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

try:
    from database import get_db_connection
    from services.filter_schema import build_sql_from_structured
    from services import llm_service
except ImportError:
    from app.database import get_db_connection
    from app.services.filter_schema import build_sql_from_structured
    from app.services import llm_service


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
