"""Single source of truth for satellite filter labels and SQL conditions.

Used by:
  - api/satellites.py legacy CSV filter parser
  - api/llm.py natural-language search → structured filter route

The labels here MUST match the chip names rendered in
frontend/src/pages/Home.jsx (categories) so the same vocabulary works for
both the chip UI and the NL→structured translation.
"""

# 16 known purpose values from the satellites.purpose column.
PURPOSES = [
    "Communications",
    "Navigation",
    "Military/Reconnaissance",
    "Weather Monitoring",
    "Earth Observation",
    "Scientific Research",
    "Technology Demonstration",
    "Satellite Servicing & Logistics",
    "Deep Space Exploration",
    "Human Spaceflight",
    "Space Infrastructure",
    "Space Debris",
    "Rocket Body (Debris)",
    "Starlink Constellation",
    "OneWeb Constellation",
    "Iridium NEXT Constellation",
    "Unknown",
]

ORBIT_TYPES = ["LEO", "MEO", "GEO", "HEO"]

# Static label → SQL fragment lookup. Counterpart to
# satellites.py:get_filter_condition's filter_conditions dict.
STATIC_FILTERS = {
    # Orbital regions
    "LEO": "orbit_type = 'LEO'",
    "MEO": "orbit_type = 'MEO'",
    "GEO": "orbit_type = 'GEO'",
    "HEO": "orbit_type = 'HEO'",

    # Velocity
    "High Velocity": "velocity > 7.8",
    "Low Velocity": "velocity <= 7.8",

    # Orbital parameters
    "Perigee < 500 km": "perigee < 500",
    "Apogee > 35,000 km": "apogee > 35000",
    "Eccentricity > 0.1": "eccentricity > 0.1",
    "B* Drag Term > 0.0001": "bstar > 0.0001",

    # Purpose
    **{p: f"purpose = '{p}'" for p in PURPOSES},

    # Launch & decay
    "Recent Launches": "launch_date > NOW() - INTERVAL '30 days'",
    "Decaying": "(decay_date IS NOT NULL OR active_status = 'Inactive')",
    "Active Satellites": "(decay_date IS NULL AND object_type = 'PAYLOAD')",
}


def build_sql_from_structured(filt: dict) -> tuple[str, list]:
    """Convert a validated structured filter dict (output of nl_to_filters)
    into a parameterized WHERE clause + params list.

    Expected keys (all optional):
      orbit_type      : "LEO"|"MEO"|"GEO"|"HEO"
      purpose         : one of PURPOSES
      country         : free text (caller validates against DB before passing)
      launch_year_min : int (inclusive)
      launch_year_max : int (inclusive)
      perigee_min_km  : float
      perigee_max_km  : float
      apogee_min_km   : float
      apogee_max_km   : float
      eccentricity_min: float
      velocity_min    : float
      velocity_max    : float
      active_only     : bool — payloads with no decay date
      recent_launches : bool — last 30 days
      decaying        : bool — has decay date or marked inactive

    Returns ("col1 = %s AND col2 > %s", [val1, val2]). Empty filter → ("1=1", []).
    """
    parts: list[str] = []
    params: list = []

    if filt.get("orbit_type") in ORBIT_TYPES:
        parts.append("orbit_type = %s")
        params.append(filt["orbit_type"])

    if filt.get("purpose") in PURPOSES:
        parts.append("purpose = %s")
        params.append(filt["purpose"])

    if filt.get("country"):
        parts.append("country = %s")
        params.append(filt["country"])

    if filt.get("launch_year_min") is not None:
        parts.append("EXTRACT(YEAR FROM launch_date) >= %s")
        params.append(int(filt["launch_year_min"]))

    if filt.get("launch_year_max") is not None:
        parts.append("EXTRACT(YEAR FROM launch_date) <= %s")
        params.append(int(filt["launch_year_max"]))

    for col, key in (
        ("perigee", "perigee_min_km"),
        ("apogee", "apogee_min_km"),
        ("velocity", "velocity_min"),
    ):
        if filt.get(key) is not None:
            parts.append(f"{col} >= %s")
            params.append(float(filt[key]))

    for col, key in (
        ("perigee", "perigee_max_km"),
        ("apogee", "apogee_max_km"),
        ("velocity", "velocity_max"),
    ):
        if filt.get(key) is not None:
            parts.append(f"{col} <= %s")
            params.append(float(filt[key]))

    if filt.get("eccentricity_min") is not None:
        parts.append("eccentricity >= %s")
        params.append(float(filt["eccentricity_min"]))

    if filt.get("active_only"):
        parts.append("decay_date IS NULL AND object_type = 'PAYLOAD'")

    if filt.get("recent_launches"):
        parts.append("launch_date > NOW() - INTERVAL '30 days'")

    if filt.get("decaying"):
        parts.append("(decay_date IS NOT NULL OR active_status = 'Inactive')")

    if not parts:
        return "1=1", []
    return " AND ".join(parts), params
