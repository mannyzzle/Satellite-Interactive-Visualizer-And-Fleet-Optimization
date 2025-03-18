import { useEffect, useState } from "react";
import axios from "axios";
import { Link } from "react-router-dom";
import { CircularProgress } from "@mui/material";
import { generateStars } from "./Home";

const API_BASE_URL = "https://satellite-tracker-production.up.railway.app/api/satellites/";
//const API_BASE_URL = "http://127.0.0.1:8000/api/satellites";

export default function SatelliteList() {
  const [satelliteData, setSatelliteData] = useState({});
  const [totalCounts, setTotalCounts] = useState({});
  const [error, setError] = useState(null);

  // Track page & loading states for orbit categories
  const [pageNumbers, setPageNumbers] = useState({});
  const [loadingCategories, setLoadingCategories] = useState({});

  // Track page & loading states for purposes
  const [purposeData, setPurposeData] = useState({});
  const [purposeCounts, setPurposeCounts] = useState({});
  const [purposePageNumbers, setPurposePageNumbers] = useState({});
  const [loadingPurposes, setLoadingPurposes] = useState({});

  const limit = 8;

  // ---------------------------
  // Orbit categories (LEO/MEO/GEO/HEO)
  // ---------------------------
  const categories = [
    {
      name: "LEO",
      label: "Low Earth Orbit (LEO)",
      description: "Satellites in LEO operate between 160km and 2,000km."
    },
    {
      name: "MEO",
      label: "Medium Earth Orbit (MEO)",
      description: "Satellites in MEO reside between LEO and GEO, typically used for GPS."
    },
    {
      name: "GEO",
      label: "Geostationary Orbit (GEO)",
      description: "Geostationary satellites maintain a fixed position above the equator at 35,786 km."
    },
    {
      name: "HEO",
      label: "Highly Elliptical Orbit (HEO)",
      description: "Satellites in HEO follow elongated paths, useful for long-duration coverage."
    }
  ];

  // ---------------------------
  // Object Purposes (Communications, Navigation, etc.)
  // ---------------------------
  const objectPurposes = [
    { 
      name: "Communications", 
      label: "Communications", 
      filter: "Communications",
      description: "Satellites providing communication services (TV, internet, phone)."
    },
    { 
      name: "Navigation", 
      label: "Navigation", 
      filter: "Navigation",
      description: "Satellites enabling GPS, GLONASS, BeiDou, etc."
    },
    { 
      name: "Military/Reconnaissance", 
      label: "Military/Reconnaissance", 
      filter: "Military/Reconnaissance",
      description: "Defense or surveillance-oriented satellites."
    },
    { 
      name: "Weather Monitoring", 
      label: "Weather Monitoring", 
      filter: "Weather Monitoring",
      description: "Satellites tracking storms, climate data, etc."
    },
    {
      name: "Earth Observation",
      label: "Earth Observation",
      filter: "Earth Observation",
      description: "Satellites imaging Earth’s surface and environment."
    },
    {
      name: "Scientific Research",
      label: "Scientific Research",
      filter: "Scientific Research",
      description: "Satellites dedicated to science experiments or data collection."
    },
    {
      name: "Technology Demonstration",
      label: "Technology Demonstration",
      filter: "Technology Demonstration",
      description: "Satellites testing new tech or prototypes in orbit."
    },
    {
      name: "Satellite Servicing & Logistics",
      label: "Satellite Servicing & Logistics",
      filter: "Satellite Servicing & Logistics",
      description: "Satellites handling refueling, repairs, or logistics in space."
    },
    {
      name: "Deep Space Exploration",
      label: "Deep Space Exploration",
      filter: "Deep Space Exploration",
      description: "Probes and craft going beyond Earth orbit (Moon, Mars, etc.)."
    },
    {
      name: "Human Spaceflight",
      label: "Human Spaceflight",
      filter: "Human Spaceflight",
      description: "Crewed missions or space stations with human occupants."
    },
    {
      name: "Space Infrastructure",
      label: "Space Infrastructure",
      filter: "Space Infrastructure",
      description: "Modules, habitats, or orbital stations supporting space operations."
    },
    {
      name: "Space Debris",
      label: "Space Debris",
      filter: "Space Debris",
      description: "Dead satellites or debris tracked in orbit."
    },
    {
      name: "Rocket Body (Debris)",
      label: "Rocket Body (Debris)",
      filter: "Rocket Body (Debris)",
      description: "Expended rocket stages and similar large debris."
    },
    {
      name: "Starlink Constellation",
      label: "Starlink Constellation",
      filter: "Starlink Constellation",
      description: "SpaceX internet constellation satellites."
    },
    {
      name: "OneWeb Constellation",
      label: "OneWeb Constellation",
      filter: "OneWeb Constellation",
      description: "OneWeb's broadband internet constellation."
    },
    {
      name: "Iridium NEXT Constellation",
      label: "Iridium NEXT Constellation",
      filter: "Iridium NEXT Constellation",
      description: "Iridium’s next-gen sat phone/data constellation."
    },
    {
      name: "Unknown",
      label: "Unknown",
      filter: "Unknown",
      description: "Satellites without a publicly known purpose."
    }
  ];

  // ---------------------------
  // FETCH Orbit Categories
  // ---------------------------
  useEffect(() => {
    // When component mounts, fetch page=1 for each orbit category
    categories.forEach(category => {
      fetchCategoryData(category.name, 1);
    });
    // Also fetch page=1 for each object purpose
    objectPurposes.forEach(p => {
      fetchPurposeData(p.name, p.filter, 1);
    });
  }, []);

  const fetchCategoryData = async (category, page) => {
    setLoadingCategories(prev => ({ ...prev, [category]: true }));
    try {
      const response = await axios.get(
        `${API_BASE_URL}?page=${page}&limit=${limit}&filter=${encodeURIComponent(category)}`
      );
      if (!response.data || !Array.isArray(response.data.satellites)) {
        throw new Error("Invalid API response");
      }
      setSatelliteData(prev => ({ ...prev, [category]: response.data.satellites }));
      setTotalCounts(prev => ({ ...prev, [category]: response.data.total }));
      setPageNumbers(prev => ({ ...prev, [category]: page }));
    } catch (err) {
      console.error("Error fetching satellites:", err);
      setError("Failed to fetch satellite data.");
    } finally {
      setLoadingCategories(prev => ({ ...prev, [category]: false }));
    }
  };

  // ---------------------------
  // FETCH Object Purposes
  // ---------------------------
  const fetchPurposeData = async (purposeName, filterStr, page) => {
    setLoadingPurposes(prev => ({ ...prev, [purposeName]: true }));

    try {
      const response = await axios.get(
        `${API_BASE_URL}?page=${page}&limit=${limit}&filter=${encodeURIComponent(filterStr)}`
      );
      if (!response.data || !Array.isArray(response.data.satellites)) {
        throw new Error("Invalid API response");
      }

      setPurposeData(prev => ({ ...prev, [purposeName]: response.data.satellites }));
      setPurposeCounts(prev => ({ ...prev, [purposeName]: response.data.total }));
      setPurposePageNumbers(prev => ({ ...prev, [purposeName]: page }));
    } catch (err) {
      console.error("Error fetching purposes:", err);
      setError("Failed to fetch purpose-based data.");
    } finally {
      setLoadingPurposes(prev => ({ ...prev, [purposeName]: false }));
    }
  };

  return (
    <div className="p-6 bg-gray-900 min-h-screen pt-[120px] bg-gradient-to-b from-[#050716] via-[#1B1E3D] to-[#2E4867] text-white">
   <div className="absolute w-full h-full overflow-hidden pointer-events-none">
          {generateStars(100)}
        </div>
      {/* ========== Title & Intro ========== */}
      <div className="w-full text-center mb-4">
        <h1 className="text-4xl font-bold text-teal-300">Satellite Launches</h1>
        <p className="text-teal-400 text-lg">
          Tracking thousands of satellites in real-time.
        </p>
      </div>
      <div className="mb-8 text-center">
        <p className="text-teal-200 text-sm italic">
          Data updates every 15 minutes. All times in UTC.
        </p>
      </div>

      {/* ========== 1) ORBIT CATEGORIES (LEO, MEO, etc.) ========== */}
      <div className="grid grid-cols-2 gap-6">
        {categories.map(category => {
          const satellites = satelliteData[category.name] || [];
          const page = pageNumbers[category.name] || 1;
          const total = totalCounts[category.name] || 0;
          const totalPages = Math.ceil(total / limit);

          return (
            <div key={category.name} className="flex items-center gap-6">
              {/* Visualization Box */}
              <div className="trajectory-box w-[240px] h-[240px] bg-gray-800 rounded-lg flex justify-center items-center relative">
                <h4 className="text-teal-200 text-xs absolute top-2">
                  {category.label}
                </h4>
                <div className="core-sphere"></div>
                <div className={`trajectory-orbit ${category.name.toLowerCase()}-path`}>
                  <div className={`probe ${category.name.toLowerCase()}-unit`}></div>
                </div>
              </div>

              {/* Satellite List & Pagination */}
              <div className="bg-gray-800 p-5 rounded-lg shadow-lg flex flex-col justify-between min-h-[360px] w-full">
                <h3 className="text-md font-semibold text-teal-300 mb-2 text-center">
                  {category.label} ({total} total)
                </h3>
                <p className="text-teal-200 text-xs mb-2 text-center">
                  {category.description}
                </p>

                {loadingCategories[category.name] ? (
                  <div className="flex flex-grow items-center justify-center">
                    <CircularProgress size={35} thickness={4} style={{ color: "#2dd4bf" }} />
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    {satellites.map(sat => (
                      <div
                        key={sat.norad_number}
                        className="p-2 bg-gray-700 rounded-md text-center text-xs border border-gray-600 hover:bg-gray-600"
                      >
                        <Link
                          to={`/satellites/${encodeURIComponent(sat.name)}`}
                          className="text-cyan-300 hover:text-cyan-200 font-medium"
                        >
                          {sat.name}
                        </Link>
                        <p className="text-teal-300 text-xs">NORAD: {sat.norad_number}</p>
                      </div>
                    ))}
                  </div>
                )}

                {/* Pagination */}
                <div className="flex justify-between items-center mt-4">
                  <button
                    onClick={() => fetchCategoryData(category.name, 1)}
                    disabled={page === 1}
                    className="px-3 py-1 text-sm bg-teal-700 hover:bg-teal-800 text-white rounded disabled:bg-gray-600 disabled:cursor-not-allowed"
                  >
                    First
                  </button>
                  <button
                    onClick={() => fetchCategoryData(category.name, page - 1)}
                    disabled={page === 1}
                    className="px-3 py-1 text-sm bg-teal-700 hover:bg-teal-800 text-white rounded disabled:bg-gray-600 disabled:cursor-not-allowed"
                  >
                    Prev
                  </button>

                  <span className="text-teal-200 text-xs">
                    Page {page} of {totalPages}
                  </span>

                  <button
                    onClick={() => fetchCategoryData(category.name, page + 1)}
                    disabled={page >= totalPages}
                    className="px-3 py-1 text-sm bg-teal-700 hover:bg-teal-800 text-white rounded disabled:bg-gray-600 disabled:cursor-not-allowed"
                  >
                    Next
                  </button>
                  <button
                    onClick={() => fetchCategoryData(category.name, totalPages)}
                    disabled={page >= totalPages}
                    className="px-3 py-1 text-sm bg-teal-700 hover:bg-teal-800 text-white rounded disabled:bg-gray-600 disabled:cursor-not-allowed"
                  >
                    Last
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>


      {/* ========== 2) OBJECT PURPOSES SECTION ========== */}
      <div className="mt-12">
      <div className="absolute w-full h-full overflow-hidden pointer-events-none">
          {generateStars(100)}
        </div>
        <h2 className="text-2xl font-bold text-teal-300 text-center mb-6">
          Satellite Purposes
        </h2>

        <div className="grid grid-cols-2 gap-6">
          {objectPurposes.map(p => {
            const sats = purposeData[p.name] || [];
            const page = purposePageNumbers[p.name] || 1;
            const total = purposeCounts[p.name] || 0;
            const totalPages = Math.ceil(total / limit);

            return (
              <div key={p.name} className="bg-gray-800 p-5 rounded-lg shadow-lg flex flex-col justify-between min-h-[360px]">
                <h3 className="text-md font-semibold text-teal-300 mb-2 text-center">
                  {p.label} ({total} total)
                </h3>
                <p className="text-teal-200 text-xs mb-2 text-center">
                  {p.description}
                </p>

                {/* Show Spinner or Satellite Items */}
                {loadingPurposes[p.name] ? (
                  <div className="flex flex-grow items-center justify-center">
                    <CircularProgress size={35} thickness={4} style={{ color: "#2dd4bf" }} />
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    {sats.map(sat => (
                      <div
                        key={sat.norad_number}
                        className="p-2 bg-gray-700 rounded-md text-center text-xs border border-gray-600 hover:bg-gray-600"
                      >
                        <Link
                          to={`/satellites/${encodeURIComponent(sat.name)}`}
                          className="text-cyan-300 hover:text-cyan-200 font-medium"
                        >
                          {sat.name}
                        </Link>
                        <p className="text-teal-300 text-xs">
                          NORAD: {sat.norad_number}
                        </p>
                      </div>
                    ))}
                  </div>
                )}

                {/* Pagination for each purpose */}
                <div className="flex justify-between items-center mt-4">
                  <button
                    onClick={() => fetchPurposeData(p.name, p.filter, 1)}
                    disabled={page === 1}
                    className="px-3 py-1 text-sm bg-teal-700 hover:bg-teal-800 text-white rounded disabled:bg-gray-600 disabled:cursor-not-allowed"
                  >
                    First
                  </button>
                  <button
                    onClick={() => fetchPurposeData(p.name, p.filter, page - 1)}
                    disabled={page === 1}
                    className="px-3 py-1 text-sm bg-teal-700 hover:bg-teal-800 text-white rounded disabled:bg-gray-600 disabled:cursor-not-allowed"
                  >
                    Prev
                  </button>

                  <span className="text-teal-200 text-xs">
                    Page {page} of {totalPages}
                  </span>

                  <button
                    onClick={() => fetchPurposeData(p.name, p.filter, page + 1)}
                    disabled={page >= totalPages}
                    className="px-3 py-1 text-sm bg-teal-700 hover:bg-teal-800 text-white rounded disabled:bg-gray-600 disabled:cursor-not-allowed"
                  >
                    Next
                  </button>
                  <button
                    onClick={() => fetchPurposeData(p.name, p.filter, totalPages)}
                    disabled={page >= totalPages}
                    className="px-3 py-1 text-sm bg-teal-700 hover:bg-teal-800 text-white rounded disabled:bg-gray-600 disabled:cursor-not-allowed"
                  >
                    Last
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Error message (if any) */}
      {error && (
        <div className="text-red-400 text-center mt-4">
          {error}
        </div>
      )}
    </div>
  );
}
