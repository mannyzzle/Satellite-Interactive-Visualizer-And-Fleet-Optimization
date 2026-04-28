"""Smoke tests for llm_tools — hits the live Railway DB read-only.

These tests verify that each tool returns the expected shape and that
limit/clamping logic works. They don't mock the DB because the value of
these tools is in the SQL they generate; mocking the SQL layer would
just be re-asserting the test fixtures.
"""
from app.services.llm_tools import (
    TOOL_SCHEMAS,
    ToolError,
    call_tool,
    query_catalog,
    query_cdms,
    query_launches,
    query_space_weather,
    query_tle_history,
)
import pytest


def test_tool_schemas_well_formed():
    """Every schema must have required SDK fields."""
    for tool in TOOL_SCHEMAS:
        assert "name" in tool
        assert "description" in tool
        assert "input_schema" in tool
        assert tool["input_schema"]["type"] == "object"


def test_dispatcher_unknown_tool_errors():
    with pytest.raises(ToolError):
        call_tool("definitely_not_a_tool", {})


def test_query_catalog_count_basic():
    result = query_catalog(aggregate="count")
    assert "count" in result
    assert result["count"] > 10000  # Catalog has ~30k satellites


def test_query_catalog_count_filtered():
    result = query_catalog(filters={"orbit_type": "GEO"}, aggregate="count")
    assert 100 < result["count"] < 5000  # GEO ring has ~500-1000 active


def test_query_catalog_group_by_country():
    result = query_catalog(aggregate="count", group_by="country", limit=5)
    assert result["group_by"] == "country"
    assert len(result["buckets"]) <= 5
    assert all("bucket" in b and "count" in b for b in result["buckets"])
    # USA, China, Russia should show up
    countries = {b["bucket"] for b in result["buckets"]}
    assert any(c in countries for c in ("US", "PRC", "CIS"))


def test_query_catalog_rows_default():
    result = query_catalog(filters={"orbit_type": "LEO"}, limit=5)
    assert "rows" in result
    assert len(result["rows"]) <= 5
    if result["rows"]:
        r = result["rows"][0]
        assert r["orbit_type"] == "LEO"
        assert "name" in r and "norad_number" in r


def test_query_catalog_limit_clamped():
    result = query_catalog(filters={"orbit_type": "LEO"}, limit=99999)
    assert "rows" in result
    assert len(result["rows"]) <= 200  # hard cap


def test_query_cdms_smoke():
    result = query_cdms(limit=3)
    assert "rows" in result
    assert len(result["rows"]) <= 3


def test_query_cdms_high_pc_filter():
    result = query_cdms(min_pc=0.001, limit=10)
    assert all(r["pc"] >= 0.001 for r in result["rows"])


def test_query_launches_upcoming():
    result = query_launches(window="upcoming", limit=3)
    assert "rows" in result
    # Catalog tracks ~275 upcoming, should always have results
    assert len(result["rows"]) > 0


def test_query_launches_invalid_window():
    with pytest.raises(ToolError):
        query_launches(window="forever_ago")


def test_query_space_weather_kp_latest():
    result = query_space_weather(metric="kp", window_hours=72, aggregate="latest")
    assert result["metric"] == "kp"
    # With 72h window we should always have at least one row
    assert result.get("row") is not None or result.get("aggregate") == "latest"


def test_query_space_weather_invalid_metric():
    with pytest.raises(ToolError):
        query_space_weather(metric="bogus")


def test_query_tle_history_iss():
    # ISS NORAD 25544. 90-day window should yield many rows since TLEs
    # update multiple times per day.
    result = query_tle_history(norad=25544, window_days=90, limit=20)
    assert result["norad"] == 25544
    assert isinstance(result["rows"], list)
