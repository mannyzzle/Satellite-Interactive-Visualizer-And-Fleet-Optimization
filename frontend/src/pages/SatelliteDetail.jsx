import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { fetchSatelliteByName } from "../api/satelliteService";

export default function SatelliteDetails() {
  const { name } = useParams();
  const navigate = useNavigate();
  const [satellite, setSatellite] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Country Flag Mapping
  const countryFlags = {
    "US": { name: "USA", flag: "🇺🇸" },
    "PRC": { name: "China", flag: "🇨🇳" },
    "UK": { name: "United Kingdom", flag: "🇬🇧" },
    "CIS": { name: "CIS (Former USSR)", flag: "🇷🇺" },
    "JPN": { name: "Japan", flag: "🇯🇵" },
    "IND": { name: "India", flag: "🇮🇳" },
    "ESA": { name: "European Space Agency", flag: "🇪🇺" },
    "FR": { name: "France", flag: "🇫🇷" },
    "SES": { name: "SES (Luxembourg)", flag: "🇱🇺" },
    "CA": { name: "Canada", flag: "🇨🇦" },
    "GER": { name: "Germany", flag: "🇩🇪" },
    "SKOR": { name: "South Korea", flag: "🇰🇷" },
    "IT": { name: "Italy", flag: "🇮🇹" },
    "SPN": { name: "Spain", flag: "🇪🇸" },
    "ARGN": { name: "Argentina", flag: "🇦🇷" },
    "TURK": { name: "Turkey", flag: "🇹🇷" },
    "BRAZ": { name: "Brazil", flag: "🇧🇷" },
    "NOR": { name: "Norway", flag: "🇳🇴" },
    "UAE": { name: "UAE", flag: "🇦🇪" },
    "ISRA": { name: "Israel", flag: "🇮🇱" },
    "TWN": { name: "Taiwan", flag: "🇹🇼" },
    "IRAN": { name: "Iran", flag: "🇮🇷" },
    "BEL": { name: "Belgium", flag: "🇧🇪" },
    "ISS": { name: "ISS (International Space Station)", flag: "🚀" }
  };

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

  if (loading) return <p className="text-center text-gray-400 mt-20">Loading satellite data...</p>;

  if (error)
    return (
      <div className="p-6 text-center text-red-500 mt-20">
        ❌ {error}
        <button
          onClick={() => navigate("/satellites")}
          className="block mt-4 px-4 py-2 bg-gray-700 text-white rounded-md hover:bg-gray-600"
        >
          ← Back to List
        </button>
      </div>
    );

  const copyTLE = () => {
    navigator.clipboard.writeText(`${satellite.tle_line1}\n${satellite.tle_line2}`);
    alert("TLE Data copied to clipboard!");
  };

  return (
    <div className="flex flex-col min-h-screen">
    <div className="p-6 pt-[80px] bg-gray-900 text-white min-h-screen flex flex-col justify-between">

      {/* 🔥 Title & Key Info */}
      <div className="flex flex-col md:flex-row justify-between items-center mb-8">
        <h2 className="text-3xl font-bold text-yellow-400">{satellite.name}</h2>
        <span className="text-lg bg-gray-700 px-3 py-1 rounded-md">
          NORAD ID: {satellite.norad_number}
        </span>
      </div>

      {/* 🌍 Orbit Details */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-16">
        <div><h3 className="text-lg font-semibold">Orbit Type:</h3><span className="text-yellow-400">{satellite.orbit_type}</span></div>
        <div><h3 className="text-lg font-semibold">Velocity:</h3><span className="text-green-400">{satellite.velocity.toFixed(3)} km/s</span></div>
        <div><h3 className="text-lg font-semibold">Inclination:</h3><span>{satellite.inclination}°</span></div>
        <div><h3 className="text-lg font-semibold">Perigee:</h3><span>{satellite.perigee} km</span></div>
        <div><h3 className="text-lg font-semibold">Apogee:</h3><span>{satellite.apogee} km</span></div>
        <div><h3 className="text-lg font-semibold">Eccentricity:</h3><span>{satellite.eccentricity.toFixed(4)}</span></div>
      </div>

      {/* 🛰️ More Satellite Details */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-16 mt-8">
        <div><h3 className="text-lg font-semibold">Country:</h3><span>{countryFlags[satellite.country]?.flag || "🌍"} {countryFlags[satellite.country]?.name || satellite.country}</span></div>
        <div><h3 className="text-lg font-semibold">Launch Date:</h3><span>{satellite.launch_date ? new Date(satellite.launch_date).toLocaleDateString() : "N/A"}</span></div>
        <div><h3 className="text-lg font-semibold">Decay Date:</h3><span>{satellite.decay_date ? new Date(satellite.decay_date).toLocaleDateString() : "N/A"}</span></div>
        <div><h3 className="text-lg font-semibold">Mean Motion:</h3><span>{satellite.mean_motion}</span></div>
        <div><h3 className="text-lg font-semibold">Semi-Major Axis:</h3><span>{satellite.semi_major_axis} km</span></div>
        <div><h3 className="text-lg font-semibold">Purpose:</h3><span>{satellite.purpose || "Unknown"}</span></div>
      </div>

      {/* 📜 TLE Data */}
      <div className="mt-8 p-4 bg-gray-800 rounded-md shadow-md">
        <h3 className="text-lg font-semibold">TLE Data:</h3>
        <pre className="text-sm bg-gray-700 p-3 rounded-md overflow-auto">{satellite.tle_line1}{"\n"}{satellite.tle_line2}</pre>
        <button onClick={copyTLE} className="mt-3 px-4 py-2 bg-blue-500 hover:bg-blue-400 text-white rounded-md">
          📋 Copy TLE Data
        </button>
      </div>

      {/* 🔙 Back Button */}
      <div className="flex justify-center mt-8">
        <button onClick={() => navigate("/satellites")} className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-500">
          ← Back to List
        </button>
      </div>
  </div>
</div>

  );
}
