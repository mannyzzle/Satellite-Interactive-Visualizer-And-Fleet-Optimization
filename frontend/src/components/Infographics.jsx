import React, { useEffect, useState, useMemo } from "react";
import { motion } from "framer-motion";
import { Rocket, MapPin, Clock, Video, Loader2, AlertCircle } from "lucide-react";
import { LAUNCHES_API } from "../config";


const Infographics = () => {
  const [launches, setLaunches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Stable starfield — generating 150 motion.divs on every render caused
  // background twinkling jitter; same fix as SatelliteCounter.
  const stars = useMemo(() => generateStars(150), []);

  


  useEffect(() => {
    const fetchLaunches = async () => {
      try {
        const response = await fetch(`${LAUNCHES_API}/previous`);
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

  if (loading)
    return (
      <div className="p-6 flex items-center justify-center gap-2 text-gray-300">
        <Loader2 size={18} className="animate-spin text-teal-300" />
        Loading latest launches…
      </div>
    );
  if (error)
    return (
      <div className="p-6 flex items-center justify-center gap-2 text-red-400">
        <AlertCircle size={18} />
        Failed to load launches. Try again later.
      </div>
    );
  if (!launches.length) return <div className="p-4 text-center text-gray-400">No recent launches available.</div>;

  return (
    <div className="w-full bg-[rgba(3, 0, 8, 0.85)] rounded-lg py-10 relative">
      
      {/* Starry background — memoized to prevent re-render jitter */}
      <div className="absolute w-full h-full overflow-hidden pointer-events-none">
        {stars}
      </div>

      {/* Section header — minimalist, no decorative side-lines, with a small
          eyebrow label tying it to the rest of the modern chrome. */}
      <div className="text-center px-6 mb-8">
        <div className="text-[10px] font-mono uppercase tracking-[0.3em] text-teal-300/80 mb-2">
          Recent activity
        </div>
        <h3 className="text-2xl sm:text-3xl font-semibold text-white">
          Latest Launches
        </h3>
      </div>

      {/* Launch cards — modern translucent chrome matching the sidebar. */}
      <div className="mt-2 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 px-6">
        {launches.map((launch, index) => (
          <motion.div
            key={launch.id || index}
            className="group p-5 flex flex-col items-center text-center
                       bg-gray-900/85 backdrop-blur-xl border border-gray-700/60
                       rounded-xl shadow-lg
                       hover:border-teal-400/50 hover:ring-1 hover:ring-teal-400/20
                       transition-colors"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: index * 0.1 }}
          >
            <img
              src={launch.image_url || "/default-launch.jpg"}
              alt={launch.name}
              loading="lazy"
              className="w-full h-40 object-cover rounded-md bg-gray-800"
            />

            <h4 className="text-lg font-semibold text-white mt-3">{launch.name}</h4>
            <p className="text-gray-400 text-sm mt-1">{launch.mission_description || "No description available"}</p>

            <div className="mt-3 flex items-center gap-1.5 text-sm text-gray-300">
              <Rocket size={14} className="text-[#86EED8] shrink-0" />
              <span className="font-medium text-[#86EED8]">{launch.rocket_name}</span>
            </div>
            <div className="flex items-center gap-1.5 text-sm text-gray-400">
              <MapPin size={14} className="shrink-0" />
              <span className="font-medium">{launch.pad_name || "Unknown pad"}</span>
            </div>

            <div className="mt-2 flex items-center gap-1.5 text-sm text-gray-300">
              <Clock size={14} className="shrink-0" />
              <span className="font-medium">{formatDateTime(launch.launch_date)}</span>
            </div>

            {/* Status pill — translucent and color-coordinated with the
                rest of the teal/dark palette instead of stoplight bg-{green,red,yellow}-600. */}
            <div className={`mt-2 px-2.5 py-0.5 rounded-full text-xs font-medium border ${
              launch.launch_status === "Success"
                ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"
                : launch.launch_status === "Failure"
                ? "bg-rose-500/15 text-rose-300 border-rose-500/30"
                : "bg-amber-500/15 text-amber-300 border-amber-500/30"
            }`}>
              {launch.launch_status}
            </div>

            {launch.video_url && (
              <a
                href={launch.video_url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 inline-flex items-center gap-1.5 text-blue-400 hover:text-blue-300 text-sm"
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
