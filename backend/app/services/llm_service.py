"""Anthropic-backed LLM helpers for Sat-Track.

Two narrow features:
  - nl_to_filters(query): Feature A. Tool use → structured filter dict.
  - cdm_briefing(event, sat1, sat2): Feature B. Plain-text 3-sentence briefing.

Cost guards (public no-auth site, treat traffic as adversarial):
  - DB-backed response cache (llm_cache table)
  - In-memory per-IP token bucket
  - Postgres daily org-wide spend ceiling
  - max_tokens hard cap on every call

Reads ANTHROPIC_API_KEY from env (.env locally, Railway secret in prod).
"""

from __future__ import annotations

import hashlib
import json
import os
import threading
import time
from datetime import datetime, timedelta, timezone
from typing import Any

from dotenv import load_dotenv

try:
    from database import get_db_connection
except ImportError:  # local execution fallback (matches pattern in api/satellites.py)
    from app.database import get_db_connection

try:
    from services.filter_schema import ORBIT_TYPES, PURPOSES
except ImportError:
    from app.services.filter_schema import ORBIT_TYPES, PURPOSES

load_dotenv()

MODEL = "claude-haiku-4-5-20251001"
MAX_TOKENS_FILTER = 400
MAX_TOKENS_BRIEFING = 350
MAX_TOKENS_ANALYST = 800
MAX_TOKENS_TIMELINE = 600
ASK_MAX_TOOL_ITERATIONS = 4

# Cost guard knobs — tune via env var if traffic spikes.
RATE_LIMIT_PER_MINUTE = int(os.getenv("LLM_RATE_LIMIT_PER_MINUTE", "10"))
RATE_LIMIT_PER_DAY = int(os.getenv("LLM_RATE_LIMIT_PER_DAY", "100"))
DAILY_REQUEST_CAP = int(os.getenv("LLM_DAILY_REQUEST_CAP", "5000"))
DAILY_OUTPUT_TOKEN_CAP = int(os.getenv("LLM_DAILY_OUTPUT_TOKEN_CAP", "500000"))


class LLMError(Exception):
    """Surfaced to the route layer; route maps to HTTP 4xx/5xx."""

    def __init__(self, message: str, status: int = 500):
        super().__init__(message)
        self.status = status


# ---------------------------------------------------------------------------
# Anthropic client (lazy — avoids import-time crash if key missing in tests)
# ---------------------------------------------------------------------------
_client = None
_client_lock = threading.Lock()


def _get_client():
    global _client
    if _client is not None:
        return _client
    with _client_lock:
        if _client is not None:
            return _client
        api_key = os.getenv("ANTHROPIC_API_KEY")
        if not api_key:
            raise LLMError("ANTHROPIC_API_KEY not configured", status=503)
        from anthropic import Anthropic  # noqa: WPS433 — lazy import is intentional

        _client = Anthropic(api_key=api_key)
        return _client


# ---------------------------------------------------------------------------
# Per-IP rate limiter (in-memory, single-process). Sliding window per bucket.
# ---------------------------------------------------------------------------
_rl_lock = threading.Lock()
_rl_state: dict[str, dict[str, list[float]]] = {}


def check_rate_limit(ip: str) -> None:
    """Raises LLMError(status=429) if the caller is over budget."""
    if not ip:
        ip = "unknown"
    now = time.time()
    minute_cutoff = now - 60
    day_cutoff = now - 86400
    with _rl_lock:
        buckets = _rl_state.setdefault(ip, {"min": [], "day": []})
        buckets["min"] = [t for t in buckets["min"] if t > minute_cutoff]
        buckets["day"] = [t for t in buckets["day"] if t > day_cutoff]
        if len(buckets["min"]) >= RATE_LIMIT_PER_MINUTE:
            raise LLMError("Rate limit exceeded (per minute)", status=429)
        if len(buckets["day"]) >= RATE_LIMIT_PER_DAY:
            raise LLMError("Rate limit exceeded (per day)", status=429)
        buckets["min"].append(now)
        buckets["day"].append(now)


# ---------------------------------------------------------------------------
# DB-backed cache + daily spend counter
# ---------------------------------------------------------------------------
def _hash_input(payload: Any) -> str:
    canonical = json.dumps(payload, sort_keys=True, default=str)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def cache_get(endpoint: str, input_hash: str) -> dict | None:
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT response FROM llm_cache "
                "WHERE endpoint = %s AND input_hash = %s AND expires_at > NOW()",
                (endpoint, input_hash),
            )
            row = cur.fetchone()
            return row["response"] if row else None
    finally:
        conn.close()


