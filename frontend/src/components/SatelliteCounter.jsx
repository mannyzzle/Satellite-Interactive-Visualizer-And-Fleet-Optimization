import React, { useState, useEffect } from "react";
import CountUp from "react-countup";
import axios from "axios";
import { motion } from "framer-motion";

// ✅ FastAPI Backend Endpoint
const API_URL = "https://satellite-tracker-production.up.railway.app/api/satellites/count";

const SatelliteCounter = () => {
  const [satelliteCount, setSatelliteCount] = useState(0);

  useEffect(() => {
    // 🌍 Fetch total number of satellites
    const fetchSatelliteCount = async () => {
      try {
        console.log("📡 Fetching satellite count...");
        const response = await axios.get(API_URL);

        if (response.data && response.data.count) {
          console.log(`✅ Successfully fetched ${response.data.count} satellites.`);
          setSatelliteCount(response.data.count);
        } else {
          console.warn("⚠️ API response missing 'count' key!");
        }
      } catch (error) {
        console.error("❌ Error fetching satellite count:", error);
      }
    };

    fetchSatelliteCount();
  }, []);

  return (
    <motion.div
      className="text-xl sm:text-2xl md:text-3xl font-bold text-teal-300 tracking-wider animate-pulse glow-text"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 1.2, delay: 1 }}
    >
      {/* 🚀 Animated CountUp */}
      <span className="drop-shadow-lg">
        <CountUp start={0} end={satelliteCount} duration={3} separator="," />
      </span>
      <span className="text-xs sm:text-sm md:text-lg font-medium text-gray-300">
        {" "}objects currently tracked
      </span>
    </motion.div>
  );
};

export default SatelliteCounter;
