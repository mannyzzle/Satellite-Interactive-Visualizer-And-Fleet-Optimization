import React, { useEffect, useState } from "react";
import { fetchSatellites } from "../api/satelliteService";

export default function SatelliteList() {
  const [satellites, setSatellites] = useState([]);

  useEffect(() => {
    fetchSatellites().then(setSatellites);
  }, []);

  return (
    <div className="text-white">
      <h2 className="text-2xl font-bold mb-4">Satellites</h2>
      <ul>
        {satellites.map((sat) => (
          <li key={sat.norad_number}>{sat.name}</li>
        ))}
      </ul>
    </div>
  );
}
