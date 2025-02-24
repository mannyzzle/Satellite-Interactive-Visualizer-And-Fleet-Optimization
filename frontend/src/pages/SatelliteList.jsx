import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { fetchSatellites } from "../api/satelliteService";

export default function SatelliteList() {
  const [satelliteData, setSatelliteData] = useState({});
  const [categoryPages, setCategoryPages] = useState({});
  const [loading, setLoading] = useState({});
  const [error, setError] = useState({});
  const limit = 100;

  // ✅ Categories for Filtering
  const categories = {
    "🛰️ Recent Launches (Last 30 Days)": "launch_date > NOW() - INTERVAL '30 days'",
    "📡 Communications": "purpose = 'Communications'",
    "🛰️ Navigation": "purpose = 'Navigation'",
    "🌍 Earth Observation": "purpose = 'Earth Observation'",
    "🌦️ Weather Monitoring": "purpose = 'Weather Monitoring'",
    "🛡️ Military & Recon": "purpose = 'Military/Reconnaissance'",
    "🔬 Science & Research": "purpose = 'Scientific Research'",
    "🚀 Human Spaceflight": "purpose = 'Human Spaceflight'",
    "🧪 Technology Demo": "purpose = 'Technology Demonstration'",
    "🔥 High Velocity (>7.8 km/s)": "velocity > 7.8",
    "🌍 LEO (Low Earth Orbit)": "orbit_type = 'LEO'",
    "🛰️ GEO (Geostationary Orbit)": "orbit_type = 'GEO'",
    "🚀 HEO (Highly Elliptical Orbit)": "orbit_type = 'HEO'",
  };

  // ✅ Fetch Each Category Separately (Separate API Calls, 100 Each)
  useEffect(() => {
    const fetchCategoryData = async () => {
      let newSatelliteData = {};
      let newLoading = {};
      let newError = {};

      for (const [category, condition] of Object.entries(categories)) {
        newLoading[category] = true;
        setLoading((prev) => ({ ...prev, [category]: true }));

        try {
          const response = await fetchSatellites(1, limit, condition);
          if (response?.satellites) {
            newSatelliteData[category] = response.satellites.sort(
              (a, b) => new Date(b.launch_date) - new Date(a.launch_date)
            );
          } else {
            newSatelliteData[category] = [];
          }
        } catch (err) {
          console.error(`❌ API Fetch Error for ${category}:`, err);
          newError[category] = "Failed to fetch satellites.";
        } finally {
          newLoading[category] = false;
        }
      }

      setSatelliteData(newSatelliteData);
      setLoading(newLoading);
      setError(newError);

      // ✅ Initialize pagination state for each category
      setCategoryPages(
        Object.keys(newSatelliteData).reduce((acc, key) => {
          acc[key] = 1;
          return acc;
        }, {})
      );
    };

    fetchCategoryData();
  }, []);

  // ✅ Handle Pagination for Each Category
  const changeCategoryPage = (category, newPage) => {
    setCategoryPages((prev) => ({ ...prev, [category]: newPage }));
  };

  return (
    <div className="p-6 pt-[80px] bg-gray-900 text-white min-h-screen">
      <h2 className="text-3xl font-bold mb-6 text-center">🛰️ Satellite Categories</h2>

      {/* 🛰️ Render Each Category in a Section */}
      {Object.entries(categories).map(([category, _]) => {
        const page = categoryPages[category] || 1;
        const totalPages = Math.ceil((satelliteData[category]?.length || 0) / 10);
        const displayedSatellites = satelliteData[category]?.slice((page - 1) * 10, page * 10) || [];

        return (
          <div key={category} className="mb-12">
            {/* 📌 Category Title */}
            <h3 className="text-lg font-semibold text-green-400 border-b border-gray-700 pb-2 mb-2">
              {category}
            </h3>

            {/* 🔄 Show Loading State */}
            {loading[category] && <p className="text-center text-gray-400">Loading {category}...</p>}
            {error[category] && <p className="text-red-500">{error[category]}</p>}

            {/* 📋 Satellite List (8x8 Grid - Fully Utilizing Screen Space) */}
            <ul className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 gap-2">
              {displayedSatellites.map((sat) => (
                <li
                  key={sat.id}
                  className="bg-gray-800 p-2 rounded-md text-center border border-gray-700 shadow-sm text-xs"
                >
                  <Link
                    to={`/satellites/${encodeURIComponent(sat.name)}`}
                    className="text-blue-400 hover:text-blue-300"
                  >
                    {sat.name}
                  </Link>
                  <p className="text-xs text-gray-400 mt-1">
                    🚀 {sat.launch_date ? new Date(sat.launch_date).toLocaleDateString() : "Unknown"}
                  </p>
                </li>
              ))}
            </ul>

            {/* 🔄 Pagination Controls */}
            {totalPages > 1 && (
              <div className="flex justify-between items-center mt-4 border-t border-gray-700 pt-3">
                <button
                  onClick={() => changeCategoryPage(category, page - 1)}
                  disabled={page === 1}
                  className="px-4 py-2 bg-gray-700 text-white rounded-md shadow-md hover:bg-gray-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  ← Prev
                </button>

                <span className="text-gray-300">
                  Page {page} of {totalPages}
                </span>

                <button
                  onClick={() => changeCategoryPage(category, page + 1)}
                  disabled={page >= totalPages}
                  className="px-4 py-2 bg-gray-700 text-white rounded-md shadow-md hover:bg-gray-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Next →
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