def cache_put(endpoint: str, input_hash: str, response: dict, ttl_seconds: int) -> None:
    conn = get_db_connection()
    try:
        expires = datetime.now(timezone.utc) + timedelta(seconds=ttl_seconds)
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO llm_cache (endpoint, input_hash, response, expires_at)
                VALUES (%s, %s, %s::jsonb, %s)
                ON CONFLICT (endpoint, input_hash) DO UPDATE
                  SET response = EXCLUDED.response,
                      expires_at = EXCLUDED.expires_at,
                      created_at = NOW()
                """,
                (endpoint, input_hash, json.dumps(response), expires),
            )
            conn.commit()
    finally:
        conn.close()


def check_and_record_usage(input_tokens: int, output_tokens: int) -> None:
    """Atomically bumps today's counter; raises 503 if either cap is hit."""
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO llm_usage_daily (day, request_count, input_tokens, output_tokens)
                VALUES (CURRENT_DATE, 1, %s, %s)
                ON CONFLICT (day) DO UPDATE
                  SET request_count = llm_usage_daily.request_count + 1,
                      input_tokens  = llm_usage_daily.input_tokens + EXCLUDED.input_tokens,
                      output_tokens = llm_usage_daily.output_tokens + EXCLUDED.output_tokens
                RETURNING request_count, output_tokens
                """,
                (input_tokens, output_tokens),
            )
            row = cur.fetchone()
            conn.commit()
            if row["request_count"] > DAILY_REQUEST_CAP:
                raise LLMError("Daily request cap reached", status=503)
            if row["output_tokens"] > DAILY_OUTPUT_TOKEN_CAP:
                raise LLMError("Daily token cap reached", status=503)
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# Feature A: NL → structured filter via tool use
# ---------------------------------------------------------------------------
APPLY_FILTERS_TOOL = {
    "name": "apply_filters",
    "description": (
        "Translate the user's natural-language satellite catalog query into "
        "a structured filter. Only set fields you are confident the query "
        "implies. Omit any field that is not clearly requested. Do NOT "
        "invent values not present in the enums."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "orbit_type": {"type": "string", "enum": ORBIT_TYPES},
            "purpose": {"type": "string", "enum": PURPOSES},
            "country": {
                "type": "string",
                "description": (
                    "Two-to-five letter country/agency code from Space-Track "
                    "(e.g. 'US', 'PRC', 'CIS', 'ESA', 'JPN'). Use 'PRC' for China."
                ),
            },
            "launch_year_min": {"type": "integer", "minimum": 1957, "maximum": 2100},
            "launch_year_max": {"type": "integer", "minimum": 1957, "maximum": 2100},
            "perigee_min_km": {"type": "number", "minimum": 0, "maximum": 500000},
            "perigee_max_km": {"type": "number", "minimum": 0, "maximum": 500000},
            "apogee_min_km": {"type": "number", "minimum": 0, "maximum": 500000},
            "apogee_max_km": {"type": "number", "minimum": 0, "maximum": 500000},
            "eccentricity_min": {"type": "number", "minimum": 0, "maximum": 1},
            "velocity_min": {"type": "number", "minimum": 0, "maximum": 30},
            "velocity_max": {"type": "number", "minimum": 0, "maximum": 30},
            "active_only": {"type": "boolean"},
            "recent_launches": {"type": "boolean"},
            "decaying": {"type": "boolean"},
        },
        "additionalProperties": False,
    },
}


_NL_SYSTEM_PROMPT = (
    "You translate natural-language satellite catalog queries into a structured "
    "filter by calling the apply_filters tool exactly once. Only set fields you "
    "are confident the query implies. If the query is gibberish or unrelated to "
    "satellites, call the tool with no fields set. Never reply in plain text."
)


def nl_to_filters(query: str) -> dict:
    """Returns a validated filter dict. Caches by query."""
    if not query or len(query) > 500:
        raise LLMError("Query must be 1–500 characters", status=400)

    cache_key = _hash_input({"q": query.strip().lower()})
    cached = cache_get("nl_to_filters", cache_key)
    if cached is not None:
        return cached

    client = _get_client()
    resp = client.messages.create(
        model=MODEL,
        max_tokens=MAX_TOKENS_FILTER,
        system=[
            {
                "type": "text",
                "text": _NL_SYSTEM_PROMPT,
                "cache_control": {"type": "ephemeral"},
            }
        ],
        tools=[APPLY_FILTERS_TOOL],
        tool_choice={"type": "tool", "name": "apply_filters"},
        messages=[{"role": "user", "content": query.strip()}],
    )

    check_and_record_usage(
        getattr(resp.usage, "input_tokens", 0),
        getattr(resp.usage, "output_tokens", 0),
    )

    tool_input: dict = {}
    for block in resp.content:
        if getattr(block, "type", None) == "tool_use" and block.name == "apply_filters":
            tool_input = block.input or {}
            break

    cleaned = {k: v for k, v in tool_input.items() if v not in (None, "")}
    cache_put("nl_to_filters", cache_key, cleaned, ttl_seconds=86400)
    return cleaned


# ---------------------------------------------------------------------------
# Feature B: CDM conjunction briefing
# ---------------------------------------------------------------------------
_CDM_SYSTEM_PROMPT = (
    "You are an orbital safety analyst. Given a Conjunction Data Message and "
    "the two satellites involved, write exactly THREE plain-English sentences "
    "for a public dashboard:\n"
    "  1. Identify both objects (what they are, who operates them if known).\n"
    "  2. State the time of closest approach, miss distance, and probability "
    "in plainspoken terms a non-expert can grasp.\n"
    "  3. Give context on severity ('routine screening' vs 'unusually close') "
    "without speculating on actions operators will take.\n"
    "Do not invent operator names, country origins, or maneuver details that "
    "are not in the input. Do not hedge with 'I cannot determine' — say what "
    "the data shows."
)


def cdm_briefing(event: dict, sat1: dict, sat2: dict) -> str:
    """Returns the 3-sentence briefing. Caches per cdm_id until TCA passes."""
    cdm_id = event.get("cdm_id")
    if not cdm_id:
        raise LLMError("CDM event missing cdm_id", status=400)

    cache_key = _hash_input({"cdm_id": cdm_id})
    cached = cache_get("cdm_briefing", cache_key)
    if cached and "briefing" in cached:
        return cached["briefing"]

    payload = {
        "event": {
            "cdm_id": cdm_id,
            "tca_utc": str(event.get("tca")),
            "miss_distance_km": event.get("min_rng"),
            "collision_probability": event.get("pc"),
            "emergency_reportable": event.get("emergency_reportable"),
        },
        "object_1": _shape_sat(sat1, event, side=1),
        "object_2": _shape_sat(sat2, event, side=2),
    }

    client = _get_client()
    resp = client.messages.create(
        model=MODEL,
        max_tokens=MAX_TOKENS_BRIEFING,
        system=[
            {
                "type": "text",
                "text": _CDM_SYSTEM_PROMPT,
                "cache_control": {"type": "ephemeral"},
            }
        ],
        messages=[
            {"role": "user", "content": json.dumps(payload, default=str)},
        ],
    )

    check_and_record_usage(
        getattr(resp.usage, "input_tokens", 0),
        getattr(resp.usage, "output_tokens", 0),
    )

    text = "".join(
        block.text for block in resp.content if getattr(block, "type", None) == "text"
    ).strip()
    if not text:
        raise LLMError("Empty briefing from model", status=502)

    # TTL: cache until TCA passes, capped at 7 days. Once the conjunction is in
    # the past the briefing's "imminent" framing is wrong anyway.
    ttl = _ttl_until_tca(event.get("tca"))
    cache_put("cdm_briefing", cache_key, {"briefing": text}, ttl_seconds=ttl)
    return text


def _shape_sat(sat: dict | None, event: dict, side: int) -> dict:
    """Compact a satellite row + per-side CDM fields into the briefing payload."""
    if not sat:
        return {
            "name": event.get(f"sat_{side}_name"),
            "norad": event.get(f"sat_{side}_id"),
            "type": event.get(f"sat_{side}_type"),
            "rcs": event.get(f"sat_{side}_rcs"),
        }
    return {
        "name": sat.get("name"),
        "norad": sat.get("norad_number"),
        "type": event.get(f"sat_{side}_type") or sat.get("object_type"),
        "rcs": event.get(f"sat_{side}_rcs") or sat.get("rcs"),
        "country": sat.get("country"),
        "purpose": sat.get("purpose"),
        "orbit_type": sat.get("orbit_type"),
        "launch_date": str(sat.get("launch_date")) if sat.get("launch_date") else None,
        "active_status": sat.get("active_status"),
    }


# ---------------------------------------------------------------------------
# Phase A1: Conversational analyst with tool use
# ---------------------------------------------------------------------------
_ASK_SYSTEM_PROMPT = (
    "You are the Sat-Track Mission Control analyst. You answer questions "
    "about the public satellite catalog, conjunction events (CDMs), launches, "
    "space weather, and TLE history by calling the provided read-only tools.\n\n"
    "Rules:\n"
    "- Always call a tool before answering with numbers or lists; never invent data.\n"
    "- Prefer aggregates (count, group_by) for high-level questions.\n"
    "- Cite specific NORAD numbers, names, dates, and metric values from tool results.\n"
    "- If the question can't be answered with the available tools, say so plainly.\n"
    "- Keep final answers under 150 words. Use bullet points for lists of >3 items.\n"
    "- The current date is determined by the system; use 'NOW()' semantics — do not "
    "  assume a hardcoded year.\n"
)


def ask(question: str, history: list | None = None) -> dict:
    """Run the tool-use loop for a single user question.

    Returns:
      {
        "answer": str,
        "tool_calls": [{"name": ..., "input": ..., "result_summary": ...}, ...],
        "model": str,
        "iterations": int,
      }

    Caches the full response for 5 minutes per question (no history).
    """
    if not question or len(question) > 1000:
        raise LLMError("Question must be 1–1000 characters", status=400)

    try:
        from services import llm_tools
    except ImportError:
        from app.services import llm_tools

    cache_key = _hash_input({"q": question.strip().lower(), "h": history or []})
    cached = cache_get("ask", cache_key)
    if cached is not None:
        return cached

    client = _get_client()
    messages: list[dict] = list(history or [])
    messages.append({"role": "user", "content": question.strip()})

    tool_calls_log: list[dict] = []
    total_input = 0
    total_output = 0

    for iteration in range(ASK_MAX_TOOL_ITERATIONS):
        resp = client.messages.create(
            model=MODEL,
            max_tokens=MAX_TOKENS_ANALYST,
            system=[
                {
                    "type": "text",
                    "text": _ASK_SYSTEM_PROMPT,
                    "cache_control": {"type": "ephemeral"},
                }
            ],
            tools=llm_tools.TOOL_SCHEMAS,
            messages=messages,
        )

        total_input += getattr(resp.usage, "input_tokens", 0)
        total_output += getattr(resp.usage, "output_tokens", 0)

        if resp.stop_reason != "tool_use":
            text = "".join(
                b.text for b in resp.content if getattr(b, "type", None) == "text"
            ).strip()
            if not text:
                text = "I couldn't produce an answer for that. Try rephrasing or asking something more specific."
            check_and_record_usage(total_input, total_output)
            result = {
                "answer": text,
                "tool_calls": tool_calls_log,
                "model": MODEL,
                "iterations": iteration + 1,
            }
            cache_put("ask", cache_key, result, ttl_seconds=300)
            return result

        # Append assistant message exactly as returned, then run tools.
        assistant_blocks = [
            {"type": b.type, **({"text": b.text} if b.type == "text" else {})}
            if b.type == "text"
            else {
                "type": "tool_use",
                "id": b.id,
                "name": b.name,
                "input": b.input,
            }
            for b in resp.content
        ]
        messages.append({"role": "assistant", "content": assistant_blocks})

        tool_results: list[dict] = []
        for block in resp.content:
            if getattr(block, "type", None) != "tool_use":
                continue
            try:
                result = llm_tools.call_tool(block.name, block.input)
                summary = _summarize_tool_result(block.name, result)
                content = json.dumps(result, default=str)[:8000]  # safety cap on context bloat
                tool_calls_log.append(
                    {"name": block.name, "input": block.input, "summary": summary}
                )
            except Exception as exc:
                content = json.dumps({"error": str(exc)})
                tool_calls_log.append(
                    {"name": block.name, "input": block.input, "summary": f"error: {exc}"}
                )
            tool_results.append({
                "type": "tool_result",
                "tool_use_id": block.id,
                "content": content,
            })

        messages.append({"role": "user", "content": tool_results})

    # Hit the iteration cap without producing a final answer.
    check_and_record_usage(total_input, total_output)
    result = {
        "answer": "I made several tool calls but couldn't converge on an answer. Try a more specific question.",
        "tool_calls": tool_calls_log,
        "model": MODEL,
        "iterations": ASK_MAX_TOOL_ITERATIONS,
    }
    return result


def _summarize_tool_result(name: str, result: dict) -> str:
    if "count" in result:
        return f"{name} → count={result['count']}"
    if "buckets" in result:
        return f"{name} → {len(result['buckets'])} buckets"
    if "rows" in result:
        return f"{name} → {len(result['rows'])} rows"
    if "value" in result:
        return f"{name} → value={result['value']}"
    return name


# ---------------------------------------------------------------------------
# Phase A2: Per-satellite maneuver-timeline narrative
# ---------------------------------------------------------------------------
_TIMELINE_SYSTEM_PROMPT = (
    "You are an orbital analyst. Given a satellite's name and a chronological "
    "list of detected maneuver events (each with classification, deltas in km, "
    "and before/after orbit), write a 2-paragraph narrative for a public dashboard.\n\n"
    "Paragraph 1: characterize the operational pattern (frequent station-keeping, "
    "drag decay, orbit-shaping campaign, anomalous gap, etc.) and quantify the "
    "cumulative orbit changes over the window.\n"
    "Paragraph 2: call out the most notable single event with date and Δ values, "
    "and flag anything unusual relative to the pattern.\n\n"
    "Be precise with numbers from the events. Do not invent operator decisions "
    "or commercial context. Do not hedge with 'I cannot determine'."
)


def timeline_narrative(name: str, norad: int, events: list[dict]) -> str:
    """Generate the 2-paragraph narrative for a satellite's maneuver timeline."""
    if not events:
        return (
            f"No significant maneuvers were detected in {name}'s recent TLE history. "
            "Either the satellite is purely drag-driven, or it hasn't been observed long "
            "enough to capture a maneuver. Check back in a few weeks."
        )

    cache_key = _hash_input({"norad": norad, "n_events": len(events), "last": events[-1].get("end")})
    cached = cache_get("timeline_narrative", cache_key)
    if cached and "narrative" in cached:
        return cached["narrative"]

    client = _get_client()
    payload = {"satellite": name, "norad": norad, "events": events[-20:]}  # last 20 max
    resp = client.messages.create(
        model=MODEL,
        max_tokens=MAX_TOKENS_TIMELINE,
        system=[
            {"type": "text", "text": _TIMELINE_SYSTEM_PROMPT, "cache_control": {"type": "ephemeral"}}
        ],
        messages=[{"role": "user", "content": json.dumps(payload, default=str)}],
    )
    check_and_record_usage(
        getattr(resp.usage, "input_tokens", 0),
        getattr(resp.usage, "output_tokens", 0),
    )
    text = "".join(b.text for b in resp.content if getattr(b, "type", None) == "text").strip()
    if not text:
        raise LLMError("Empty timeline narrative", status=502)
    cache_put("timeline_narrative", cache_key, {"narrative": text}, ttl_seconds=12 * 3600)
    return text


