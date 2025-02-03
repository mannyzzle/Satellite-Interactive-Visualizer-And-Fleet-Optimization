// src/pages/SatelliteList.jsx

import React, { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { fetchSatellites } from "../api/satelliteService";

export default function SatelliteList() {
  const [satellites, setSatellites] = useState([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const location = useLocation(); // ✅ Detects route changes

  useEffect(() => {
    console.log("🔄 Route changed, fetching satellites...");
    
    setLoading(true);
    setSatellites([]); // ✅ Clear state before new fetch

    fetchSatellites(page, 20).then((data) => {
      if (data && data.satellites) {
        setSatellites([...data.satellites]); // ✅ Ensures a proper state update
        setTotal(data.total);
      }
      setLoading(false);
    }).catch((error) => {
      console.error("❌ Fetch error:", error);
      setLoading(false);
    });
  }, [page, location.pathname]); // ✅ Re-fetch when route or page changes

  if (loading) return <p>Loading satellites...</p>;

  return (
    <div className="p-10">
      <h2 className="text-2xl font-bold mb-4">Satellites</h2>
      {satellites.length === 0 ? (
        <p className="text-gray-500">No satellites found.</p>
      ) : (
        <ul>
          {satellites.map((sat) => (
            <li key={sat.id}>
              <Link to={`/satellites/${encodeURIComponent(sat.name)}`} className="text-blue-500 hover:underline">
                {sat.name}
              </Link>
            </li>
          ))}
        </ul>
      )}

      {/* Pagination */}
      <div className="flex gap-4 mt-4">
        <button onClick={() => setPage((prev) => Math.max(prev - 1, 1))} disabled={page === 1}
          className="px-4 py-2 bg-gray-300 rounded">
          Previous
        </button>
        <span>Page {page} of {Math.ceil(total / 20)}</span>
        <button onClick={() => setPage((prev) => (prev * 20 < total ? prev + 1 : prev))}
          disabled={page * 20 >= total}
          className="px-4 py-2 bg-gray-300 rounded">
          Next
        </button>
      </div>
    </div>
  );
}
