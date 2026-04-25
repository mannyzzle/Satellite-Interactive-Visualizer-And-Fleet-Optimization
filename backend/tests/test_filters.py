"""Behavioral tests for the /api/satellites/?filter= query parameter.

The filter param is a comma-separated list of preset keys defined in
backend/app/api/satellites.py::get_filter_condition. We assert that the
preset's *intent* matches the rows we get back. If the SQL ever drifts from
the label, these tests catch it.
"""
from __future__ import annotations

import pytest

pytestmark = pytest.mark.live


def _sats(http, **params):
    body = http.get("/api/satellites/", params=params).json()
    return body.get("satellites") or body


def test_filter_leo_returns_only_leo(http):
    rows = _sats(http, page=1, limit=50, filter="LEO")
    assert rows, "LEO filter returned no results"
    for sat in rows:
        assert sat["orbit_type"] == "LEO", (
            f"LEO filter leaked {sat['orbit_type']} row {sat['name']}"
        )


def test_filter_geo_returns_only_geo(http):
    rows = _sats(http, page=1, limit=50, filter="GEO")
    assert rows, "GEO filter returned no results"
    for sat in rows:
        assert sat["orbit_type"] == "GEO", (
            f"GEO filter leaked {sat['orbit_type']} row {sat['name']}"
        )


@pytest.mark.xfail(
    reason=(
        "Backend bug discovered by this test: get_filter_condition() in "
        "backend/app/api/satellites.py does `filter.split(',')`, which splits "
        "the filter label 'Apogee > 35,000 km' on its embedded comma into "
        "['Apogee > 35', '000 km']. Neither token matches a known preset, so "
        "no SQL filter is applied and the route returns ALL satellites. The "
        "fix is to either rename the preset (no comma) or split on a different "
        "delimiter. Filed in CLAUDE.md."
    ),
    strict=False,
)
def test_filter_apogee_above_35000(http):
    """Filter label "Apogee > 35,000 km" must enforce that bound exactly."""
    rows = _sats(http, page=1, limit=50, filter="Apogee > 35,000 km")
    assert rows, "Apogee>35k filter returned no results"
    for sat in rows:
        apogee = float(sat["apogee"])
        assert apogee > 35000, f"row apogee {apogee} fails Apogee > 35,000 km filter"


def test_filter_perigee_under_500(http):
    rows = _sats(http, page=1, limit=50, filter="Perigee < 500 km")
    assert rows, "Perigee<500 filter returned no results"
    for sat in rows:
        perigee = float(sat["perigee"])
        assert perigee < 500, f"row perigee {perigee} fails Perigee < 500 km filter"


def test_filter_starlink_constellation(http):
    rows = _sats(http, page=1, limit=50, filter="Starlink Constellation")
    assert rows, "Starlink filter returned no results"
    # The DB classifier may bucket variants; at minimum the purpose should match
    for sat in rows:
        assert sat["purpose"] == "Starlink Constellation", (
            f"Starlink filter leaked purpose {sat['purpose']} row {sat['name']}"
        )


def test_filter_combined_csv(http):
    """`LEO,Communications` should AND the conditions: LEO AND purpose=Communications."""
    rows = _sats(http, page=1, limit=50, filter="LEO,Communications")
    assert rows, "LEO + Communications combined filter returned no results"
    for sat in rows:
        assert sat["orbit_type"] == "LEO", f"combined filter leaked {sat['orbit_type']}"
        assert sat["purpose"] == "Communications", (
            f"combined filter leaked purpose {sat['purpose']}"
        )


def test_filter_unknown_token_does_not_crash(http):
    """A typo in a filter token should NOT 500. The endpoint just ignores it."""
    r = http.get("/api/satellites/", params={"page": 1, "limit": 5, "filter": "TotallyMadeUp"})
    assert r.status_code == 200, f"unknown filter token returned {r.status_code}"