# ---------------------------------------------------------------------------
# Phase B1: Reentry briefing
# ---------------------------------------------------------------------------
_REENTRY_SYSTEM_PROMPT = (
    "You are an orbital safety analyst. Given a low-perigee LEO satellite "
    "exposed to atmospheric drag, write a 3-sentence briefing:\n"
    "  1. Identify the object (what it is, when launched, country/operator if known).\n"
    "  2. Describe its current orbit (perigee in km, apogee, inclination) "
    "and what the inclination implies for ground-track latitude band.\n"
    "  3. Comment on imminence and fragment risk: low perigee + high bstar "
    "means short remaining lifetime (weeks to months); large RCS means "
    "more debris survives reentry. Be honest if data is sparse.\n"
    "Use only data in the input. No invented operator details. Don't claim "
    "a specific decay date — we don't have one."
)


def reentry_briefing(reentry: dict) -> str:
    norad = reentry.get("norad_number")
    cache_key = _hash_input({"norad": norad, "decay": reentry.get("decay_date")})
    cached = cache_get("reentry_briefing", cache_key)
    if cached and "briefing" in cached:
        return cached["briefing"]

    client = _get_client()
    resp = client.messages.create(
        model=MODEL,
        max_tokens=MAX_TOKENS_BRIEFING,
        system=[{"type": "text", "text": _REENTRY_SYSTEM_PROMPT, "cache_control": {"type": "ephemeral"}}],
        messages=[{"role": "user", "content": json.dumps(reentry, default=str)}],
    )
    check_and_record_usage(
        getattr(resp.usage, "input_tokens", 0),
        getattr(resp.usage, "output_tokens", 0),
    )
    text = "".join(b.text for b in resp.content if getattr(b, "type", None) == "text").strip()
    if not text:
        raise LLMError("Empty reentry briefing", status=502)
    cache_put("reentry_briefing", cache_key, {"briefing": text}, ttl_seconds=6 * 3600)
    return text


