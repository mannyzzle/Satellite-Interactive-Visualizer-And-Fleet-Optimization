import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { Rocket, MapPin, Video, Loader2, AlertCircle } from "lucide-react";
import { StarField } from "../components/StarField";
import { LAUNCHES_API } from "../config";

// Leaf component: each card owns its own 1Hz tick. Avoids re-rendering the
// parent list (and all its motion.divs) once per second — the previous
// pattern called setCountdowns({...}) on the parent every 1000ms. Exported
// for unit testing.
export function Countdown({ launchDate }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!launchDate) {
      if (ref.current) ref.current.textContent = "🚀 Launched!";
      return;
    }
    const target = new Date(launchDate).getTime();
    const tick = () => {
      const diff = target - Date.now();
      if (diff <= 0) {
        if (ref.current) ref.current.textContent = "🚀 Launched!";
        return false;
      }
      const days = Math.floor(diff / 86_400_000);
      const hours = Math.floor((diff % 86_400_000) / 3_600_000);
      const minutes = Math.floor((diff % 3_600_000) / 60_000);
      const seconds = Math.floor((diff % 60_000) / 1000);
      if (ref.current) {
        ref.current.textContent = `${days}d ${hours}h ${minutes}m ${seconds}s`;
      }
      return true;
    };
    tick();
    const id = setInterval(() => {
      if (!tick()) clearInterval(id);
    }, 1000);
    return () => clearInterval(id);
  }, [launchDate]);

  return (
    <div
      ref={ref}
      className="text-amber-300 text-3xl md:text-2xl font-semibold mt-2 tracking-wider tabular-nums"
    />
  );
}

export default function Launches() {
  const [launches, setLaunches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function fetchLaunches() {
      try {
        const response = await fetch(`${LAUNCHES_API}/upcoming`);
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

  if (loading)
    return (
      <div className="p-6 flex items-center justify-center gap-2 text-gray-300">
        <Loader2 size={18} className="animate-spin text-teal-300" />
        Loading upcoming launches…
      </div>
    );
  if (error)
    return (
      <div className="p-6 flex items-center justify-center gap-2 text-red-400">
        <AlertCircle size={18} />
        {error}
      </div>
    );
  if (!launches.length) return <div className="p-4 text-center text-gray-400">No upcoming launches found.</div>;

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#050716] via-[#1B1E3D] to-[#2E4867] text-white p-6 pt-[120px]">
         <div className="absolute w-full h-full overflow-hidden pointer-events-none">
         <StarField numStars={150} />
                </div>
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

            <div className="mt-3 flex items-center gap-1.5 text-sm text-gray-300">
              <Rocket size={14} className="text-[#86EED8] shrink-0" />
              <span className="font-medium text-[#86EED8]">{launch.rocket_name}</span>
            </div>
            <div className="flex items-center gap-1.5 text-sm text-gray-400">
              <MapPin size={14} className="shrink-0" />
              <span className="font-medium">{launch.pad_name || "Unknown pad"}</span>
            </div>

            <div className="text-gray-300 text-sm mt-2">
              <span className="font-medium">{new Date(launch.launch_date).toUTCString()}</span>
            </div>

            {/* Per-card countdown component owns its own 1Hz tick. Big +
                tabular-nums so digit-width changes don't jiggle. */}
            <Countdown launchDate={launch.launch_date} />

            {launch.video_url && (
              <a
                href={launch.video_url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-4 inline-flex items-center gap-1.5 text-blue-400 hover:text-blue-300 text-sm"
              >
                <Video size={14} />
                <span className="underline">Watch Launch</span>
              </a>
            )}
          </motion.div>
        ))}
      </div>
    </div>
  );
}
