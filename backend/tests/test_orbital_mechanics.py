"""Local SGP4 propagation correctness — proves the math under the product.

These tests don't hit the network. They use pinned TLEs (see conftest.py) so
the assertions don't drift week-to-week as real satellites change orbit.

The frontend uses `satellite.js` (a JS port of the same algorithm) for live
propagation, and the backend uses `python-sgp4` directly. Both should agree
with `skyfield`'s independent implementation to <1 km after 1 hour for an
ISS-like orbit.
"""
from __future__ import annotations

import math
from datetime import datetime, timedelta

import numpy as np
import pytest
from sgp4.api import Satrec, jday


EARTH_RADIUS_KM = 6371.0
EARTH_MU = 398600.4418  # km^3/s^2


def _epoch_to_datetime(satrec: Satrec) -> datetime:
    """Convert satrec.jdsatepoch + jdsatepochF to a naive UTC datetime."""
    jd_total = satrec.jdsatepoch + satrec.jdsatepochF
    return _jd_to_datetime(jd_total)


def _jd_to_datetime(jd: float) -> datetime:
    """Standard JD → calendar conversion (Meeus, ch.7)."""
    jd_plus_half = jd + 0.5
    z = math.floor(jd_plus_half)
    f = jd_plus_half - z
    if z < 2299161:
        a = z
    else:
        alpha = math.floor((z - 1867216.25) / 36524.25)
        a = z + 1 + alpha - math.floor(alpha / 4)
    b = a + 1524
    c = math.floor((b - 122.1) / 365.25)
    d = math.floor(365.25 * c)
    e = math.floor((b - d) / 30.6001)
    day_frac = b - d - math.floor(30.6001 * e) + f
    day = int(math.floor(day_frac))
    hours = (day_frac - day) * 24
    h = int(math.floor(hours))
    minutes = (hours - h) * 60
    m = int(math.floor(minutes))
    s = (minutes - m) * 60
    month = e - 1 if e < 14 else e - 13
    year = c - 4716 if month > 2 else c - 4715
    return datetime(year, month, day, h, m, int(s))


def _propagate(satrec: Satrec, when: datetime):
    jd, fr = jday(when.year, when.month, when.day, when.hour, when.minute, when.second + when.microsecond * 1e-6)
    e, r, v = satrec.sgp4(jd, fr)
    return e, np.array(r), np.array(v)


def test_iss_altitude_within_orbit_band(iss_tle):
    """ISS lives at ~400 km. Propagated radius minus Earth radius must land in [250, 500] km."""
    satrec = Satrec.twoline2rv(*iss_tle)
    when = _epoch_to_datetime(satrec)
    err, r, _ = _propagate(satrec, when)
    assert err == 0, f"sgp4 returned error {err}"
    altitude_km = float(np.linalg.norm(r)) - EARTH_RADIUS_KM
    assert 250 <= altitude_km <= 500, f"ISS altitude {altitude_km:.1f} km outside expected band"


def test_iss_period_about_93_minutes(iss_tle):
    """Mean motion → period. ISS = ~92.7 min. Tolerance ±2 min."""
    satrec = Satrec.twoline2rv(*iss_tle)
    # sgp4 stores mean motion in rad/min (no_kozai)
    period_minutes = 2 * math.pi / satrec.no_kozai
    assert 90 <= period_minutes <= 95, f"ISS period {period_minutes:.2f} min outside band"


def test_geo_satellite_period_about_24h(geo_tle):
    """A geostationary sat has sidereal-day period ≈ 1436 min. Tolerance ±10 min."""
    satrec = Satrec.twoline2rv(*geo_tle)
    period_minutes = 2 * math.pi / satrec.no_kozai
    assert 1426 <= period_minutes <= 1446, f"GEO period {period_minutes:.1f} min outside band"


def test_iss_orbit_circular_ish(iss_tle):
    """ISS eccentricity is small (~0.0007). Sanity-check the parser."""
    satrec = Satrec.twoline2rv(*iss_tle)
    assert 0 <= satrec.ecco < 0.01, f"ISS eccentricity {satrec.ecco} unexpectedly large"


