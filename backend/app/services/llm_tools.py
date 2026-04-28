"""Read-only tools the conversational analyst (Claude) can call.

Each tool wraps a parameterized SQL query against a known table. Inputs
are validated against allowlists; results are capped per-call to limit
context size. Cache is the responsibility of the caller (api/llm.py).

Tool design rules:
  - All inputs are typed enums or bounded numbers — no free-form SQL.
  - All queries are parameterized — never f-string interpolation of user
    input into SQL fragments.
  - Every tool has a hard row cap (default 200) — Claude can ask for
    "10000" but we'll silently clamp.
  - Results returned are JSON-serializable dicts (datetimes → strings).
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from psycopg2.extras import DictCursor

try:
    from database import get_db_connection
    from services.filter_schema import (
        ORBIT_TYPES,
        PURPOSES,
        build_sql_from_structured,
    )
except ImportError:
    from app.database import get_db_connection
    from app.services.filter_schema import (
        ORBIT_TYPES,
        PURPOSES,
        build_sql_from_structured,
    )


# ---------------------------------------------------------------------------
# Tool schemas (consumed by the Anthropic SDK as `tools=[...]`)
# ---------------------------------------------------------------------------
TOOL_SCHEMAS = [
    {
        "name": "query_catalog",
        "description": (
            "Query the satellite catalog. Use 'aggregate' to get counts or "
            "histograms instead of raw rows. Use 'group_by' with an aggregate "
            "to break down counts by a column (e.g. country, orbit_type, "
            "purpose, launch_year). Returns raw rows when no aggregate is set."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "filters": {
                    "type": "object",
                    "description": "Same fields as apply_filters tool. All optional.",
                    "properties": {
                        "orbit_type": {"type": "string", "enum": ORBIT_TYPES},
                        "purpose": {"type": "string", "enum": PURPOSES},
                        "country": {"type": "string"},
                        "launch_year_min": {"type": "integer"},
                        "launch_year_max": {"type": "integer"},
                        "perigee_min_km": {"type": "number"},
                        "perigee_max_km": {"type": "number"},
                        "apogee_min_km": {"type": "number"},
                        "apogee_max_km": {"type": "number"},
                        "active_only": {"type": "boolean"},
                        "recent_launches": {"type": "boolean"},
                        "decaying": {"type": "boolean"},
                    },
                },
                "aggregate": {
                    "type": "string",
                    "enum": ["count", "histogram_perigee", "histogram_inclination"],
                    "description": "If set, returns aggregates instead of rows.",
                },
                "group_by": {
                    "type": "string",
                    "enum": ["country", "orbit_type", "purpose", "object_type", "launch_year"],
                    "description": "Group counts by this column. Requires aggregate=count.",
                },
                "limit": {"type": "integer", "minimum": 1, "maximum": 200},
            },
        },
    },
    {
        "name": "query_cdms",
        "description": (
            "Query Conjunction Data Messages (close-approach events). "
            "Returns events ordered by time-of-closest-approach ascending."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "min_pc": {
                    "type": "number",
                    "minimum": 0,
                    "maximum": 1,
                    "description": "Filter to collision probability >= this value.",
                },
                "max_tca_hours": {
                    "type": "integer",
                    "minimum": 1,
                    "maximum": 720,
                    "description": "Only events whose TCA is within this many hours from now.",
                },
                "norad": {
                    "type": "integer",
                    "description": "Only events involving this NORAD number (sat_1 or sat_2).",
                },
                "emergency_only": {"type": "boolean"},
                "limit": {"type": "integer", "minimum": 1, "maximum": 100},
            },
        },
    },
    {
        "name": "query_launches",
        "description": "Query the launch schedule and history.",
        "input_schema": {
            "type": "object",
            "properties": {
                "window": {
                    "type": "string",
                    "enum": ["upcoming", "past_30d", "past_year"],
                },
                "success_only": {"type": "boolean"},
                "agency": {"type": "string"},
                "limit": {"type": "integer", "minimum": 1, "maximum": 50},
            },
            "required": ["window"],
        },
    },
    {
        "name": "query_space_weather",
        "description": (
            "Query space-weather indices. metric=kp returns 3-hourly Kp, "
            "metric=dst returns hourly Dst, metric=f107 returns daily F10.7, "
            "metric=sw_speed returns hourly solar wind speed. Use aggregate "
            "to get max/min/avg over the window."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "metric": {
                    "type": "string",
                    "enum": ["kp", "dst", "f107", "sw_speed"],
                },
                "window_hours": {"type": "integer", "minimum": 1, "maximum": 720},
                "aggregate": {
                    "type": "string",
                    "enum": ["max", "min", "avg", "latest"],
                },
            },
            "required": ["metric"],
        },
    },
    {
        "name": "query_tle_history",
        "description": (
            "Get historical TLE rows for a satellite, ordered oldest first. "
            "Useful for inspecting orbit changes over time."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "norad": {"type": "integer"},
                "window_days": {"type": "integer", "minimum": 1, "maximum": 730},
                "limit": {"type": "integer", "minimum": 1, "maximum": 100},
            },
            "required": ["norad"],
        },
    },
]


# ---------------------------------------------------------------------------
# Tool dispatch
# ---------------------------------------------------------------------------
class ToolError(Exception):
    pass


def call_tool(name: str, args: dict) -> dict:
    """Top-level dispatcher used by the route. Returns a JSON-serializable
    dict; the route stringifies it for the tool-result message."""
    args = args or {}
    if name == "query_catalog":
        return query_catalog(**args)
    if name == "query_cdms":
        return query_cdms(**args)
    if name == "query_launches":
        return query_launches(**args)
    if name == "query_space_weather":
        return query_space_weather(**args)
    if name == "query_tle_history":
        return query_tle_history(**args)
    raise ToolError(f"unknown tool: {name}")


def _serialize_value(v):
    if isinstance(v, datetime):
        return v.isoformat()
    return v


def _row(r) -> dict:
    return {k: _serialize_value(r[k]) for k in r.keys()}


# ---------------------------------------------------------------------------
# query_catalog
# ---------------------------------------------------------------------------
GROUP_BY_COLUMNS = {
    "country": "country",
    "orbit_type": "orbit_type",
    "purpose": "purpose",
    "object_type": "object_type",
    "launch_year": "EXTRACT(YEAR FROM launch_date)",
}


def query_catalog(
    filters: dict | None = None,
    aggregate: str | None = None,
    group_by: str | None = None,
    limit: int = 50,
) -> dict:
    limit = max(1, min(int(limit), 200))
    where, params = build_sql_from_structured(filters or {})

    conn = get_db_connection()
    cursor = conn.cursor(cursor_factory=DictCursor)
    try:
        if aggregate == "count":
            if group_by:
                if group_by not in GROUP_BY_COLUMNS:
                    raise ToolError(f"invalid group_by: {group_by}")
                col = GROUP_BY_COLUMNS[group_by]
                cursor.execute(
                    f"SELECT {col} AS bucket, COUNT(*) AS count "
                    f"FROM satellites WHERE {where} "
                    f"GROUP BY {col} ORDER BY count DESC LIMIT %s",
                    (*params, limit),
                )
                rows = [{"bucket": _serialize_value(r["bucket"]), "count": r["count"]}
                        for r in cursor.fetchall()]
                return {"aggregate": "count", "group_by": group_by, "buckets": rows}

            cursor.execute(f"SELECT COUNT(*) AS c FROM satellites WHERE {where}", params)
            return {"aggregate": "count", "count": cursor.fetchone()["c"]}

        if aggregate == "histogram_perigee":
            cursor.execute(
                f"""SELECT
                    width_bucket(perigee, 0, 50000, 50) AS bucket,
                    COUNT(*) AS count
                FROM satellites
                WHERE {where} AND perigee IS NOT NULL
                GROUP BY bucket ORDER BY bucket
                """,
                params,
            )
            return {"aggregate": "histogram_perigee", "buckets": [_row(r) for r in cursor.fetchall()]}

        if aggregate == "histogram_inclination":
            cursor.execute(
                f"""SELECT
                    width_bucket(inclination, 0, 180, 36) AS bucket,
                    COUNT(*) AS count
                FROM satellites
                WHERE {where} AND inclination IS NOT NULL
                GROUP BY bucket ORDER BY bucket
                """,
                params,
            )
            return {"aggregate": "histogram_inclination", "buckets": [_row(r) for r in cursor.fetchall()]}

        # Raw rows
        cursor.execute(
            f"""SELECT name, norad_number, orbit_type, country, purpose, object_type,
                       perigee, apogee, inclination, period, launch_date, active_status
                FROM satellites WHERE {where}
                ORDER BY launch_date DESC NULLS LAST, norad_number DESC
                LIMIT %s""",
            (*params, limit),
        )
        return {"rows": [_row(r) for r in cursor.fetchall()]}
    finally:
        cursor.close()
        conn.close()


# ---------------------------------------------------------------------------
# query_cdms
# ---------------------------------------------------------------------------
def query_cdms(
    min_pc: float | None = None,
    max_tca_hours: int | None = None,
    norad: int | None = None,
    emergency_only: bool = False,
    limit: int = 25,
) -> dict:
    limit = max(1, min(int(limit), 100))
    where_parts = ["is_active = TRUE"]
    params: list = []

    if min_pc is not None:
        where_parts.append("pc >= %s")
        params.append(float(min_pc))
    if max_tca_hours is not None:
        where_parts.append("tca <= NOW() + (%s || ' hours')::interval")
        params.append(int(max_tca_hours))
    if norad is not None:
        where_parts.append("(sat_1_id = %s OR sat_2_id = %s)")
        params.extend([int(norad), int(norad)])
    if emergency_only:
        where_parts.append("emergency_reportable = TRUE")

    where = " AND ".join(where_parts)

    conn = get_db_connection()
    cursor = conn.cursor(cursor_factory=DictCursor)
    try:
        cursor.execute(
            f"""SELECT cdm_id, tca, pc, min_rng,
                       sat_1_id, sat_1_name, sat_1_type,
                       sat_2_id, sat_2_name, sat_2_type,
                       emergency_reportable
                FROM cdm_events WHERE {where}
                ORDER BY tca ASC LIMIT %s""",
            (*params, limit),
        )
        return {"rows": [_row(r) for r in cursor.fetchall()]}
    finally:
        cursor.close()
        conn.close()


# ---------------------------------------------------------------------------
# query_launches
# ---------------------------------------------------------------------------
def query_launches(
    window: str = "upcoming",
    success_only: bool = False,
    agency: str | None = None,
    limit: int = 20,
) -> dict:
    limit = max(1, min(int(limit), 50))

    if window == "upcoming":
        time_clause = "launch_date > NOW()"
        order = "launch_date ASC"
    elif window == "past_30d":
        time_clause = "launch_date BETWEEN NOW() - INTERVAL '30 days' AND NOW()"
        order = "launch_date DESC"
    elif window == "past_year":
        time_clause = "launch_date BETWEEN NOW() - INTERVAL '365 days' AND NOW()"
        order = "launch_date DESC"
    else:
        raise ToolError(f"invalid window: {window}")

    where_parts = [time_clause]
    params: list = []
    if success_only:
        where_parts.append("launch_success = TRUE")
    if agency:
        where_parts.append("mission_agency ILIKE %s")
        params.append(f"%{agency}%")

    where = " AND ".join(where_parts)
    conn = get_db_connection()
    cursor = conn.cursor(cursor_factory=DictCursor)
    try:
        cursor.execute(
            f"""SELECT id, name, mission_description, launch_date, launch_status,
                       rocket_name, vehicle_type, mission_agency, payload_name,
                       payload_orbit, mission_type, launch_success, failure_reason
                FROM launches WHERE {where} ORDER BY {order} LIMIT %s""",
            (*params, limit),
        )
        return {"rows": [_row(r) for r in cursor.fetchall()]}
    finally:
        cursor.close()
        conn.close()


# ---------------------------------------------------------------------------
# query_space_weather
# ---------------------------------------------------------------------------
def query_space_weather(
    metric: str = "kp",
    window_hours: int = 24,
    aggregate: str | None = None,
) -> dict:
    window_hours = max(1, min(int(window_hours), 720))

    metric_map = {
        "kp": ("geomagnetic_kp_index", "kp_value", "time"),
        "dst": ("dst_index", "dst", "time"),
        "f107": ("f107_flux", "f107", "date"),
        "sw_speed": ("solar_wind", "speed", "time"),
    }
    if metric not in metric_map:
        raise ToolError(f"invalid metric: {metric}")
    table, col, ts_col = metric_map[metric]

    if metric == "f107":
        time_clause = f"{ts_col} > CURRENT_DATE - INTERVAL '{window_hours} hours'"
    else:
        time_clause = f"{ts_col} > NOW() - INTERVAL '{window_hours} hours'"

    conn = get_db_connection()
    cursor = conn.cursor(cursor_factory=DictCursor)
    try:
        if aggregate == "max":
            cursor.execute(f"SELECT MAX({col}) AS v FROM {table} WHERE {time_clause}")
            return {"metric": metric, "aggregate": "max", "value": cursor.fetchone()["v"]}
        if aggregate == "min":
            cursor.execute(f"SELECT MIN({col}) AS v FROM {table} WHERE {time_clause}")
            return {"metric": metric, "aggregate": "min", "value": cursor.fetchone()["v"]}
        if aggregate == "avg":
            cursor.execute(f"SELECT AVG({col}) AS v FROM {table} WHERE {time_clause}")
            return {"metric": metric, "aggregate": "avg", "value": float(cursor.fetchone()["v"]) if cursor.fetchone() else None}
        if aggregate == "latest":
            cursor.execute(f"SELECT {ts_col} AS t, {col} AS v FROM {table} WHERE {time_clause} ORDER BY {ts_col} DESC LIMIT 1")
            row = cursor.fetchone()
            return {"metric": metric, "aggregate": "latest", "row": _row(row) if row else None}

        cursor.execute(
            f"SELECT {ts_col} AS t, {col} AS v FROM {table} WHERE {time_clause} ORDER BY {ts_col} DESC LIMIT 200"
        )
        return {"metric": metric, "rows": [_row(r) for r in cursor.fetchall()]}
    finally:
        cursor.close()
        conn.close()


# ---------------------------------------------------------------------------
# query_tle_history
# ---------------------------------------------------------------------------
def query_tle_history(norad: int, window_days: int = 90, limit: int = 50) -> dict:
    norad = int(norad)
    window_days = max(1, min(int(window_days), 730))
    limit = max(1, min(int(limit), 100))

    conn = get_db_connection()
    cursor = conn.cursor(cursor_factory=DictCursor)
    try:
        cursor.execute(
            """SELECT epoch, tle_line1, tle_line2, inserted_at
               FROM satellite_tle_history
               WHERE norad_number = %s
                 AND epoch > NOW() - (%s || ' days')::interval
               ORDER BY epoch ASC LIMIT %s""",
            (norad, window_days, limit),
        )
        return {"norad": norad, "rows": [_row(r) for r in cursor.fetchall()]}
    finally:
        cursor.close()
        conn.close()
