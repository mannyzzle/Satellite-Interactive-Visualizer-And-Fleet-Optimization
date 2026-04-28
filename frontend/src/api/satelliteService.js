// src/api/satelliteService.js

import axios from "axios";
import { SATELLITES_API, CDM_API, OLD_TLES_API, LLM_API, REENTRY_API, SPACE_WEATHER_API, DIGEST_API } from "../config";

const API_BASE_URL = `${SATELLITES_API}/`;
const CDM_BASE_URL = `${CDM_API}/`;
const OLD_TLES_BASE_URL = `${OLD_TLES_API}/`;



export async function fetchSatellites(page = 1, limit = 500, filter = null) {
  try {
    let url = `${API_BASE_URL}?page=${page}&limit=${limit}`;

    if (filter) {
      url += `&filter=${encodeURIComponent(filter)}`;
    }

    console.log(`📡 Fetching satellites from: ${url}`);
    const response = await axios.get(url);

    console.log("📌 API Response:", response.data);

    if (!response.data || !response.data.satellites) {
      console.warn("⚠️ API response missing 'satellites' key!");
      return { satellites: [] };
    }

    if (response.data.satellites.length === 0) {
      console.warn("⚠️ API returned 0 satellites.");
    } else {
      console.log(`✅ API returned ${response.data.satellites.length} satellites.`);
    }

    return response.data;
  } catch (error) {
    console.error("❌ Error fetching satellites:", error);
    return { satellites: [] };
  }
}










export async function fetchSatelliteByName(name) {
  try {
    console.log(`📡 Fetching satellite details for: ${name}`);

    const formattedName = encodeURIComponent(name.trim());
    const url = `${API_BASE_URL}/${formattedName}`.replace(/([^:]\/)\/+/g, "$1");

    console.log(`🔗 Corrected API Request URL: ${url}`);

    const response = await axios.get(url, {
      validateStatus: (status) => status < 500, // Allow handling 404 errors properly
    });

    if (response.status === 404) {
      console.warn(`⚠️ Satellite not found: ${name}`);
      return null;
    }

    if (!response.data) {
      console.error("❌ API returned empty data!");
      return null;
    }

    return response.data;
  } catch (error) {
    console.error("❌ Error fetching satellite:", error);
    return null;
  }
}




/**
 * Fetch Old TLEs for a given NORAD number.
 */
export async function fetchHistoricalTLEs(noradNumber) {
  try {
    const url = `${OLD_TLES_BASE_URL}fetch/${noradNumber}`;
    console.log(`📡 Fetching old TLEs from: ${url}`);

    const response = await axios.get(url);
    console.log("📌 Old TLEs API Response:", response.data);

    return response.data;
  } catch (error) {
    console.error(`❌ Error fetching old TLEs for NORAD ${noradNumber}:`, error);
    return { historical_tles: [] };
  }
}






/**
 * Natural-language catalog search.
 * Returns { query, filters, total, satellites } or null on failure.
 */
export async function searchByNL(query, limit = 200) {
  const url = `${LLM_API}/search`;
  try {
    const response = await axios.post(url, { query, limit }, {
      validateStatus: (s) => s < 600,
    });
    if (response.status === 429) {
      return { error: "rate_limit", message: "Too many searches — try again in a minute." };
    }
    if (response.status === 503) {
      return { error: "unavailable", message: "AI search is temporarily over budget. Use the filter chips below." };
    }
    if (response.status >= 400) {
      return { error: "bad_request", message: response.data?.detail || "Search failed." };
    }
    return response.data;
  } catch (err) {
    console.error("searchByNL error:", err);
    return { error: "network", message: "Could not reach search service." };
  }
}

/**
 * Streaming variant of /ask. Calls onEvent({type, ...}) for every SSE
 * event from the backend. Resolves when the stream closes.
 *
 * Event types: tool_call, text_delta, done, error.
 */
export async function askSatTrackStream(question, history = [], onEvent) {
  const url = `${LLM_API}/ask/stream`;
  let resp;
  try {
    resp = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ question, history }),
    });
  } catch (err) {
    onEvent({ type: "error", message: "Could not reach Mission Control." });
    return;
  }
  if (!resp.ok) {
    let detail = "Stream failed.";
    if (resp.status === 429) detail = "Too many questions — try again in a minute.";
    else if (resp.status === 503) detail = "AI is temporarily over budget. Try again later.";
    else {
      try {
        const data = await resp.json();
        detail = data?.detail || detail;
      } catch {}
    }
    onEvent({ type: "error", message: detail });
    return;
  }
  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    // Parse complete SSE events ("data: <json>\n\n")
    let idx;
    while ((idx = buffer.indexOf("\n\n")) !== -1) {
      const raw = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      const line = raw.trim();
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (!payload) continue;
      try {
        onEvent(JSON.parse(payload));
      } catch (err) {
        console.warn("SSE parse error:", err, payload);
      }
    }
  }
}

