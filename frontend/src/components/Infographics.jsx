import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";





const Infographics = () => {
  const [launches, setLaunches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  


  useEffect(() => {
    const fetchLaunches = async () => {
      try {
        //API_URL = "https://satellite-tracker-production.up.railway.app/api/launches/previous"

        //TESTING
        //API_URL = "http://localhost:8000/api/launches/previous"
        
        const response = await fetch("https://satellite-tracker-production.up.railway.app/api/launches/previous"); // Update API URL if needed
        if (!response.ok) throw new Error("Failed to fetch launches");

        const data = await response.json();
        setLaunches(data.slice(0, 6)); // Display latest 6 launches
        setLoading(false);
      } catch (err) {
        setError(err.message);
        setLoading(false);
      }
    };

    fetchLaunches();
  }, []);

  const formatDateTime = (isoString) => {
    if (!isoString) return "Unknown";
    return new Intl.DateTimeFormat("en-US", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "UTC",
    }).format(new Date(isoString)) + " UTC";
  };

  if (loading) return <div className="p-4 text-center text-gray-300">⏳ Loading latest launches...</div>;
  if (error) return <div className="p-4 text-center text-red-400">❌ Failed to load launches. Try again later.</div>;
  if (!launches.length) return <div className="p-4 text-center text-gray-400">No recent launches available.</div>;

  return (
    <div className="w-full bg-[rgba(3, 0, 8, 0.85)] rounded-lg shadow-lg py-10 relative">
      
      {/* 🌌 Starry Background */}
      <div className="absolute w-full h-full overflow-hidden pointer-events-none">
        {generateStars(150)}
      </div>

      {/* 📊 Title Section */}
      <div className="w-full py-6 flex items-center justify-center bg-gray-900 border border-gray-700 shadow-md">
        <div className="hidden sm:block w-24 h-[2px] bg-[#4F89A5] opacity-80"></div>
        <h3 className="text-lg sm:text-2xl font-semibold text-[#86EED8] text-center mx-6 tracking-wide uppercase">
          Latest Launches
        </h3>
        <div className="hidden sm:block w-24 h-[2px] bg-[#4F89A5] opacity-80"></div>
      </div>

      {/* 🚀 Launch Cards */}
      <div className="mt-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 px-6">
        {launches.map((launch, index) => (
          <motion.div
            key={launch.id || index}
            className="bg-gray-800 rounded-lg shadow-md p-5 flex flex-col items-center text-center border border-gray-700"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: index * 0.1 }}
          >
            <img
              src={launch.image_url || "/default-launch.jpg"}
              alt={launch.name}
              className="w-full h-40 object-cover rounded-md shadow-md"
            />

            <h4 className="text-lg font-semibold text-white mt-3">{launch.name}</h4>
            <p className="text-gray-400 text-sm mt-1">{launch.mission_description || "No description available"}</p>

            <div className="mt-3 text-gray-300 text-sm">
              🚀 <span className="font-medium text-[#86EED8]">{launch.rocket_name}</span>
            </div>
            <div className="text-gray-400 text-sm">
              📍 <span className="font-medium">{launch.pad_name || "Unknown pad"}</span>
            </div>

            {/* 🕒 Launch Date & Time */}
            <div className="text-gray-300 text-sm mt-2">
              🕒 <span className="font-medium">{formatDateTime(launch.launch_date)}</span>
            </div>

            <div className={`mt-2 px-3 py-1 rounded-md text-sm font-semibold ${
              launch.launch_status === "Success"
                ? "bg-green-600 text-white"
                : launch.launch_status === "Failure"
                ? "bg-red-600 text-white"
                : "bg-yellow-500 text-gray-900"
            }`}>
              {launch.launch_status}
            </div>

            {launch.video_url && (
              <a
                href={launch.video_url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 text-blue-400 hover:text-blue-300 text-sm underline"
              >
                🎥 Watch Launch
              </a>
            )}
          </motion.div>
        ))}
      </div>
    </div>
  );
};

export default Infographics;

/** ⭐️ Generates background star animation */
const generateStars = (numStars) => {
  return Array.from({ length: numStars }).map((_, i) => {
    const size = Math.random() * 3 + 1;
    const duration = Math.random() * 5 + 3;
    const positionX = Math.random() * 100;
    const positionY = Math.random() * 100;

    return (
      <motion.div
        key={i}
        className="absolute bg-white rounded-full"
        style={{
          width: `${size}px`,
          height: `${size}px`,
          left: `${positionX}%`,
          top: `${positionY}%`,
          opacity: Math.random() * 0.5 + 0.3,
          filter: "drop-shadow(0px 0px 5px rgba(255, 255, 255, 0.8))",
        }}
        animate={{ opacity: [0.2, 1, 0.2] }}
        transition={{
          duration: duration,
          repeat: Infinity,
          ease: "easeInOut",
        }}
      />
    );
  });
};
