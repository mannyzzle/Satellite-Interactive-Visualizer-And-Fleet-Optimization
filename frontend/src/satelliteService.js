import axios from "axios";

// Adjust URL to your Docker-hosted backend (or RDS-hosted environment)
const BASE_URL = "http://127.0.0.1:8000"; 

export const fetchSatellites = async () => {
  try {
    const response = await axios.get(`${BASE_URL}/api/satellites`);
    return response.data;
  } catch (error) {
    console.error("Error fetching satellites:", error);
    return [];
  }
};
