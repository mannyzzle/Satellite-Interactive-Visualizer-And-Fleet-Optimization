import React, { useState, useEffect } from "react";
import CountUp from "react-countup";
import axios from "axios";
import { motion } from "framer-motion";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import { Typewriter } from "react-simple-typewriter";

const API_URL = "https://satellite-tracker-production.up.railway.app/api/satellites/count";
const OBJECT_TYPE_API = "https://satellite-tracker-production.up.railway.app/api/satellites/object_types";

//TESTING✅ FastAPI Backend Endpoints
//const API_URL = "http://127.0.0.1:8000/api/satellites/count";
//const OBJECT_TYPE_API = "http://127.0.0.1:8000/api/satellites/object_types";

/// 🌌 Mako Color Palette (Dark → Medium → Light Variation)
const MAKO_GRADIENT = [
  "#C8E49C", // teal
  "#3F5F85", // Dark Navy-Blue
  "#86C1A9", // Rich Blue-Teal
  "#5E8A94"// Vibrant Cyan-Teal
   
];

const SatelliteCounter = () => {
  const [satelliteCount, setSatelliteCount] = useState(0);
  const [objectTypes, setObjectTypes] = useState([]);
  const [endAngle, setEndAngle] = useState(90); // 🔄 Animate pie chart filling

  useEffect(() => {
    // 🌍 Fetch total number of satellites
    const fetchSatelliteCount = async () => {
      try {
        console.log("📡 Fetching satellite count...");
        const response = await axios.get(API_URL);

        if (response.data && response.data.total) {
          console.log(`✅ Successfully fetched ${response.data.total} satellites.`);
          setSatelliteCount(response.data.total);
        } else {
          console.warn("⚠️ API response missing 'total' key!");
        }
      } catch (error) {
        console.error("❌ Error fetching satellite count:", error);
      }
    };

    // 📊 Fetch object type distribution
    const fetchObjectTypes = async () => {
      try {
        console.log("📡 Fetching object type distribution...");
        const response = await axios.get(OBJECT_TYPE_API);
        console.log("📌 Raw API Response:", response.data);

        if (response.data && Array.isArray(response.data.types)) {
          console.log(`✅ Successfully fetched ${response.data.types.length} object types.`);
          setObjectTypes(response.data.types);

          // 🔄 Start Pie Chart Animation (delayed for smooth effect)
          setTimeout(() => setEndAngle(450), 1000);
        } else {
          console.warn("⚠️ API response missing expected format! Response:", response.data);
        }
      } catch (error) {
        console.error("❌ Error fetching object type distribution:", error);
      }
    };

    fetchSatelliteCount();
    fetchObjectTypes();
  }, []);

  return (
    <div className="relative w-screen h-screen flex items-center justify-center bg-[rgba(3, 0, 8, 0.85)] shadow-lg overflow-hidden">
        {/* 🌌 Starfield (Randomly Placed Stars) */}
  <div className="absolute w-full h-full overflow-hidden pointer-events-none">
    {generateStars(150)} {/* Adjust number of stars here */}
  </div>

  
      {/* 🌍 Fully Contained Box */}
      <motion.div
        className="w-full h-full p-10 flex flex-col lg:flex-row items-center text-center lg:text-left"
        initial={{ opacity: 0, y: 5 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 1.2, delay: 0.5 }}
      >
        {/* 📜 Info Section (Left) */}
        <div className="flex flex-col items-center lg:items-start w-full lg:w-1/2 space-y-6">
          
          {/* 🛰️ Title */}
          <motion.h1
            className="text-4xl sm:text-5xl md:text-6xl font-extrabold text-[#86EED8] tracking-wide glow-text"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1 }}
          >
            <Typewriter
              words={["Welcome to Sat-Track"]}
              loop={true}
              cursor
              cursorStyle="|"
              typeSpeed={50}
              deleteSpeed={25}
              delaySpeed={2000}
            />
          </motion.h1>

          {/* 🌍 Description */}
          <p className="text-lg sm:text-xl md:text-2xl text-gray-300 leading-relaxed tracking-wide">
            Explore <span className="text-[#6BB8C7] font-bold">real-time satellite tracking</span>.  
            Monitor <span className="text-[#4F89A5] font-bold">active satellites</span>,  
            <span className="text-[#4F89A5] font-bold"> space debris</span>, and  
            <span className="text-[#4F89A5] font-bold"> orbital pathways</span> with precision.
            Gain insights into <span className="text-[#3E6A89] font-bold">LEO, GEO, and beyond</span>.  
          </p>

          {/* 🚀 Animated Counter */}
          <motion.div
            className="text-4xl sm:text-5xl md:text-6xl font-extrabold text-[#86EED8] tracking-wider animate-pulse glow-text"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1.5, delay: 1 }}
          >
            <span className="drop-shadow-lg">
              <CountUp start={0} end={satelliteCount} duration={5} separator="," />
            </span>
            <span className="text-lg sm:text-xl md:text-2xl font-medium text-gray-400 ml-2">
              Objects Currently Being Tracked
            </span>
          </motion.div>
        </div>

        {/* 📊 Chart Section (Right) */}
        <motion.div
          className="w-full lg:w-1/2 h-full flex justify-center items-center"
          initial={{ opacity: 0, scale: 0.6 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 4, ease: "easeOut" }}
        >
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={objectTypes}
                cx="50%"
                cy="50%"
                startAngle={90}
                endAngle={endAngle} // 🔄 Smooth Animation
                outerRadius="50%"
                dataKey="count"
                nameKey="object_type"
                isAnimationActive={true}
                stroke="none"
                fillOpacity={0.9}
                label={({ name, percent }) => `${name} ${(percent * 100).toFixed(1)}%`}
              >
                {objectTypes.map((entry, index) => (
                  <Cell 
                    key={`cell-${index}`} 
                    fill={MAKO_GRADIENT[index % MAKO_GRADIENT.length]}
                    style={{
                      filter: "drop-shadow(0px 0px 16px #6BB8C7)", // ✨ Soft Glow Effect
                      transition: "fill 5s ease-in-out",
                    }} 
                  />
                ))}
              </Pie>
              <Tooltip contentStyle={{ backgroundColor: "rgba(84, 226, 200, 0.85)", color: "rgba(255, 255, 255, 0.85)", border: "none" }} />
            </PieChart>
          </ResponsiveContainer>
        </motion.div>
      </motion.div>
    </div>
  );
};

export default SatelliteCounter;










const generateStars = (numStars) => {
  return Array.from({ length: numStars }).map((_, i) => {
    const size = Math.random() * 3 + 1; // Random size between 1px and 4px
    const duration = Math.random() * 5 + 3; // Random twinkle duration between 3s and 8s
    const positionX = Math.random() * 100; // Random X position (0-100%)
    const positionY = Math.random() * 100; // Random Y position (0-100%)

    return (
      <motion.div
        key={i}
        className="absolute bg-white rounded-full"
        style={{
          width: `${size}px`,
          height: `${size}px`,
          left: `${positionX}%`,
          top: `${positionY}%`,
          opacity: Math.random() * 0.5 + 0.3, // Random opacity (30% - 80%)
          filter: "drop-shadow(0px 0px 5px rgba(255, 255, 255, 0.8))", // Soft glow
        }}
        animate={{ opacity: [0.2, 1, 0.2] }} // Twinkle Effect
        transition={{
          duration: duration, // Randomized twinkle duration
          repeat: Infinity,
          ease: "easeInOut",
        }}
      />
    );
  });
};