# ---------------------------------------------------------------------------
# Phase B2: Space-weather impact briefing
# ---------------------------------------------------------------------------
_SPACEWX_SYSTEM_PROMPT = (
    "You are a space-weather analyst. Given current Kp/Dst/F10.7 readings "
    "and a list of LEO satellites most exposed to drag (lowest perigee × "
    "highest bstar), write a 3-sentence briefing for a public dashboard:\n"
    "  1. State the storm severity in plain language ('quiet', 'unsettled', "
    "'minor storm', 'major storm') and tie it to the Kp/Dst values.\n"
    "  2. Explain what this means for LEO satellites — increased atmospheric "
    "density, higher drag, accelerated decay for the most-exposed objects.\n"
    "  3. Name 2-3 of the most-exposed satellites by name from the input.\n"
    "Be precise with the numbers. Don't speculate beyond the input data."
)


def space_weather_briefing(weather: dict, exposed_sats: list[dict]) -> str:
    cache_key = _hash_input({"kp": weather.get("kp"), "dst": weather.get("dst"), "n": len(exposed_sats)})
    cached = cache_get("space_weather_briefing", cache_key)
    if cached and "briefing" in cached:
        return cached["briefing"]

    client = _get_client()
    payload = {"weather": weather, "most_exposed_leo": exposed_sats[:5]}
    resp = client.messages.create(
        model=MODEL,
        max_tokens=MAX_TOKENS_BRIEFING,
        system=[{"type": "text", "text": _SPACEWX_SYSTEM_PROMPT, "cache_control": {"type": "ephemeral"}}],
        messages=[{"role": "user", "content": json.dumps(payload, default=str)}],
    )
    check_and_record_usage(
        getattr(resp.usage, "input_tokens", 0),
        getattr(resp.usage, "output_tokens", 0),
    )
    text = "".join(b.text for b in resp.content if getattr(b, "type", None) == "text").strip()
    if not text:
        raise LLMError("Empty weather briefing", status=502)
    cache_put("space_weather_briefing", cache_key, {"briefing": text}, ttl_seconds=1800)
    return text


