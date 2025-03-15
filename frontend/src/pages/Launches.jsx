import { useState, useEffect } from "react";
import { motion } from "framer-motion";




export default function Launches() {
  const [launches, setLaunches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [countdowns, setCountdowns] = useState({});

  API_URL = "https://satellite-tracker-production.up.railway.app/api/launches/upcoming"

//TESTING
//API_URL = "http://localhost:8000/api/launches/upcoming"


  useEffect(() => {
    async function fetchLaunches() {
      try {
        const response = await (fetchAPI_URL);
        if (!response.ok) throw new Error("Failed to fetch upcoming launches.");

        const data = await response.json();
        if (!data || !Array.isArray(data)) {
          throw new Error("Invalid API response format.");
        }

        // Extract only needed fields & limit to 20 launches
        const filteredData = data.slice(0, 20).map((launch) => ({
          id: launch.id,
          name: launch.name,
          mission_description: launch.mission_description,
          image_url: launch.image_url,
          launch_date: launch.launch_date,
          launch_status: launch.launch_status,
          rocket_name: launch.rocket_name,
          pad_name: launch.pad_name,
          map_url: launch.map_url,
          payload_name: launch.payload_name,
          payload_orbit: launch.payload_orbit,
          mission_type: launch.mission_type,
          video_url: launch.video_url,
        }));

        setLaunches(filteredData);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    fetchLaunches();
  }, []);

  // Countdown Timer
  const calculateCountdown = (launchDate) => {
    if (!launchDate) return "🚀 Launched!";
    const launchTime = new Date(launchDate).getTime();
    const now = new Date().getTime();
    const timeDiff = launchTime - now;

    if (timeDiff <= 0) return "🚀 Launched!";

    const days = Math.floor(timeDiff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((timeDiff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((timeDiff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((timeDiff % (1000 * 60)) / 1000);

    return `${days}d ${hours}h ${minutes}m ${seconds}s`;
  };

  // Refresh countdown every second
  useEffect(() => {
    const interval = setInterval(() => {
      setCountdowns((prevCountdowns) =>
        launches.reduce((acc, launch) => {
          acc[launch.id] = calculateCountdown(launch.launch_date);
          return acc;
        }, {})
      );
    }, 1000);
    return () => clearInterval(interval);
  }, [launches]);

  if (loading) return <div className="p-4 text-center text-gray-300">⏳ Loading upcoming launches...</div>;
  if (error) return <div className="p-4 text-center text-red-400">❌ {error}</div>;
  if (!launches.length) return <div className="p-4 text-center text-gray-400">No upcoming launches found.</div>;

  return (
    <div className="min-h-screen bg-gray-900 text-white p-6">
      {/* 🌟 Title Section */}
      <div className="text-center">
        <h1 className="text-3xl font-bold text-teal-400 mb-6">🚀 Upcoming Launches</h1>
        <p className="text-gray-400 text-sm">Stay updated on the latest space missions and countdown to launch! ⏳</p>
      </div>

      {/* 🚀 Launch Cards */}
      <div className="mt-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {launches.map((launch, index) => (
          <motion.div
            key={launch.id || index}
            className="bg-gray-800 p-4 rounded-lg shadow-md border border-gray-700 flex flex-col items-center text-center"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: index * 0.1 }}
          >
            {/* 🖼️ Launch Image */}
            <img
              src={launch.image_url || "/default-launch.jpg"}
              alt={launch.name}
              className="w-full h-40 object-cover rounded-md shadow-md"
            />

            {/* 📌 Launch Details */}
            <h2 className="text-xl font-semibold text-teal-300 mt-3">{launch.name}</h2>
            <p className="text-gray-400 text-sm mt-1">{launch.mission_description || "No description available"}</p>

            <div className="mt-3 text-gray-300 text-sm">
              🚀 <span className="font-medium text-[#86EED8]">{launch.rocket_name}</span>
            </div>
            <div className="text-gray-400 text-sm">
              📍 <span className="font-medium">{launch.pad_name || "Unknown pad"}</span>
            </div>

            {/* 🕒 Launch Date & Countdown */}
            <div className="text-gray-300 text-sm mt-2">
              <span className="font-medium">{new Date(launch.launch_date).toUTCString()}</span>
            </div>

            {/* ⏳ BIGGER RED Countdown */}
            <div className="text-red-500 text-5xl md:text-3xl font-bold mt-2">
               {countdowns[launch.id] }
            </div>

            {/* 🎥 Watch Live Button */}
            {launch.video_url && (
              <a
                href={launch.video_url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-4 text-blue-400 hover:text-blue-300 text-sm underline"
              >
                🎥 Watch Launch
              </a>
            )}
          </motion.div>
        ))}
      </div>
    </div>
  );
}
