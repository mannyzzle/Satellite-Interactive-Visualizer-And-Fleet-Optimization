import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { fetchSatelliteByName } from "../api/satelliteService";

export default function SatelliteDetails() {
  const { name } = useParams();
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
      .catch(() => {
        setError("Failed to fetch satellite.");
        setLoading(false);
      });
  }, [name]);

  if (loading) return <p>Loading satellite data...</p>;
  if (error) return <p className="text-red-500">{error}</p>;

  return (
    <div className="p-10 bg-gray-900 text-white">
      <h2 className="text-3xl font-bold">{satellite.name}</h2>
      <p><strong>NORAD Number:</strong> {satellite.norad_number}</p>
      <p><strong>Orbit Type:</strong> {satellite.orbit_type}</p>
      <p><strong>Inclination:</strong> {satellite.inclination}°</p>
      <p><strong>Velocity:</strong> {satellite.velocity} km/s</p>
      <p><strong>Latitude:</strong> {satellite.latitude.toFixed(4)}°</p>
      <p><strong>Longitude:</strong> {satellite.longitude.toFixed(4)}°</p>
      <p><strong>BStar:</strong> {satellite.bstar}</p>
      <p><strong>Rev Num:</strong> {satellite.rev_num}</p>
      <p><strong>Ephemeris Type:</strong> {satellite.ephemeris_type}</p>
      <p><strong>Eccentricity:</strong> {satellite.eccentricity}</p>
      <p><strong>Period:</strong> {satellite.period} min</p>
      <p><strong>Perigee:</strong> {satellite.perigee} km</p>
      <p><strong>Apogee:</strong> {satellite.apogee} km</p>
      <p><strong>Epoch:</strong> {satellite.epoch}</p>
      <p><strong>RAAN:</strong> {satellite.raan}</p>
      <p><strong>Arg Perigee:</strong> {satellite.arg_perigee}</p>
      <p><strong>Mean Motion:</strong> {satellite.mean_motion}</p>
      <p><strong>Semi-Major Axis:</strong> {satellite.semi_major_axis} km</p>
      <p><strong>International Designator:</strong> {satellite.intl_designator}</p>
      <p><strong>TLE Line 1:</strong> {satellite.tle_line1}</p>
      <p><strong>TLE Line 2:</strong> {satellite.tle_line2}</p>
    </div>
  );
}
