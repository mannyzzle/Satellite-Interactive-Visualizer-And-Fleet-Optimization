import React, { useState, useEffect } from "react";
import { fetchInfographics } from "../api/satelliteService";

const Infographics = ({ activeFilters }) => {
  const [infographics, setInfographics] = useState([]);
  const [selectedImage, setSelectedImage] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  // 🎯 Define valid launch years (1990-2025) and top 20 countries
  const validYears = Array.from({ length: 2026 - 1990 }, (_, i) => (1990 + i).toString());
  const topCountries = [
    "US", "PRC", "UK", "CIS", "TBD", "JPN", "IND", "ESA", "FR", "CA",
    "SES", "GER", "SKOR", "IT", "SPN", "ARGN", "ITSO", "GLOB", "EUTE", "FIN"
  ];

  const getFilterKey = () => {
    if (!activeFilters || activeFilters.length === 0) {
      return "All_Satellites"; // ✅ Default to "All Satellites"
    }
  
    const filterKey = activeFilters[0];
  
    // Check if the filter is for a specific Launch Year (e.g., "Launch Year:2023")
    if (filterKey.includes("Launch Year")) {
      const year = filterKey.split(":")[1].trim(); // Extract year from "Launch Year:2023"
  
      // Ensure the extracted year is a valid year in the range (1990-2025)
      return validYears.includes(year) ? `Launch_Year_${year}` : "Launch_Year_All";
    }
  
    // Handle country filters
    if (filterKey.includes("Country")) {
      const country = filterKey.replace("Country:", "").trim();
      return topCountries.includes(country) ? `Country_${country}` : "All_Satellites";
    }
  
    // For other filters, ensure URL safety
    return encodeURIComponent(filterKey); // ✅ Ensure URL safety
  };

  


  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      setError(false);

      const filterKey = getFilterKey();
      console.log(`📡 Fetching infographics for filter: ${filterKey}`);

      const data = await fetchInfographics(filterKey);
      if (!data || data.length === 0) {
        console.warn("⚠️ No infographics available.");
        setError(true);
      }

      setInfographics(data);
      setLoading(false);
    }

    fetchData();
  }, [activeFilters]); // ✅ Re-fetch when filters change

  if (loading) {
    return <p className="text-center text-gray-400 animate-pulse">Loading infographics...</p>;
  }

  if (error) {
    return <p className="text-center text-red-400">No infographics found. Try another filter.</p>;
  }

  // ✅ Ensure 3 items per row & fill last row with placeholders if needed
  const totalItems = infographics.length;
  const remainder = totalItems % 3;
  const itemsToAdd = remainder === 0 ? 0 : 3 - remainder;

  return (
    <div className="w-full max-w-screen-xl mx-auto px-6 py-10 bg-gray-900 rounded-lg shadow-lg border border-gray-700">
    
      {/* ✅ 3-Column Grid for Full Width */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-8 w-full">
        {infographics.map((item, index) => (
          <div key={index} className="flex flex-col items-center w-full">
            <img
              src={item.url}
              alt={item.name}
              className="rounded-lg shadow-md w-full max-w-[400px] h-auto border border-gray-600 cursor-pointer hover:opacity-80 transition"
              onClick={() => setSelectedImage(item)}
            />
            <p className="text-sm text-gray-300 mt-2 text-center font-semibold">
              {item.name.replace(/_/g, " ")}
            </p>
          </div>
        ))}

        {/* ✅ Fill last row with placeholders if needed */}
        {Array.from({ length: itemsToAdd }).map((_, idx) => (
          <div key={`placeholder-${idx}`} className="flex flex-col items-center w-full">
            <div className="w-full max-w-[400px] h-[250px] bg-gray-700 rounded-lg shadow-md border border-gray-600 flex items-center justify-center">
              <span className="text-gray-400 font-semibold">🚀 More Data Coming Soon</span>
            </div>
          </div>
        ))}
      </div>

      {/* ✅ Image Modal */}
      {selectedImage && (
        <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-80 z-50">
          <div className="relative p-4 bg-gray-900 rounded-lg shadow-lg max-w-3xl">
            <button
              className="absolute top-2 right-2 text-white text-lg bg-gray-700 px-3 py-1 rounded hover:bg-gray-600"
              onClick={() => setSelectedImage(null)}
            >
              ✖
            </button>
            <img src={selectedImage.url} alt={selectedImage.name} className="max-w-full max-h-[80vh] rounded-lg" />
            <p className="text-center text-gray-300 mt-3 font-semibold">
              {selectedImage.name.replace(/_/g, " ")}
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default Infographics;
