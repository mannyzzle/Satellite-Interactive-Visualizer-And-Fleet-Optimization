// src/api/satelliteService.js

import axios from "axios";
import { SATELLITES_API, CDM_API, OLD_TLES_API, LLM_API } from "../config";

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
 * Natural-language catalog search via Claude.
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
 * Fetch a Claude-generated 3-sentence briefing for a CDM event.
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





