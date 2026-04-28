"""Unit tests for the maneuver detector.

Synthesizes orbital snapshots directly (skipping TLE parsing) so we can
test the detection + grouping logic deterministically without depending
on real TLE math.
"""
from datetime import datetime, timedelta, timezone

import pytest

from app.services.maneuver_detector import (
    ManeuverEvent,
    OrbitalSnapshot,
    _group_within_window,
    detect_events,
    parse_tle,
)


def _snap(t: datetime, peri=400, apo=410, inc=51.6, sma=6800):
    return OrbitalSnapshot(
        epoch=t,
        perigee_km=peri,
        apogee_km=apo,
        inclination_deg=inc,
        semi_major_axis_km=sma,
        mean_motion_rev_per_day=15.5,
    )


def test_no_events_for_stable_orbit():
    t0 = datetime(2026, 4, 1, tzinfo=timezone.utc)
    snaps = [_snap(t0 + timedelta(days=i)) for i in range(10)]
    assert detect_events(snaps) == []


def test_orbit_raise_detected():
    t0 = datetime(2026, 4, 1, tzinfo=timezone.utc)
    snaps = [
        _snap(t0, peri=400, apo=410, sma=6800),
        _snap(t0 + timedelta(days=2), peri=410, apo=420, sma=6810),
    ]
    events = detect_events(snaps)
    assert len(events) == 1
    assert events[0].classification == "orbit raise"
    assert events[0].delta_perigee_km == pytest.approx(10.0)
    assert events[0].delta_apogee_km == pytest.approx(10.0)


def test_inclination_change_dominates_classification():
    t0 = datetime(2026, 4, 1, tzinfo=timezone.utc)
    snaps = [
        _snap(t0, inc=51.6),
        _snap(t0 + timedelta(days=1), peri=405, apo=415, inc=51.8, sma=6810),
    ]
    events = detect_events(snaps)
    assert len(events) == 1
    assert events[0].classification == "inclination change"


def test_below_threshold_ignored():
    t0 = datetime(2026, 4, 1, tzinfo=timezone.utc)
    snaps = [
        _snap(t0, peri=400, apo=410),
        _snap(t0 + timedelta(days=1), peri=403, apo=413),  # +3 km, under 5km
    ]
    assert detect_events(snaps) == []


def test_grouping_merges_close_burns():
    t0 = datetime(2026, 4, 1, tzinfo=timezone.utc)
    # Three TLE updates spanning a 4-hour window with cumulative orbit raise
    snaps = [
        _snap(t0, peri=400, apo=410, sma=6800),
        _snap(t0 + timedelta(hours=2), peri=406, apo=416, sma=6806),
        _snap(t0 + timedelta(hours=4), peri=412, apo=422, sma=6812),
    ]
    events = detect_events(snaps)
    # Both consecutive transitions cross threshold individually (6 km),
    # but they should merge into a single event because the second is
    # within 6h of the first's end.
    assert len(events) == 1
    assert events[0].delta_perigee_km == pytest.approx(12.0)
    assert events[0].start == t0
    assert events[0].end == t0 + timedelta(hours=4)


def test_grouping_keeps_far_apart_events_separate():
    t0 = datetime(2026, 4, 1, tzinfo=timezone.utc)
    # Two distinct burns separated by a long stable period. The gap
    # between the first event's END and the second event's START must
    # exceed the 6h grouping window.
    snaps = [
        _snap(t0, peri=400, apo=410, sma=6800),
        _snap(t0 + timedelta(hours=2), peri=410, apo=420, sma=6810),
        # Stable for the next 15h — no transitions
        _snap(t0 + timedelta(hours=12), peri=410, apo=420, sma=6810),
        _snap(t0 + timedelta(hours=18), peri=410, apo=420, sma=6810),
        # Second burn
        _snap(t0 + timedelta(hours=24), peri=420, apo=430, sma=6820),
    ]
    events = detect_events(snaps)
    assert len(events) == 2


def test_parse_tle_handles_real_iss():
    # An ISS TLE — sanity check that perigee and apogee land in expected band.
    line1 = "1 25544U 98067A   24015.50000000  .00016717  00000-0  10270-3 0  9999"
    line2 = "2 25544  51.6400 247.4627 0006703 130.5360 325.0288 15.50000000 12345"
    snap = parse_tle(line1, line2)
    assert 350 < snap.perigee_km < 450  # ISS hovers ~400km
    assert 350 < snap.apogee_km < 450
    assert 51.0 < snap.inclination_deg < 52.0
    assert 6700 < snap.semi_major_axis_km < 6900
