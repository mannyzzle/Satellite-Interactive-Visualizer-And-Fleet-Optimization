"""Detect significant orbital events from a satellite's TLE history.

Pure deterministic logic — no LLM cost. Consumed by the
/api/llm/satellite/{norad}/timeline route, which adds an AI narrative.

Approach:
  1. Parse each (tle_line1, tle_line2) into mean orbital elements via sgp4.
  2. Compute perigee, apogee, inclination, semi-major-axis per epoch.
  3. Walk consecutive epochs; flag a candidate event when any delta crosses
     a threshold tuned to be larger than SGP4 numerical jitter for normal
     non-maneuvering objects.
  4. Group candidates within a 6-hour window — a single burn often shows
     up across multiple TLE refreshes — into one summary event.

Thresholds picked empirically against the ISS (which station-keeps every
few weeks at ~3-5 km altitude) and a handful of inactive payloads (which
show <1 km drift week-over-week from drag alone).
"""
from __future__ import annotations

import math
from dataclasses import dataclass, asdict
from datetime import datetime, timedelta, timezone
from typing import Iterable

from sgp4.api import Satrec

EARTH_RADIUS_KM = 6378.135
GROUP_WINDOW_SECONDS = 6 * 3600

# Detection thresholds (km / degrees). See module docstring for rationale.
PERIGEE_DELTA_KM = 5.0
APOGEE_DELTA_KM = 5.0
INCLINATION_DELTA_DEG = 0.05
SEMI_MAJOR_DELTA_KM = 2.0


@dataclass
class OrbitalSnapshot:
    epoch: datetime
    perigee_km: float
    apogee_km: float
    inclination_deg: float
    semi_major_axis_km: float
    mean_motion_rev_per_day: float

    def to_dict(self) -> dict:
        d = asdict(self)
        d["epoch"] = self.epoch.isoformat()
        return d


@dataclass
class ManeuverEvent:
    """A grouped change in orbital state between two snapshot windows."""
    start: datetime  # epoch of the snapshot before the change
    end: datetime    # epoch of the snapshot after the change settled
    delta_perigee_km: float
    delta_apogee_km: float
    delta_inclination_deg: float
    delta_semi_major_km: float
    snapshot_before: OrbitalSnapshot
    snapshot_after: OrbitalSnapshot
    classification: str  # human-readable, e.g. "perigee raise"

    def to_dict(self) -> dict:
        return {
            "start": self.start.isoformat(),
            "end": self.end.isoformat(),
            "delta_perigee_km": round(self.delta_perigee_km, 2),
            "delta_apogee_km": round(self.delta_apogee_km, 2),
            "delta_inclination_deg": round(self.delta_inclination_deg, 4),
            "delta_semi_major_km": round(self.delta_semi_major_km, 2),
            "classification": self.classification,
            "before": self.snapshot_before.to_dict(),
            "after": self.snapshot_after.to_dict(),
        }


def parse_tle(tle1: str, tle2: str, epoch_hint: datetime | None = None) -> OrbitalSnapshot:
    """Decode a single TLE pair into an OrbitalSnapshot.

    The `epoch_hint` is the inserted_at timestamp from the DB row; when
    provided we still trust the in-TLE epoch for ordering, but we keep
    epoch_hint as the fallback for malformed lines.
    """
    sat = Satrec.twoline2rv(tle1, tle2)

    # sgp4 stores epoch as Julian-day pieces; reconstruct UTC datetime
    jd = sat.jdsatepoch + sat.jdsatepochF
    # Julian Day → datetime via the standard offset (JD 2440587.5 = epoch 1970-01-01)
    seconds_since_unix_epoch = (jd - 2440587.5) * 86400.0
    try:
        epoch = datetime.fromtimestamp(seconds_since_unix_epoch, tz=timezone.utc)
    except (OverflowError, OSError):
        epoch = epoch_hint or datetime.now(timezone.utc)

    a_km = sat.a * EARTH_RADIUS_KM  # sgp4 stores semi-major in earth radii
    e = sat.ecco
    perigee_km = a_km * (1 - e) - EARTH_RADIUS_KM
    apogee_km = a_km * (1 + e) - EARTH_RADIUS_KM
    inclination_deg = math.degrees(sat.inclo)
    mean_motion_rev_per_day = sat.no_kozai * 1440.0 / (2 * math.pi)  # rad/min → rev/day

    return OrbitalSnapshot(
        epoch=epoch,
        perigee_km=perigee_km,
        apogee_km=apogee_km,
        inclination_deg=inclination_deg,
        semi_major_axis_km=a_km,
        mean_motion_rev_per_day=mean_motion_rev_per_day,
    )


