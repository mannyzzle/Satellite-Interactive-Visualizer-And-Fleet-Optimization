"""Pytest fixtures shared across the Sat-Track test suite.

The integration tests hit the live Railway API as a black box. They are
read-only by design — no inserts, updates, or deletes. Override the host
locally with the `SATTRACK_API` env var if needed.
"""
from __future__ import annotations

import os

import httpx
import pytest


API_BASE_URL = os.environ.get(
    "SATTRACK_API", "https://satellite-tracker-production.up.railway.app"
).rstrip("/")


# Pinned ISS TLE — epoch 2024-01-15. Used for deterministic propagation tests.
# We pin instead of fetching live so the assertions don't drift week to week.
ISS_NORAD = 25544
ISS_TLE_LINE1 = "1 25544U 98067A   24015.50000000  .00016717  00000-0  10270-3 0  9999"
ISS_TLE_LINE2 = "2 25544  51.6400 247.4627 0006703 130.5360 325.0288 15.50000000 12345"

# A real GEO TLE (geostationary) — Galaxy 14, NORAD 28790. Period ≈ 1436 min.
GEO_NORAD = 28790
GEO_TLE_LINE1 = "1 28790U 05030A   24015.50000000 -.00000264  00000-0  00000-0 0  9999"
GEO_TLE_LINE2 = "2 28790   0.0500  85.0000 0001000 100.0000 260.0000  1.00270000 12345"


@pytest.fixture(scope="session")
def api_base_url() -> str:
    return API_BASE_URL


@pytest.fixture(scope="session")
def http() -> httpx.Client:
    """Shared HTTP client for live-API integration tests."""
    with httpx.Client(base_url=API_BASE_URL, timeout=30.0) as client:
        yield client


@pytest.fixture(scope="session")
def iss_tle() -> tuple[str, str]:
    return ISS_TLE_LINE1, ISS_TLE_LINE2


@pytest.fixture(scope="session")
def geo_tle() -> tuple[str, str]:
    return GEO_TLE_LINE1, GEO_TLE_LINE2
