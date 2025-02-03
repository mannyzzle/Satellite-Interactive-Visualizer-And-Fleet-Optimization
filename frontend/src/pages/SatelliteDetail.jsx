import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { fetchSatelliteByName } from "../api/satelliteService";

export default function SatelliteDetails() {
  const { name } = useParams(); // Get satellite name from URL
  const [satellite, setSatellite] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchSatelliteByName(decodeURIComponent(name))
      .then((data) => {
        if (data) {
          setSatellite(data);
        } else {
          setError("Satellite not found.");
        }
        setLoading(false);
      })
      .catch((err) => {
        setError("Failed to fetch satellite.");
        setLoading(false);
      });
  }, [name]);

  if (loading) return <p>Loading satellite data...</p>;
  if (error) return <p className="text-red-500">{error}</p>;

  return (
    <div className="p-10">
      <h2 className="text-3xl font-bold">{satellite.name}</h2>
      <p><strong>NORAD Number:</strong> {satellite.norad_number}</p>
      <p><strong>Orbit Type:</strong> {satellite.orbit_type}</p>
      <p><strong>Inclination:</strong> {satellite.inclination}°</p>
      <p><strong>Velocity:</strong> {satellite.velocity} km/s</p>
      <p><strong>Latitude:</strong> {satellite.latitude ? satellite.latitude.toFixed(4) : "N/A"}°</p>
      <p><strong>Longitude:</strong> {satellite.longitude ? satellite.longitude.toFixed(4) : "N/A"}°</p>
    </div>
  );
}