# ---------------------------------------------------------------------------
# Phase B3: Daily digest
# ---------------------------------------------------------------------------
_DIGEST_SYSTEM_PROMPT = (
    "You are the editor of a daily space-tracking briefing. Given a JSON "
    "summary of the past 24 hours' notable conjunctions, launches, decays, "
    "and space weather, write a 5-paragraph briefing:\n"
    "  P1: Headline of the day — the single most newsworthy item.\n"
    "  P2: Conjunctions — top 1-2 collision risks and their parties.\n"
    "  P3: Launches — what flew, what did it deploy, success/failure.\n"
    "  P4: Decays — what just came down or is about to.\n"
    "  P5: Space weather context.\n"
    "Be specific with numbers, dates, and NORAD IDs. Don't hedge with "
    "'I cannot determine'. If a section has no data, say 'Quiet day for X'."
)


def daily_digest(summary: dict) -> str:
    """Generate the 5-paragraph daily digest. Caller is expected to cache
    in `llm_daily_briefings` (one row per day)."""
    client = _get_client()
    resp = client.messages.create(
        model=MODEL,
        max_tokens=900,
        system=[{"type": "text", "text": _DIGEST_SYSTEM_PROMPT, "cache_control": {"type": "ephemeral"}}],
        messages=[{"role": "user", "content": json.dumps(summary, default=str)}],
    )
    check_and_record_usage(
        getattr(resp.usage, "input_tokens", 0),
        getattr(resp.usage, "output_tokens", 0),
    )
    text = "".join(b.text for b in resp.content if getattr(b, "type", None) == "text").strip()
    if not text:
        raise LLMError("Empty digest", status=502)
    return text


def _ttl_until_tca(tca: Any) -> int:
    if not tca:
        return 3600
    try:
        if isinstance(tca, str):
            dt = datetime.fromisoformat(tca.replace("Z", "+00:00"))
        else:
            dt = tca
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        seconds = int((dt - datetime.now(timezone.utc)).total_seconds())
        return max(300, min(seconds, 7 * 86400))
    except Exception:
        return 3600
