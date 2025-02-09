// src/pages/SatelliteList.jsx

import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { fetchSatellites } from "../api/satelliteService";

export default function SatelliteList() {
  const [satellites, setSatellites] = useState([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 100;
  const location = useLocation();

  useEffect(() => {
    setSatellites([]); // 🔥 Fix Blank Issue by Resetting on Route Change
    fetchSatellites(page, limit).then((data) => {
      if (data && data.satellites) {
        setSatellites(data.satellites);
        setTotal(data.total);
      }
    });
  }, [page, location]);

  return (
    <div className="p-10">
      <h2 className="text-2xl font-bold mb-4">Satellites</h2>
      {satellites.length === 0 ? (
        <p className="text-center text-gray-500">Loading Satellites...</p>
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

      <div className="flex gap-4 mt-4">
        <button onClick={() => setPage((prev) => Math.max(prev - 1, 1))} disabled={page === 1} className="px-4 py-2 bg-gray-300 rounded">
          Previous
        </button>
        <span>Page {page} of {Math.ceil(total / limit)}</span>
        <button onClick={() => setPage((prev) => (prev * limit < total ? prev + 1 : prev))} disabled={page * limit >= total} className="px-4 py-2 bg-gray-300 rounded">
          Next
        </button>
      </div>
    </div>
  );
}
