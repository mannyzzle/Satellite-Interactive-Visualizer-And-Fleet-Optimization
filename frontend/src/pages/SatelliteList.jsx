import { useEffect, useState } from "react";
import { fetchSatellites } from "../api/satelliteService";
import { Link } from "react-router-dom";

export default function SatelliteList() {
  const [satelliteData, setSatelliteData] = useState({});
  const [loadingCategories, setLoadingCategories] = useState({});
  const [error, setError] = useState(null);
  const limit = 1000; // Fetch 100 per category but show 8 at a time

  const categories = [
    // 🌍 Orbital Regions
    { name: "LEO", label: "Low Earth Orbit (LEO)", description: "Satellites in Low Earth Orbit (LEO) operate between 160km and 2,000km above Earth. They are commonly used for communications, imaging, and scientific missions." },
    { name: "MEO", label: "Medium Earth Orbit (MEO)", description: "Satellites in Medium Earth Orbit (MEO) reside between LEO and GEO, typically used for navigation and communications, like GPS satellites." },
    { name: "GEO", label: "Geostationary Orbit (GEO)", description: "Geostationary satellites maintain a fixed position above the equator at 35,786 km. They are widely used for weather monitoring and global communications." },
    { name: "HEO", label: "Highly Elliptical Orbit (HEO)", description: "Satellites in Highly Elliptical Orbit (HEO) follow elongated paths, useful for long-duration coverage over specific areas." },

    // 🚀 Velocity Filters
    { name: "High Velocity", label: "Fast Satellites", description: "Satellites moving faster than 7.8 km/s, typically in lower orbits where high speeds are required to maintain trajectory." },
    { name: "Low Velocity", label: "Slow Satellites", description: "Satellites with speeds at or below 7.8 km/s, often in higher orbits where slower movement balances gravitational pull." },

    // 📅 Launch & Decay Filters
    { name: "Recent Launches", label: "Recently Launched Satellites", description: "Track satellites launched within the last 30 days, highlighting the newest additions to Earth's orbital environment." },
    { name: "Decaying", label: "Decayed Satellites", description: "Satellites that have re-entered Earth's atmosphere or are no longer operational." },

    // 🛰️ Purpose Filters
    { name: "Communications", label: "Communications Satellites", description: "Satellites used for telecommunication services, internet connectivity, and data transmission across the globe." },
    { name: "Navigation", label: "Navigation Satellites", description: "Essential for GPS, GLONASS, Galileo, and BeiDou systems that provide global positioning services." },
    { name: "Military/Reconnaissance", label: "Military & Reconnaissance", description: "Satellites used for national security, surveillance, and defense-related intelligence gathering." },
    { name: "Weather Monitoring", label: "Weather Monitoring", description: "Satellites dedicated to climate monitoring, storm tracking, and atmospheric analysis." },
    { name: "Earth Observation", label: "Earth Observation Satellites", description: "Used for imaging, environmental monitoring, and mapping Earth's surface in high resolution." },
    { name: "Scientific Research", label: "Scientific Research Satellites", description: "Satellites supporting space-based experiments, astrophysics, and planetary studies." },
    { name: "Human Spaceflight", label: "Human Spaceflight Missions", description: "Satellites or modules supporting human space exploration and operations, such as the ISS." },
    { name: "Technology Demonstration", label: "Technology Demonstration", description: "Experimental satellites designed to test new technologies before full-scale deployment." },
    { name: "Space Infrastructure", label: "Space Infrastructure", description: "Satellites designed to support in-orbit services, assembly, and station-keeping activities." },
    { name: "Satellite Servicing & Logistics", label: "Satellite Servicing & Logistics", description: "Satellites used for refueling, maintenance, and in-orbit repairs of other spacecraft." },
    { name: "Starlink Constellation", label: "Starlink Constellation", description: "Satellites forming SpaceX’s broadband internet constellation in Low Earth Orbit." },
    { name: "OneWeb Constellation", label: "OneWeb Constellation", description: "A global satellite internet constellation designed to provide broadband connectivity." },
    { name: "Iridium NEXT Constellation", label: "Iridium NEXT Constellation", description: "A network of satellites providing worldwide voice and data communication services." },
    { name: "Deep Space Exploration", label: "Deep Space Exploration", description: "Satellites and probes designed for interplanetary missions and deep space studies." },
    { name: "Space Debris", label: "Space Debris", description: "Non-functional satellites, defunct spacecraft, and debris fragments in Earth's orbit." },
    { name: "Rocket Body (Debris)", label: "Rocket Body Debris", description: "Spent rocket stages and launcher components left in orbit after satellite deployments." },
    { name: "Unknown", label: "Unknown Purpose", description: "Satellites with unspecified or undisclosed mission purposes." }
];

  const [pageNumbers, setPageNumbers] = useState({});

  useEffect(() => {
    setError(null);

    const fetchData = async () => {
      for (const category of categories) {
        if (!satelliteData[category.name]) {
          setLoadingCategories(prev => ({ ...prev, [category.name]: true }));
          try {
            const response = await fetchSatellites(1, limit, category.name);
            if (response?.satellites) {
              setSatelliteData(prev => ({
                ...prev,
                [category.name]: response.satellites
              }));
            } else {
              setSatelliteData(prev => ({ ...prev, [category.name]: [] }));
            }
          } catch (err) {
            console.error(`❌ Error fetching ${category.name} satellites:`, err);
            setError("Failed to fetch satellite data.");
          } finally {
            setLoadingCategories(prev => ({ ...prev, [category.name]: false }));
          }
        }
      }
    };

    fetchData();
  }, []);

  const handlePageChange = (category, newPage) => {
    setPageNumbers(prev => ({ ...prev, [category]: newPage }));
  };

  return (
    <div className="p-6 pt-[80px] bg-gray-900 text-white min-h-screen">
      {/* 🔹 Animated Title - Now More Immediate & Relevant */}
      <div className="text-center mb-10">
        <h1 className="text-4xl md:text-5xl font-bold text-white tracking-wide">
           Satellite Launches
        </h1>
        <p className="text-gray-400 text-lg mt-2">
          Track all the satellites launched into orbit.
        </p>
      </div>

      {error && <p className="text-red-500 text-center">{error}</p>}

      {/* 📌 Categories Layout - Multi-Column Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
        {categories.map(category => {
          const satellites = satelliteData[category.name] || [];
          const page = pageNumbers[category.name] || 1;
          const paginatedSatellites = satellites.slice((page - 1) * 8, page * 8);
          const totalPages = Math.ceil(satellites.length / 8);

          return (
            <div key={category.name} className="bg-gray-800 p-6 rounded-lg shadow-lg flex flex-col">
              {/* 📌 Category Title & Description */}
              <h3 className="text-lg font-semibold text-green-400 mb-1 text-center">
                {category.label} ({satellites.length} total)
              </h3>
              <p className="text-gray-300 text-xs mb-3 text-center">
                {category.description}
              </p>

              {loadingCategories[category.name] && satellites.length === 0 ? (
                <p className="text-yellow-400 text-center">Loading...</p>
              ) : paginatedSatellites.length === 0 ? (
                <p className="text-yellow-400 text-center">No satellites found.</p>
              ) : (
                <div className="grid grid-cols-4 gap-3">
                  {paginatedSatellites.map(sat => (
                    <div
                      key={sat.norad_number}
                      className="p-3 bg-gray-700 rounded-lg text-center text-xs 
                        border border-gray-600 hover:bg-gray-600 transition-all flex flex-col justify-between"
                      style={{ minHeight: "120px" }} // Ensures all boxes are same height
                    >
                      <Link to={`/satellites/${encodeURIComponent(sat.name)}`} className="text-blue-300 hover:text-blue-200 font-medium">
                        {sat.name}
                      </Link>
                      <p className="text-gray-300 text-xs mt-1">NORAD: {sat.norad_number}</p>
                      <p className="text-gray-400 text-xs">{sat.launch_date ? new Date(sat.launch_date).toLocaleDateString() : "N/A"}</p>
                    </div>
                  ))}
                </div>
              )}



              {totalPages > 1 && (
                <div className="flex justify-between items-center mt-4">
                  <button
                    onClick={() => handlePageChange(category.name, page - 1)}
                    disabled={page === 1}
                    className="px-3 py-1 bg-gray-700 text-white rounded-md text-xs shadow-md hover:bg-gray-600 
                      transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    ← Prev
                  </button>

                  <span className="text-gray-300 text-xs">Page {page} of {totalPages}</span>

                  <button
                    onClick={() => handlePageChange(category.name, page + 1)}
                    disabled={page >= totalPages}
                    className="px-3 py-1 bg-gray-700 text-white rounded-md text-xs shadow-md hover:bg-gray-600 
                      transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Next →
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
