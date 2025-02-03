// src/api/satelliteService.js

import axios from "axios";

const API_BASE_URL = "http://127.0.0.1:8000/api/satellites";

/**
 * Fetch paginated satellites from the backend.
 * @param {number} page - The page number.
 * @param {number} limit - Number of satellites per page.
 * @returns {Promise<Object|null>} - The response data or null if failed.
 */
export async function fetchSatellites(page = 1, limit = 20) {
  try {
    console.log(`📡 Fetching satellites: page=${page}, limit=${limit}`);

    const response = await axios.get(`${API_BASE_URL}?page=${page}&limit=${limit}`, {
      headers: { "Cache-Control": "no-cache" }, // ✅ Prevents browser caching
    });

    console.log(`✅ Fetched ${response.data.satellites.length} satellites.`);
    return response.data;
  } catch (error) {
    console.error("❌ Error fetching satellites:", error.response?.data || error.message);
    return null;
  }
}

/**
 * Fetch a specific satellite by its name.
 * @param {string} name - The name of the satellite.
 * @returns {Promise<Object|null>} - The satellite data or null if not found.
 */
export async function fetchSatelliteByName(name) {
  try {
    console.log(`📡 Fetching satellite: ${name}`);

    const response = await axios.get(`${API_BASE_URL}/${encodeURIComponent(name)}`, {
      headers: { "Cache-Control": "no-cache" },
    });

    console.log(`✅ Satellite data received: ${response.data.name}`);
    return response.data;
  } catch (error) {
    console.error(`❌ Error fetching satellite "${name}":`, error.response?.data || error.message);
    return null;
  }
}
