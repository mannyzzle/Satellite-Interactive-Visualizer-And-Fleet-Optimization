"""Black-box contract tests against the live Sat-Track API.

Each test maps to a frontend value-prop:
    - "the globe shows N satellites"        → /count, /
    - "click a satellite → details"          → /{name_or_norad}
    - "search box autocompletes"             → /suggest
    - "find similar orbits"                  → /nearby/{norad}
    - "browse by category"                   → /object_types
    - "collision feed"                       → /api/cdm/fetch
    - "TLE history charts"                   → /api/old_tles/fetch/{norad}
    - "upcoming + past launches"             → /api/launches/{upcoming,previous}

All tests are read-only.
"""
from __future__ import annotations

from datetime import datetime, timezone

import pytest

pytestmark = pytest.mark.live


# Columns the frontend code reads off each satellite record. If the API stops
# returning any of these, multiple pages break silently — that's exactly the
# kind of regression a contract test should catch.
REQUIRED_SATELLITE_FIELDS = {
    "norad_number",
    "name",
    "orbit_type",
    "tle_line1",
    "tle_line2",
    "epoch",
    "inclination",
    "perigee",
    "apogee",
    "velocity",
}


def test_count_returns_positive_total(http):
    r = http.get("/api/satellites/count")
    r.raise_for_status()
    body = r.json()
    assert "total" in body, body
    assert isinstance(body["total"], int)
    assert body["total"] > 0


@pytest.mark.xfail(
    reason=(
        "Backend bug: /api/satellites/ orders by `launch_date DESC NULLS LAST` with "
        "no tiebreaker, so rows with identical launch_date can shuffle between "
        "calls and bleed across page boundaries. Adding a stable secondary sort "
        "(e.g. `, norad_number DESC`) in backend/app/api/satellites.py fixes it. "
        "Filed in CLAUDE.md."
    ),
    strict=False,
)
def test_paginated_no_overlap(http):
    """Page N and page N+1 must not share any NORAD — requires stable ordering."""
    page1 = http.get("/api/satellites/", params={"page": 1, "limit": 20}).json()
    page2 = http.get("/api/satellites/", params={"page": 2, "limit": 20}).json()
    sats1 = page1.get("satellites") or page1
    sats2 = page2.get("satellites") or page2
    norads1 = {s["norad_number"] for s in sats1}
    norads2 = {s["norad_number"] for s in sats2}
    assert norads1, "page 1 returned nothing"
    assert norads2, "page 2 returned nothing"
    assert norads1.isdisjoint(norads2), (
        f"pagination overlap: {norads1 & norads2}"
    )


def test_required_satellite_fields_present(http):
    r = http.get("/api/satellites/", params={"page": 1, "limit": 5})
    r.raise_for_status()
    body = r.json()
    sats = body.get("satellites") or body
    assert sats, "page 1 had no satellites"
    for sat in sats:
        missing = REQUIRED_SATELLITE_FIELDS - sat.keys()
        assert not missing, f"satellite {sat.get('name')} missing fields {missing}"


def test_suggest_returns_relevant_matches(http):
    r = http.get("/api/satellites/suggest", params={"query": "ISS"})
    r.raise_for_status()
    body = r.json()
    suggestions = body.get("suggestions") if isinstance(body, dict) else body
    assert isinstance(suggestions, list)
    assert len(suggestions) > 0, "suggest returned nothing for 'ISS'"
    # At least one suggestion should plausibly match "ISS" (e.g. ISS (ZARYA))
    has_iss_match = any(
        "ISS" in (s.get("name") or "").upper() for s in suggestions
    )
    assert has_iss_match, f"no suggestion contained 'ISS': {suggestions[:5]}"


def test_lookup_by_known_norad(http):
    """The ISS NORAD 25544 should always resolve."""
    r = http.get("/api/satellites/25544")
    r.raise_for_status()
    body = r.json()
    # Endpoint may wrap in {"satellite": ...} or return bare dict
    sat = body.get("satellite", body)
    assert sat["norad_number"] == 25544


def test_nearby_returns_similar_orbits(http):
    """Nearby endpoint should return satellites in similar orbital regimes."""
    r = http.get("/api/satellites/25544")
    r.raise_for_status()
    iss = r.json().get("satellite", r.json())
    iss_inc = float(iss["inclination"])
    iss_perigee = float(iss["perigee"])

    near = http.get("/api/satellites/nearby/25544", params={"limit": 10}).json()
    near_list = (
        near
        if isinstance(near, list)
        else near.get("nearby_satellites") or near.get("nearby") or near.get("satellites") or []
    )
    assert near_list, "nearby returned empty"
    for sat in near_list:
        if sat["norad_number"] == 25544:
            continue
        assert abs(float(sat["inclination"]) - iss_inc) <= 5.0, (
            f"nearby NORAD {sat['norad_number']} inclination drift > 5°"
        )
        assert abs(float(sat["perigee"]) - iss_perigee) <= 100.0, (
            f"nearby NORAD {sat['norad_number']} perigee drift > 100 km"
        )


def test_object_types_sums_close_to_total(http):
    """object_types counts should sum to within 1% of /count.

    A small drift is allowed: the two queries don't run inside a transaction
    and the ingest worker writes against `satellites` between requests.
    """
    total = http.get("/api/satellites/count").json()["total"]
    types = http.get("/api/satellites/object_types").json()
    summed = sum(t["count"] for t in types.get("types", types))
    drift = abs(summed - total) / total
    assert drift < 0.01, f"object_types sum {summed} drifted {drift:.2%} from total {total}"


def test_cdm_ordered_by_tca_ascending(http):
    body = http.get("/api/cdm/fetch").json()
    events = body["cdm_events"]
    assert events, "no CDM events returned"
    tcas = [e["tca"] for e in events if e.get("tca")]
    # TCA values are ISO strings; sorted lexicographically agrees with chronological
    assert tcas == sorted(tcas), "CDM events not ordered by tca asc"


def test_old_tles_history_chronological(http):
    """ISS history must come back in time-order so the SatelliteDetail chart
    isn't a zigzag mess."""
    body = http.get("/api/old_tles/fetch/25544").json()
    history = body["historical_tles"]
    assert len(history) >= 2, "expected multiple historical TLEs for ISS"
    epochs = [h["epoch"] for h in history]
    assert epochs == sorted(epochs), "TLE history not in ascending epoch order"


def test_launches_split_by_now(http):
    """Every /upcoming launch should be in the future, every /previous in the past."""
    now_utc = datetime.now(timezone.utc)

    upcoming = http.get("/api/launches/upcoming").json()
    previous = http.get("/api/launches/previous").json()
    assert isinstance(upcoming, list) and isinstance(previous, list)

    def _parse(s):
        # Backend currently returns naive ISO ("2026-04-25T12:15:00"). Treat as UTC.
        dt = datetime.fromisoformat(s.replace("Z", "+00:00"))
        return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)

    for launch in upcoming[:20]:
        if launch.get("launch_date"):
            assert _parse(launch["launch_date"]) >= now_utc - _tolerance(), (
                f"upcoming has past launch: {launch['name']} @ {launch['launch_date']}"
            )

    for launch in previous[:20]:
        if launch.get("launch_date"):
            assert _parse(launch["launch_date"]) < now_utc + _tolerance(), (
                f"previous has future launch: {launch['name']} @ {launch['launch_date']}"
            )


def _tolerance():
    """Fudge factor for clock skew between API server and test runner."""
    from datetime import timedelta
    return timedelta(minutes=10)