def _classify(d_peri: float, d_apo: float, d_inc: float) -> str:
    if abs(d_inc) >= INCLINATION_DELTA_DEG:
        return "inclination change"
    # Both raised → orbit raise; both lowered → orbit lower; mixed → shape change.
    if d_peri > 0 and d_apo > 0:
        return "orbit raise"
    if d_peri < 0 and d_apo < 0:
        return "orbit lower"
    if d_peri > 0 and d_apo <= 0:
        return "perigee raise"
    if d_peri <= 0 and d_apo > 0:
        return "apogee raise"
    if d_peri < 0 and d_apo >= 0:
        return "perigee lower"
    if d_peri >= 0 and d_apo < 0:
        return "apogee lower"
    return "trim maneuver"


def detect_events(snapshots: list[OrbitalSnapshot]) -> list[ManeuverEvent]:
    """Walk consecutive snapshots, flag big deltas, group within 6h windows."""
    if len(snapshots) < 2:
        return []

    snapshots = sorted(snapshots, key=lambda s: s.epoch)
    candidates: list[ManeuverEvent] = []

    for prev, curr in zip(snapshots, snapshots[1:]):
        d_peri = curr.perigee_km - prev.perigee_km
        d_apo = curr.apogee_km - prev.apogee_km
        d_inc = curr.inclination_deg - prev.inclination_deg
        d_sma = curr.semi_major_axis_km - prev.semi_major_axis_km

        if (
            abs(d_peri) >= PERIGEE_DELTA_KM
            or abs(d_apo) >= APOGEE_DELTA_KM
            or abs(d_inc) >= INCLINATION_DELTA_DEG
            or abs(d_sma) >= SEMI_MAJOR_DELTA_KM
        ):
            candidates.append(
                ManeuverEvent(
                    start=prev.epoch,
                    end=curr.epoch,
                    delta_perigee_km=d_peri,
                    delta_apogee_km=d_apo,
                    delta_inclination_deg=d_inc,
                    delta_semi_major_km=d_sma,
                    snapshot_before=prev,
                    snapshot_after=curr,
                    classification=_classify(d_peri, d_apo, d_inc),
                )
            )

    return _group_within_window(candidates)


def _group_within_window(events: list[ManeuverEvent]) -> list[ManeuverEvent]:
    """Merge events whose start is within GROUP_WINDOW_SECONDS of the previous
    event's end. Cumulative deltas are summed; before/after snapshots span
    the whole window."""
    if not events:
        return []

    grouped: list[ManeuverEvent] = []
    pending = events[0]

    for ev in events[1:]:
        gap = (ev.start - pending.end).total_seconds()
        if gap <= GROUP_WINDOW_SECONDS:
            pending = ManeuverEvent(
                start=pending.start,
                end=ev.end,
                delta_perigee_km=pending.delta_perigee_km + ev.delta_perigee_km,
                delta_apogee_km=pending.delta_apogee_km + ev.delta_apogee_km,
                delta_inclination_deg=pending.delta_inclination_deg + ev.delta_inclination_deg,
                delta_semi_major_km=pending.delta_semi_major_km + ev.delta_semi_major_km,
                snapshot_before=pending.snapshot_before,
                snapshot_after=ev.snapshot_after,
                classification=_classify(
                    pending.delta_perigee_km + ev.delta_perigee_km,
                    pending.delta_apogee_km + ev.delta_apogee_km,
                    pending.delta_inclination_deg + ev.delta_inclination_deg,
                ),
            )
        else:
            grouped.append(pending)
            pending = ev

    grouped.append(pending)
    return grouped


def parse_tle_history(rows: Iterable[dict]) -> list[OrbitalSnapshot]:
    """Convert DB rows from satellite_tle_history into snapshots, skipping any
    that fail to parse (malformed TLEs do appear in the wild)."""
    out: list[OrbitalSnapshot] = []
    for r in rows:
        try:
            snap = parse_tle(r["tle_line1"], r["tle_line2"], epoch_hint=r.get("inserted_at"))
            out.append(snap)
        except Exception:
            continue
    return out
