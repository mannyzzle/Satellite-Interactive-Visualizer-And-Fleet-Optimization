// src/api/satelliteService.js

import axios from "axios";

const API_BASE_URL = "http://127.0.0.1:8000/api/satellites";

// ✅ Improved API Fetching: Now Handles Errors Better
export async function fetchSatellites(page = 1, limit = 20) {
  try {
    console.log(`📡 Fetching satellites (page: ${page}, limit: ${limit})...`);
    const response = await axios.get(`${API_BASE_URL}?page=${page}&limit=${limit}`);
    return response.data;
  } catch (error) {
    console.error("❌ Error fetching satellites:", error);
    return { satellites: [] };
  }
}

export async function fetchSatelliteByName(name) {
  try {
    console.log(`📡 Fetching satellite details for: ${name}`);
    const response = await axios.get(`${API_BASE_URL}/${encodeURIComponent(name)}`);
    return response.data;
  } catch (error) {
    console.error("❌ Error fetching satellite:", error);
    return null;
  }
}
