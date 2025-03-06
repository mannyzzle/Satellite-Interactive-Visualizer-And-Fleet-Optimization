// src/api/satelliteService.js

import axios from "axios";

const API_BASE_URL = "https://satellite-tracker-production.up.railway.app/api/satellites/";
const INFOGRAPHICS_BASE_URL = "https://satellite-tracker-production.up.railway.app/api/infographics/";

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


export async function fetchInfographics(filters) {
  try {
    if (!filters || (Array.isArray(filters) && filters.length === 0)) {
      console.warn("⚠️ No filters applied. Returning empty infographics.");
      return [];
    }
    if (!Array.isArray(filters)) {
      filters = [filters]; // ✅ Convert single filter string to array
    }

    const graphTypes = [
      "orbit_distribution",
      "velocity_distribution",
      "perigee_apogee",
      "purpose_breakdown",
      "country_distribution",
      "cumulative_launch_trend",
      "orbital_period_vs_mean_motion",
      "inclination_mean_motion",
      "bstar_altitude",
      "launch_sites"
    ];

    // ✅ Ensure properly formatted names
    const infographicUrls = filters.map((filter) => {
      const formattedFilter = decodeURIComponent(filter) // ✅ Fix double encoding
        .trim()
        .replace(/ /g, "_")
        .replace(/:/g, "")
        .replace(/\(|\)/g, "");

      return graphTypes.map((graph) => ({
        url: `${INFOGRAPHICS_BASE_URL}${formattedFilter}/${graph}.png`,
        name: `${formattedFilter.replace(/_/g, " ")} - ${graph.replace(/_/g, " ")}`, // ✅ Fix display names
      }));
    }).flat(); // ✅ Flatten after mapping

    console.log(`📡 Fetching infographics for filters: ${filters.join(", ")}`);
    return infographicUrls;
  } catch (error) {
    console.error("❌ Error fetching infographics:", error);
    return [];
  }
}
