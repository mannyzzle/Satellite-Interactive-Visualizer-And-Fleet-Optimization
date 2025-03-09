// Infographics.jsx

import React, { useEffect } from "react";
import * as d3 from "d3";
import createVelocityHistogram from "../charts/VelocityHistogram";
import createPerigeeApogeeScatter from "../charts/PerigeeApogeeScatter";
import createPurposePieChart from "../charts/PurposePieChart";

const Infographics = ({ satellitesForCharts, loading, error }) => {
  // 🔄 Each time we get new data, re-render the charts
  useEffect(() => {
    // Clear old DOM for charts
    d3.select("#velocity-histogram").selectAll("*").remove();
    d3.select("#perigee-apogee-scatter").selectAll("*").remove();
    d3.select("#purpose-pie").selectAll("*").remove();

    // If not loading/error and have satellites, render
    if (!loading && !error && satellitesForCharts.length > 0) {
      console.log("🎨 Rendering velocity histogram...");
      createVelocityHistogram(satellitesForCharts);

      console.log("🎨 Rendering perigee-apogee scatter plot...");
      createPerigeeApogeeScatter(satellitesForCharts);

      console.log("🎨 Rendering purpose pie chart...");
      createPurposePieChart(satellitesForCharts);
    }

    // Cleanup if needed (WebGL contexts, etc.)
    return () => {
      document.querySelectorAll("canvas").forEach((canvas) => {
        if (canvas.reglContext) canvas.reglContext.destroy();
      });
    };
  }, [satellitesForCharts, loading, error]);

  // 🔄 Loading & Error Messages
  if (loading) {
    return (
      <div className="p-4 text-center text-gray-300">
        ⏳ Loading Infographics...
      </div>
    );
  }
  if (error) {
    return (
      <div className="p-4 text-center text-red-400">
        ❌ No data available. Try adjusting filters or pagination.
      </div>
    );
  }
  if (!satellitesForCharts?.length) {
    return (
      <div className="p-4 text-center text-gray-400">
        No satellites for the charts yet.
      </div>
    );
  }

  // Render containers for your 3 charts
  return (
    <div className="w-full bg-gray-900 rounded-lg shadow-lg border border-gray-700 p-6">
      {/* 📊 Title Section */}
      <div className="w-full py-4 flex items-center justify-center bg-gray-900 border border-gray-700">
        <hr className="hidden sm:block w-20 h-[2px] bg-teal-300 border-none" />
        <h3 className="text-xl sm:text-2xl font-semibold text-teal-300 text-center mx-4">
          🛰 Satellite Infographics
        </h3>
        <hr className="hidden sm:block w-20 h-[2px] bg-teal-300 border-none" />
      </div>

      {/* Chart Containers */}
      <div className="mt-6 grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div
          id="velocity-histogram"
          className="bg-gray-800 rounded-md shadow-md p-2"
          style={{ width: "100%", height: "500px" }}
        />
        <div
          id="perigee-apogee-scatter"
          className="bg-gray-800 rounded-md shadow-md p-2"
          style={{ width: "100%", height: "500px" }}
        />
        <div
          id="purpose-pie"
          className="bg-gray-800 rounded-md shadow-md p-2"
          style={{ width: "100%", height: "500px" }}
        />
      </div>
    </div>
  );
};

export default Infographics;
