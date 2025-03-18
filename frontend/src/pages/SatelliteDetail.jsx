import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { fetchSatelliteByName, fetchHistoricalTLEs } from "../api/satelliteService";
import * as satellite from "satellite.js";
import { generateStars } from "./Home";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend
} from "recharts";
import { Switch } from "@mui/material";

export default function SatelliteDetails() {
  const { name } = useParams();
  const navigate = useNavigate();

  const [satelliteData, setSatelliteData] = useState(null);
  const [historicalTLEs, setHistoricalTLEs] = useState([]);
  const [chartData, setChartData] = useState([]);
  const [error, setError] = useState(null);
  const [liveTracking, setLiveTracking] = useState(false);

  // On mount, fetch the satellite + TLE data and process for charts
  useEffect(() => {
    const fetchData = async () => {
      try {
        const satData = await fetchSatelliteByName(name);
        if (!satData) throw new Error(`Satellite "${name}" not found.`);
        setSatelliteData(satData);

        const tleData = await fetchHistoricalTLEs(satData.norad_number);
        if (!tleData || !tleData.historical_tles.length) {
          throw new Error("No TLE data found.");
        }
        setHistoricalTLEs(tleData.historical_tles);

        // Process TLEs for altitude/velocity/bstar
        const processed = tleData.historical_tles.map(({ epoch, tle_line1, tle_line2 }) => {
          if (!tle_line1 || !tle_line2) return null;
          const satrec = satellite.twoline2satrec(tle_line1, tle_line2);
          if (!satrec) return null;

          const dateObj = new Date(epoch);
          const positionAndVelocity = satellite.propagate(satrec, dateObj);
          if (!positionAndVelocity || !positionAndVelocity.position) return null;

          const { position, velocity } = positionAndVelocity;
          const altitudeKm =
            Math.sqrt(position.x**2 + position.y**2 + position.z**2) - 6378.137;

          return {
            epoch: dateObj.toISOString().split("T")[0],
            altitude: Number(altitudeKm.toFixed(2)),
            velocity: Number(Math.sqrt(
              velocity.x**2 + velocity.y**2 + velocity.z**2
            ).toFixed(3)),
            bstar: Number(satrec.bstar.toExponential(2))
          };
        }).filter(Boolean);

        setChartData(processed);
      } catch (err) {
        setError(err.message);
      }
    };
    fetchData();
  }, [name]);

  // If error or data not yet loaded, handle that
  if (error) {
    return <div className="text-red-500 text-center mt-24">{error}</div>;
  }
  if (!satelliteData) {
    return <div className="text-gray-400 text-center mt-24">Loading...</div>;
  }

  // Extract min/max for each data series
  const altValues = chartData.map(d => d.altitude);
  const velValues = chartData.map(d => d.velocity);
  const bstValues = chartData.map(d => d.bstar);

  const minAlt = Math.min(...altValues);
  const maxAlt = Math.max(...altValues);
  const minVel = Math.min(...velValues);
  const maxVel = Math.max(...velValues);
  const minBst = Math.min(...bstValues);
  const maxBst = Math.max(...bstValues);

  // Provide a little padding around min/max
  const altPadding = (maxAlt - minAlt) * 0.1 || 1;
  const velPadding = (maxVel - minVel) * 0.1 || 0.1;
  const bstPadding = (maxBst - minBst) * 0.2 || 1e-8; 
    // bstar can be tiny/negative; tweak as needed

  return (
    <div className="p-6  min-h-screen bg-gradient-to-b from-[#050716] via-[#1B1E3D] to-[#2E4867] text-white pt-[120px]">
      <div className="absolute w-full h-full overflow-hidden pointer-events-none">
                  {generateStars(100)}
                </div>
      {/* Back Button */}
      <button
        onClick={() => navigate("/satellites")}
        className="mb-6 px-4 py-2 bg-teal-700 hover:bg-teal-600 text-white rounded-md transition"
      >
        ← Back to List
      </button>

      {/* Title / Header */}
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-3xl font-bold text-teal-400">{satelliteData.name}</h2>
        <div className="flex items-center space-x-3">
          <span className="text-teal-300">Live Tracking:</span>
          <Switch
            checked={liveTracking}
            onChange={() => setLiveTracking(!liveTracking)}
            color="success"
          />
        </div>
      </div>

      <p className="text-teal-200 mb-4">NORAD ID: {satelliteData.norad_number}</p>

      {/* Basic Orbit Info: first row */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
        {[
          { label: "Orbit Type", value: satelliteData.orbit_type },
          { label: "Inclination (°)", value: satelliteData.inclination },
          { label: "Mean Motion", value: satelliteData.mean_motion },
          { label: "Semi-Major Axis (km)", value: satelliteData.semi_major_axis },
          { label: "Perigee (km)", value: satelliteData.perigee },
          { label: "Apogee (km)", value: satelliteData.apogee },
          { label: "Arg of Perigee (°)", value: satelliteData.arg_perigee },
          { label: "RA of Ascending Node (°)", value: satelliteData.raan }
        ].map(({ label, value }, idx) => (
          <div key={idx} className="bg-gray-800 p-4 rounded-md shadow-md">
            <h3 className="text-lg font-semibold text-teal-300">{label}</h3>
            <p className="text-teal-200">{value}</p>
          </div>
        ))}
      </div>

      {/* Additional Info: second row (customize these fields as your API allows) */}
      <div className="mt-6 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
        {[
          { label: "Launch Date", value: satelliteData.launch_date || "N/A" },
          { label: "Country", value: satelliteData.country_of_origin || "N/A" },
          { label: "Manufacturer", value: satelliteData.manufacturer || "N/A" },
          { label: "Purpose", value: satelliteData.purpose || "N/A" }
        ].map(({ label, value }, idx) => (
          <div key={idx} className="bg-gray-800 p-4 rounded-md shadow-md">
            <h3 className="text-lg font-semibold text-teal-300">{label}</h3>
            <p className="text-teal-200">{value}</p>
          </div>
        ))}
      </div>

      {/* 1) Altitude Chart */}
      <div className="mt-10">
        <h3 className="text-xl font-semibold text-teal-300 mb-2">
          Altitude Over Time
        </h3>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#555" />
            <XAxis dataKey="epoch" stroke="#ccc" />
            <YAxis
              domain={[minAlt - altPadding, maxAlt + altPadding]}
              label={{
                value: "Altitude (km)",
                angle: -90,
                position: "insideLeft",
                fill: "#ccc"
              }}
              stroke="#ccc"
            />
            <Tooltip contentStyle={{ backgroundColor: "#222", color: "#fff" }} />
            <Legend wrapperStyle={{ color: "#ccc" }} />
            <Line
              type="monotone"
              dataKey="altitude"
              stroke="#72E2AE" /* a teal-lime color */
              strokeWidth={2}
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* 2) Velocity Chart */}
      <div className="mt-10">
        <h3 className="text-xl font-semibold text-teal-300 mb-2">
          Velocity Over Time
        </h3>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#555" />
            <XAxis dataKey="epoch" stroke="#ccc" />
            <YAxis
              domain={[minVel - velPadding, maxVel + velPadding]}
              label={{
                value: "Velocity (km/s)",
                angle: -90,
                position: "insideLeft",
                fill: "#ccc"
              }}
              stroke="#ccc"
            />
            <Tooltip contentStyle={{ backgroundColor: "#222", color: "#fff" }} />
            <Legend wrapperStyle={{ color: "#ccc" }} />
            <Line
              type="monotone"
              dataKey="velocity"
              stroke="#FFD166" /* a yellowish highlight */
              strokeWidth={2}
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* 3) Bstar Drag Chart */}
      <div className="mt-10">
        <h3 className="text-xl font-semibold text-teal-300 mb-2">
          Bstar Drag Term Over Time
        </h3>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#555" />
            <XAxis dataKey="epoch" stroke="#ccc" />
            <YAxis
              domain={[
                (minBst - bstPadding),
                (maxBst + bstPadding)
              ]}
              label={{
                value: "Bstar (1/ER)",
                angle: -90,
                position: "insideLeft",
                fill: "#ccc"
              }}
              stroke="#ccc"
            />
            <Tooltip contentStyle={{ backgroundColor: "#222", color: "#fff" }} />
            <Legend wrapperStyle={{ color: "#ccc" }} />
            <Line
              type="monotone"
              dataKey="bstar"
              stroke="#577BC1" /* a darker blue teal color */
              strokeWidth={2}
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Historical TLE Table */}
      <div className="mt-10">
        <h3 className="text-xl font-semibold text-teal-300 mb-2">
          Historical TLE Data
        </h3>
        <div className="overflow-x-auto">
          <table className="min-w-full bg-gray-800 rounded-md">
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
