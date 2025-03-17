import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { fetchSatelliteByName, fetchHistoricalTLEs } from "../api/satelliteService";
import * as satellite from "satellite.js";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { Switch } from "@mui/material";

export default function SatelliteDetails() {
  const { name } = useParams();
  const navigate = useNavigate();
  const [satelliteData, setSatelliteData] = useState(null);
  const [historicalTLEs, setHistoricalTLEs] = useState([]);
  const [error, setError] = useState(null);
  const [chartData, setChartData] = useState([]);
  const [liveTracking, setLiveTracking] = useState(false);
  // ✅ Process min/max values before rendering the charts
  const altitudes = chartData.map(d => parseFloat(d.altitude));
  const velocities = chartData.map(d => parseFloat(d.velocity));
  const bstars = chartData.map(d => parseFloat(d.bstar));

  const minAltitude = Math.min(...altitudes);
  const maxAltitude = Math.max(...altitudes);
  const minVelocity = Math.min(...velocities);
  const maxVelocity = Math.max(...velocities);
  const minBstar = Math.min(...bstars);
  const maxBstar = Math.max(...bstars);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const satData = await fetchSatelliteByName(name);
        if (!satData) throw new Error(`Satellite "${name}" not found.`);
        setSatelliteData(satData);

        const tleData = await fetchHistoricalTLEs(satData.norad_number);
        if (!tleData || tleData.historical_tles.length === 0) throw new Error("No TLE data found.");
        setHistoricalTLEs(tleData.historical_tles);

        const processedData = tleData.historical_tles.map(({ epoch, tle_line1, tle_line2 }) => {
          if (!tle_line1 || !tle_line2) return null;
          const satrec = satellite.twoline2satrec(tle_line1, tle_line2);
          if (!satrec) return null;

          const date = new Date(epoch);
          const positionAndVelocity = satellite.propagate(satrec, date);
          if (!positionAndVelocity || !positionAndVelocity.position) return null;

          const { position, velocity } = positionAndVelocity;
          const altitude = Math.sqrt(position.x ** 2 + position.y ** 2 + position.z ** 2) - 6378.137;

          return {
            epoch: date.toISOString().split("T")[0],
            altitude: altitude.toFixed(2),
            velocity: Math.sqrt(velocity.x ** 2 + velocity.y ** 2 + velocity.z ** 2).toFixed(3),
            bstar: satrec.bstar.toExponential(2),
          };
        }).filter(Boolean);

        setChartData(processedData);
      } catch (err) {
        setError(err.message);
      }
    };

    fetchData();
  }, [name]);

  if (error) return <div className="text-red-500 text-center mt-24">{error}</div>;
  if (!satelliteData) return <div className="text-gray-400 text-center mt-24">Loading...</div>;

  return (
    <div className="p-6 bg-gray-900 text-white min-h-screen pt-[120px]">
      {/* Back Button */}
      <button onClick={() => navigate("/satellites")} className="mb-6 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-500">
        ← Back to List
      </button>


      {/* Title Section */}
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-3xl font-bold text-yellow-400">{satelliteData.name}</h2>
        <div className="flex items-center space-x-3">
          <span className="text-gray-300">Live Tracking:</span>
          <Switch
            checked={liveTracking}
            onChange={() => setLiveTracking(!liveTracking)}
            color="success"
          />
        </div>
      </div>
      
      <p className="text-gray-400">NORAD ID: {satelliteData.norad_number}</p>

      {/* Orbit Details Panel */}
      <div className="mt-6 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
        {[
          { label: "🛰️ Orbit Type", value: satelliteData.orbit_type },
          { label: "📍 Inclination", value: `${satelliteData.inclination}°` },
          { label: "🔄 Mean Motion", value: satelliteData.mean_motion },
          { label: "🌍 Semi-Major Axis", value: `${satelliteData.semi_major_axis} km` },
          { label: "📈 Perigee", value: `${satelliteData.perigee} km` },
          { label: "📉 Apogee", value: `${satelliteData.apogee} km` },
          { label: "📐 Arg of Perigee", value: `${satelliteData.arg_perigee}°` },
          { label: "📡 RA of Ascending Node", value: `${satelliteData.raan}°` },
        ].map((item, index) => (
          <div key={index} className="bg-gray-800 p-4 rounded-lg shadow-md">
            <h3 className="text-lg font-semibold text-teal-300">{item.label}</h3>
            <p>{item.value}</p>
          </div>
        ))}
      </div>

      {/*  // ✅ Altitude & Velocity Chart (More Zoomed-In) */}
  <div className="mt-8">
    <h3 className="text-lg font-semibold text-teal-300">Altitude & Velocity Over Time</h3>
    <ResponsiveContainer width="100%" height={350}>
      <LineChart data={chartData}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="epoch" />
        <YAxis yAxisId="left" domain={[minAltitude - 5, maxAltitude + 5]} label={{ value: "Altitude (km)", angle: -90, position: "insideLeft" }} />
        <YAxis yAxisId="right" orientation="right" domain={[minVelocity - 0.5, maxVelocity + 0.5]} label={{ value: "Velocity (km/s)", angle: 90, position: "insideRight" }} />
        <Tooltip contentStyle={{ backgroundColor: "#222", borderRadius: "8px", color: "#fff" }} />
        <Legend />
        <Line yAxisId="left" type="monotone" dataKey="altitude" stroke="#86EED8" strokeWidth={2} />
        <Line yAxisId="right" type="monotone" dataKey="velocity" stroke="#FFA500" strokeWidth={2} />
      </LineChart>
    </ResponsiveContainer>
  </div>

  {/* Bstar Drag Term Chart (Always Fully Visible) */}
  <div className="mt-6">
    <h3 className="text-lg font-semibold text-teal-300">Bstar Drag Term Over Time</h3>
    <ResponsiveContainer width="100%" height={350}>
      <LineChart data={chartData}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="epoch" />
        <YAxis domain={[minBstar - Math.abs(minBstar * 0.2), maxBstar + Math.abs(maxBstar * 0.2)]} label={{ value: "Bstar", angle: -90, position: "insideLeft" }} />
        <Tooltip contentStyle={{ backgroundColor: "#222", borderRadius: "8px", color: "#fff" }} />
        <Line type="monotone" dataKey="bstar" stroke="#FF4500" strokeWidth={2} />
      </LineChart>
    </ResponsiveContainer>
  </div>


      {/* Historical TLE Table */}
      <div className="mt-8">
        <h3 className="text-lg font-semibold text-teal-300">📜 Historical TLE Data</h3>
        <div className="overflow-x-auto">
          <table className="min-w-full bg-gray-800 rounded-lg">
            <thead className="bg-gray-700 text-teal-300">
              <tr>
                <th className="p-3">Epoch</th>
                <th className="p-3">TLE Line 1</th>
                <th className="p-3">TLE Line 2</th>
              </tr>
            </thead>
            <tbody>
              {historicalTLEs.map((tle, index) => (
                <tr key={index} className="border-t border-gray-600">
                  <td className="p-3">{tle.epoch}</td>
                  <td className="p-3">{tle.tle_line1}</td>
                  <td className="p-3">{tle.tle_line2}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
