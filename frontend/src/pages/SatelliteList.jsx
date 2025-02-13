// src/pages/SatelliteList.jsx

import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { fetchSatellites } from "../api/satelliteService";

export default function SatelliteList() {
  const [satellites, setSatellites] = useState([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const limit = 100;
  const location = useLocation();

  useEffect(() => {
    setSatellites([]); // Reset satellites when navigating
    setLoading(true);
    setError(null);

    fetchSatellites(page, limit)
      .then((data) => {
        if (data && data.satellites) {
          setSatellites(data.satellites);
          setTotal(data.total);
        } else {
          setError("No satellites found.");
        }
      })
      .catch(() => setError("Failed to fetch satellites."))
      .finally(() => setLoading(false));
  }, [page, location]);

  const filteredSatellites = search
    ? satellites.filter((sat) =>
        sat.name.toLowerCase().includes(search.toLowerCase())
      )
    : satellites;

  return (
    <div className="p-6 pt-[80px] bg-gray-900 text-white min-h-screen">
      <h2 className="text-3xl font-bold mb-4">🛰️ Satellite List</h2>

      {/* 🔍 Search Bar */}
      <input
        type="text"
        placeholder="Search satellites..."
        className="w-full p-2 mb-4 text-gray-900 rounded-md"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {/* 🛑 Error Handling */}
      {error && <p className="text-red-500">{error}</p>}

      {/* ⏳ Loading State */}
      {loading && <p className="text-center text-gray-400">Loading Satellites...</p>}

      {/* 📋 Satellite List */}
      {!loading && !error && (
        <ul className="space-y-2">
          {filteredSatellites.length === 0 ? (
            <p className="text-yellow-400 font-semibold text-center">
              No satellites match your search.
            </p>
          ) : (
            filteredSatellites.map((sat) => (
              <li key={sat.id} className="border-b border-gray-700 pb-2">
                <Link
                  to={`/satellites/${encodeURIComponent(sat.name)}`}
                  className="text-blue-400 hover:text-blue-300"
                >
                  {sat.name}
                </Link>
              </li>
            ))
          )}
        </ul>
      )}

      {/* 🔄 Pagination */}
      <div className="flex justify-between items-center mt-4">
        <button
          onClick={() => setPage((prev) => Math.max(prev - 1, 1))}
          disabled={page === 1 || loading}
          className="px-4 py-2 bg-gray-700 text-white rounded-md shadow-md hover:bg-gray-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          ← Prev
        </button>

        <span className="text-gray-300">Page {page} of {Math.ceil(total / limit)}</span>

        <button
          onClick={() => setPage((prev) => (prev * limit < total ? prev + 1 : prev))}
          disabled={page * limit >= total || loading}
          className="px-4 py-2 bg-gray-700 text-white rounded-md shadow-md hover:bg-gray-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Next →
        </button>
      </div>
    </div>
  );
}
