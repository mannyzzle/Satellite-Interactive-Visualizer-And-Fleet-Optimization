import React, { useState, useEffect } from "react";
import { fetchInfographics } from "../api/satelliteService";

const Infographics = ({ activeFilters }) => {
  const [infographics, setInfographics] = useState([]);
  const [selectedImage, setSelectedImage] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!activeFilters || activeFilters.length === 0) {
      console.warn("⚠️ No filters applied. Skipping fetch.");
      setInfographics([]); // Clear infographics if no filter is selected
      return;
    }

    async function fetchData() {
      setLoading(true);
      setError(false);
      console.log(`📡 Fetching infographics for filters: ${activeFilters.join(", ")}`);

      const data = await fetchInfographics(activeFilters);
      if (data.length === 0) {
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

  if (error || infographics.length === 0) {
    return <p className="text-center text-red-400">No infographics found. Try another filter.</p>;
  }

  return (
    <div className="flex flex-wrap justify-center gap-6">
      {infographics.map((item, index) => (
        <div key={index} className="flex flex-col items-center">
          <img
            src={item.url}
            alt={item.name}
            className="rounded-lg shadow-md w-80 h-auto border border-gray-700 cursor-pointer hover:opacity-80 transition"
            onClick={() => setSelectedImage(item)} // ✅ Opens modal on click
          />
          <p className="text-sm text-gray-300 mt-2">{item.name}</p>
        </div>
      ))}

      {/* ✅ Image Modal */}
      {selectedImage && (
        <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-80 z-50">
          <div className="relative p-4 bg-gray-900 rounded-lg shadow-lg max-w-2xl">
            <button
              className="absolute top-2 right-2 text-white text-lg bg-gray-700 px-3 py-1 rounded hover:bg-gray-600"
              onClick={() => setSelectedImage(null)}
            >
              ✖
            </button>
            <img src={selectedImage.url} alt={selectedImage.name} className="max-w-full max-h-[80vh] rounded-lg" />
            <p className="text-center text-gray-300 mt-3">{selectedImage.name}</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default Infographics;
