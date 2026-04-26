import React, { useState, useEffect, useMemo } from "react";
import CountUp from "react-countup";
import axios from "axios";
import { motion } from "framer-motion";
import {
  RadialBarChart,
  RadialBar,
  PolarAngleAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { Typewriter } from "react-simple-typewriter";
import { SATELLITES_API } from "../config";

const API_URL = `${SATELLITES_API}/count`;
const OBJECT_TYPE_API = `${SATELLITES_API}/object_types`;

/// Orbit-themed palette — each ring gets a distinct hue along the Mako gradient.
const RING_COLORS = [
  "#86EED8", // bright teal — the "headline" payload ring
  "#5BA9C4", // mid teal-blue
  "#3F5F85", // navy
  "#9FCF86", // soft mint
  "#C8E49C", // pale lime
  "#7B5BB4", // muted violet (only kicks in if there are 6+ object types)
];

const SatelliteCounter = () => {
  const [satelliteCount, setSatelliteCount] = useState(0);
  const [objectTypes, setObjectTypes] = useState([]);
  // Stabilize the starfield so re-renders don't unmount + remount 150
  // motion.divs and restart every twinkle animation. This was the visible
  // background flicker — see CLAUDE.md.
  const stars = useMemo(() => generateStars(150), []);

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

  // Derived chart data — sorted descending by count so the largest category
  // gets the brightest hue and the outermost ring. The "name" key is what
  // RadialBar renders along the polar angle; "count" is the bar magnitude.
  const totalObjects = objectTypes.reduce((sum, t) => sum + (t.count || 0), 0);
  const chartData = objectTypes
    .slice()
    .sort((a, b) => (b.count || 0) - (a.count || 0))
    .map((t, i) => ({
      name: t.object_type,
      count: t.count,
      pct: totalObjects ? ((t.count || 0) / totalObjects) * 100 : 0,
      fill: RING_COLORS[i % RING_COLORS.length],
    }));

  return (
    <div className="relative w-screen h-screen flex items-center justify-center bg-[rgba(3, 0, 8, 0.85)]  overflow-hidden">
        {/* 🌌 Starfield (Randomly Placed Stars) */}
  <div className="absolute w-full h-full overflow-hidden pointer-events-none">
    {stars}
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
          
          {/* 🛰️ Title
              Reserve enough vertical space for the longest 2-line state of
              the typewritten string so the page doesn't jolt when the text
              crosses its wrap threshold mid-cycle. Cap the loop at 1 pass
              so the cursor blinks but we don't churn the layout forever. */}
          <motion.h1
            className="text-4xl sm:text-5xl md:text-6xl font-extrabold text-[#86EED8] tracking-wide glow-text"
            style={{ minHeight: "2.4em" }}
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1 }}
          >
            <Typewriter
              words={["Welcome to Sat-Track"]}
              loop={1}
              cursor
              cursorStyle="|"
              typeSpeed={50}
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

          {/* The radial chart on the right shows the live count in its
              center already — no duplicate counter here on the left. Keep
              the column compact so the hero copy + chart line up. */}
        </div>

        {/* 📊 Orbital Distribution Ring (Right)
            Concentric rings — one per object type, brightest = largest share.
            Total count anchored in the center. No re-fired animations on
            parent re-render. */}
        <div className="relative w-full lg:w-1/2 h-full flex justify-center items-center">
          <motion.div
            className="relative w-full h-full"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 1.6, ease: "easeOut" }}
          >
            <ResponsiveContainer width="100%" height="100%">
              <RadialBarChart
                cx="50%"
                cy="50%"
                innerRadius="36%"
                outerRadius="92%"
                barSize={14}
                data={chartData}
                startAngle={90}
                endAngle={-270}
              >
                {/* Hidden axis sets the value range so each bar's arc length
                    encodes its share of the total. */}
                <PolarAngleAxis
                  type="number"
                  domain={[0, totalObjects || 1]}
                  angleAxisId={0}
                  tick={false}
                />
                <RadialBar
                  background={{ fill: "rgba(255,255,255,0.04)" }}
                  dataKey="count"
                  cornerRadius={6}
                  isAnimationActive={true}
                  animationDuration={1200}
                />
                {/* Custom tooltip content. Recharts' default label for
                    RadialBar is the row index (0,1,2…) which renders as a
                    big black "0" — useless. Roll our own panel so we control
                    every color and avoid inherited dark text. */}
                <Tooltip
                  cursor={false}
                  wrapperStyle={{ outline: "none" }}
                  content={({ active, payload }) => {
                    if (!active || !payload || !payload.length) return null;
                    const d = payload[0].payload;
                    return (
                      <div
                        style={{
                          background: "rgba(8, 16, 28, 0.95)",
                          border: "1px solid rgba(134, 238, 216, 0.4)",
                          borderRadius: 6,
                          padding: "6px 10px",
                          fontSize: 13,
                          color: "#E5F4F1",
                          boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 6,
                            fontWeight: 600,
                            color: "#E5F4F1",
                          }}
                        >
                          <span
                            style={{
                              width: 8,
                              height: 8,
                              borderRadius: 2,
                              background: d.fill,
                              display: "inline-block",
                            }}
                          />
                          {d.name}
                        </div>
                        <div style={{ marginTop: 2, color: "#9FCBC2" }}>
                          {d.count.toLocaleString()}{" "}
                          <span style={{ color: "#7A9C97" }}>
                            ({d.pct.toFixed(1)}%)
                          </span>
                        </div>
                      </div>
                    );
                  }}
                />
              </RadialBarChart>
            </ResponsiveContainer>

            {/* Center stat — fixed positioning prevents layout fights
                with Recharts' SVG sizing. Pointer-events-none lets tooltip
                hovers reach the bars underneath. Uses the authoritative
                /api/satellites/count value (totalObjects from /object_types
                should match but /count is canonical). */}
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <div className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-[#86EED8] tracking-wider drop-shadow-lg">
                <CountUp
                  start={0}
                  end={satelliteCount || totalObjects}
                  duration={2.5}
                  separator=","
                />
              </div>
              <div className="text-xs sm:text-sm md:text-base text-gray-400 uppercase tracking-[0.25em] mt-1">
                Objects Tracked
              </div>
            </div>

            {/* Legend along the bottom — replaces Recharts' built-in labels
                so we can style them and they don't fight the chart layout. */}
            <div className="absolute left-0 right-0 bottom-2 flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs sm:text-sm pointer-events-none">
              {chartData.map((d) => (
                <div key={d.name} className="flex items-center gap-2">
                  <span
                    className="inline-block w-2.5 h-2.5 rounded-sm"
                    style={{ background: d.fill, boxShadow: `0 0 10px ${d.fill}` }}
                  />
                  <span className="text-gray-300 font-medium">
                    {d.name}{" "}
                    <span className="text-gray-500">{d.pct.toFixed(1)}%</span>
                  </span>
                </div>
              ))}
            </div>
          </motion.div>
        </div>
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

