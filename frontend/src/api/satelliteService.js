// src/api/satelliteService.js

import axios from "axios";

//const API_BASE_URL = "https://satellite-tracker-production.up.railway.app/api/satellites/";
//const CDM_BASE_URL = "https://satellite-tracker-production.up.railway.app/api/cdm/";
//const OLD_TLES_BASE_URL = "https://satellite-tracker-production.up.railway.app/api/old_tles/";

//testing
const API_BASE_URL = "http://127.0.0.1:8000/api/satellites/";
const CDM_BASE_URL = "http://127.0.0.1:8000/api/cdm/";
const OLD_TLES_BASE_URL = "http://127.0.0.1:8000/api/old_tles/";



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
export async function fetchOldTLEs(noradNumber) {
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





