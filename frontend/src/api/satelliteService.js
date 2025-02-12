// src/api/satelliteService.js

import axios from "axios";

const API_BASE_URL = "https://satellite-tracker-production.up.railway.app/api/satellites/";

export async function fetchSatellites(page = 1, limit = 100, filter = null) {
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

    const response = await axios.get(`${API_BASE_URL}/${encodeURIComponent(name)}`, {
      validateStatus: (status) => status < 500, // Allows handling 404 errors properly
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