/**
 * Conversational analyst — POST a question, get back answer + tool calls.
 */
export async function askSatTrack(question, history = []) {
  const url = `${LLM_API}/ask`;
  try {
    const response = await axios.post(
      url,
      { question, history },
      { validateStatus: (s) => s < 600, timeout: 60000 }
    );
    if (response.status === 429) {
      return { error: "rate_limit", message: "Too many questions — try again in a minute." };
    }
    if (response.status === 503) {
      return { error: "unavailable", message: "AI is temporarily over budget. Try again later." };
    }
    if (response.status >= 400) {
      return { error: response.status, message: response.data?.detail || "Ask failed." };
    }
    return response.data;
  } catch (err) {
    console.error("askSatTrack error:", err);
    return { error: "network", message: "Could not reach Mission Control." };
  }
}

/**
 * Get a satellite's maneuver timeline + AI narrative.
 */
export async function fetchSatelliteTimeline(norad, windowDays = 365) {
  const url = `${LLM_API}/satellite/${encodeURIComponent(norad)}/timeline?window_days=${windowDays}`;
  try {
    const response = await axios.get(url, { validateStatus: (s) => s < 600, timeout: 60000 });
    if (response.status >= 400) {
      return { error: response.status, message: response.data?.detail || "Timeline unavailable." };
    }
    return response.data;
  } catch (err) {
    console.error("fetchSatelliteTimeline error:", err);
    return { error: "network", message: "Could not reach timeline service." };
  }
}

/**
 * Fetch a 3-sentence AI briefing for a CDM event.
 */
export async function fetchCDMBriefing(cdmId) {
  const url = `${LLM_API}/cdm/${encodeURIComponent(cdmId)}/briefing`;
  try {
    const response = await axios.get(url, { validateStatus: (s) => s < 600 });
    if (response.status === 429) {
      return { error: "rate_limit", message: "Too many briefing requests — try again in a minute." };
    }
    if (response.status === 503) {
      return { error: "unavailable", message: "AI briefings temporarily unavailable (over budget or key missing)." };
    }
    if (response.status >= 400) {
      return { error: response.status, message: response.data?.detail || "Briefing unavailable." };
    }
    return response.data;
  } catch (err) {
    console.error("fetchCDMBriefing error:", err);
    return { error: "network", message: "Could not reach briefing service." };
  }
}

/**
 * Top imminent reentries (lowest perigee × highest bstar).
 */
export async function fetchUpcomingReentries(limit = 20) {
  try {
    const r = await axios.get(`${REENTRY_API}/upcoming?limit=${limit}`);
    return r.data;
  } catch (err) {
    console.error("fetchUpcomingReentries error:", err);
    return { count: 0, reentries: [] };
  }
}

export async function fetchReentryBriefing(norad) {
  const url = `${LLM_API}/reentry/${encodeURIComponent(norad)}/briefing`;
  try {
    const r = await axios.get(url, { validateStatus: (s) => s < 600 });
    if (r.status >= 400) return { error: r.status, message: r.data?.detail || "Briefing unavailable." };
    return r.data;
  } catch (err) {
    return { error: "network", message: "Could not reach briefing service." };
  }
}

export async function fetchSpaceWeather() {
  try {
    const r = await axios.get(`${SPACE_WEATHER_API}/current`);
    return r.data;
  } catch (err) {
    console.error("fetchSpaceWeather error:", err);
    return null;
  }
}

export async function fetchSpaceWeatherBriefing() {
  const url = `${LLM_API}/space-weather/briefing`;
  try {
    const r = await axios.get(url, { validateStatus: (s) => s < 600 });
    if (r.status >= 400) return { error: r.status, message: r.data?.detail || "Briefing unavailable." };
    return r.data;
  } catch (err) {
    return { error: "network", message: "Could not reach briefing service." };
  }
}

export async function fetchDailyDigest() {
  try {
    const r = await axios.get(`${DIGEST_API}/today`, { timeout: 60000 });
    return r.data;
  } catch (err) {
    console.error("fetchDailyDigest error:", err);
    return null;
  }
}

/**
 * Fetch all CDM Events (Conjunction Data Messages).
 */
export async function fetchCDMEvents() {
  try {
    const url = `${CDM_BASE_URL}fetch`;
    console.log(`📡 Fetching CDM events from: ${url}`);

    const response = await axios.get(url);
    console.log("📌 CDM Events API Response:", response.data);

    return response.data;
  } catch (error) {
    console.error("❌ Error fetching CDM events:", error);
    return { cdm_events: [] };
  }
}