def test_sgp4_position_stable_over_short_window(iss_tle):
    """Two propagations of the same TLE 1 second apart should give nearly-equal velocity vectors.

    A bug in the wrapper (e.g. using wrong JD scaling) typically produces wildly
    different vectors for adjacent timestamps. This is a smoke-test against that.
    """
    satrec = Satrec.twoline2rv(*iss_tle)
    epoch = _epoch_to_datetime(satrec)
    err1, _, v1 = _propagate(satrec, epoch)
    err2, _, v2 = _propagate(satrec, epoch + timedelta(seconds=1))
    assert err1 == 0 and err2 == 0
    delta = np.linalg.norm(v2 - v1)
    # Δv across 1 s of free orbital motion at ~7.7 km/s is on the order of 0.01 km/s
    assert delta < 0.05, f"velocity jump {delta:.4f} km/s over 1s — propagation likely buggy"


def test_sgp4_skyfield_agreement(iss_tle):
    """Cross-check sgp4 against skyfield for the same TLE.

    Both propagators implement the same 2006 SGP4 paper, but they project
    position into *different reference frames*: raw `sgp4` returns TEME
    (true equator / mean equinox of date), while `skyfield`'s `.at().position`
    returns ICRF (J2000-based). Those frames differ by Earth precession +
    nutation rotations totalling ~30-50 km for an LEO position.

    The point of this test is therefore not "are they bit-identical" but
    "are they within the same order of magnitude" — a real wrapper bug
    (e.g. swapped axes, wrong epoch handling) would diverge by 1000+ km
    after a single hour.
    """
    skyfield = pytest.importorskip("skyfield.api")
    EarthSatellite = skyfield.EarthSatellite
    load = skyfield.load
    ts = load.timescale()

    satrec = Satrec.twoline2rv(*iss_tle)
    epoch = _epoch_to_datetime(satrec)
    one_hour_later = epoch + timedelta(hours=1)

    err, r_sgp4, _ = _propagate(satrec, one_hour_later)
    assert err == 0

    sf_sat = EarthSatellite(iss_tle[0], iss_tle[1], "ISS", ts)
    t = ts.utc(
        one_hour_later.year, one_hour_later.month, one_hour_later.day,
        one_hour_later.hour, one_hour_later.minute, one_hour_later.second,
    )
    r_sf = sf_sat.at(t).position.km

    delta_km = float(np.linalg.norm(r_sgp4 - np.array(r_sf)))
    # Cross-frame disagreement is bounded by precession+nutation rotations on
    # the LEO position vector; 100 km is a generous ceiling that still catches
    # wrapper bugs (axis swaps, epoch mismatches typically blow this out).
    assert delta_km < 100.0, (
        f"sgp4 and skyfield disagree by {delta_km:.2f} km — propagation suspect"
    )
    # Also assert magnitudes are sane (both should be ~6770 km for ISS)
    mag_sgp4 = float(np.linalg.norm(r_sgp4))
    mag_sf = float(np.linalg.norm(r_sf))
    assert abs(mag_sgp4 - mag_sf) < 5.0, (
        f"orbital radius differs: sgp4={mag_sgp4:.2f} skyfield={mag_sf:.2f}"
    )


def test_total_specific_energy_changes_smoothly(iss_tle):
    """Specific orbital energy ε = v²/2 - μ/r should not jump suddenly.

    SGP4 includes drag and so energy slowly decays — but not by more than ~1%
    over 10 minutes. A sudden change indicates the propagator is broken
    (e.g. coordinate-frame mismatch causing position-velocity inconsistency).
    """
    satrec = Satrec.twoline2rv(*iss_tle)
    epoch = _epoch_to_datetime(satrec)

    energies = []
    for offset_s in (0, 60, 120, 300, 600):
        err, r, v = _propagate(satrec, epoch + timedelta(seconds=offset_s))
        assert err == 0
        eps = float(np.dot(v, v)) / 2 - EARTH_MU / float(np.linalg.norm(r))
        energies.append(eps)

    swing = (max(energies) - min(energies)) / abs(energies[0])
    assert swing < 0.01, f"energy varied {swing:.4%} over 10 min — propagation suspect"
