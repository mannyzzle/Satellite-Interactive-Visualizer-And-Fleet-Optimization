import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { fetchSatelliteByName } from "../api/satelliteService";

export default function SatelliteDetails() {
  const { name } = useParams();
  const navigate = useNavigate();
  const [satellite, setSatellite] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      console.log(`🔍 Fetching details for: ${name}`);
      const data = await fetchSatelliteByName(decodeURIComponent(name));

      if (!data) {
        setError(`Satellite "${name}" not found.`);
        setLoading(false);
        return;
      }

      setSatellite(data);
      setLoading(false);
    };

    fetchData();
  }, [name]);

  if (loading) return <p className="text-center text-gray-400">Loading satellite data...</p>;

  if (error)
    return (
      <div className="p-6 text-center text-red-500">
        ❌ {error}
        <button
          onClick={() => navigate("/satellites")}
          className="block mt-4 px-4 py-2 bg-gray-700 text-white rounded-md hover:bg-gray-600"
        >
          ← Back to List
        </button>
      </div>
    );

  return (
    <div className="p-6 bg-gray-900 text-white min-h-screen">
      <h2 className="text-3xl font-bold">{satellite.name}</h2>
      <p className="text-gray-400">NORAD Number: {satellite.norad_number}</p>
      <p className="text-gray-400">Orbit Type: {satellite.orbit_type}</p>
      <p className="text-gray-400">Inclination: {satellite.inclination}°</p>
      <p className="text-gray-400">Velocity: {satellite.velocity.toFixed(3)} km/s</p>
      <p className="text-gray-400">Latitude: {satellite.latitude.toFixed(4)}°</p>
      <p className="text-gray-400">Longitude: {satellite.longitude.toFixed(4)}°</p>

      <button
        onClick={() => navigate("/satellites")}
        className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-500"
      >
        ← Back to List
      </button>
    </div>
  );
}
