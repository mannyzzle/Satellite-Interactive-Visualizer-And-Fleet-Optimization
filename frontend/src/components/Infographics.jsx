import React, { useEffect } from "react";
import * as d3 from "d3";
import createVelocityHistogram from "../charts/VelocityHistogram";
import createPerigeeApogeeScatter from "../charts/PerigeeApogeeScatter";
import createPurposePieChart from "../charts/PurposePieChart";

const Infographics = ({ satellitesForCharts, loading, error }) => {
  useEffect(() => {
    d3.select("#velocity-histogram").selectAll("*").remove();
    d3.select("#perigee-apogee-scatter").selectAll("*").remove();
    d3.select("#purpose-pie").selectAll("*").remove();

    if (!loading && !error && satellitesForCharts.length > 0) {
      createVelocityHistogram(satellitesForCharts);
      createPerigeeApogeeScatter(satellitesForCharts);
      createPurposePieChart(satellitesForCharts);
    }

    return () => {
      document.querySelectorAll("canvas").forEach((canvas) => {
        if (canvas.reglContext) canvas.reglContext.destroy();
      });
    };
  }, [satellitesForCharts, loading, error]);

  if (loading) {
    return <div className="p-4 text-center text-gray-300">⏳ Loading Infographics...</div>;
  }
  if (error) {
    return <div className="p-4 text-center text-red-400">❌ No data available. Try adjusting filters or pagination.</div>;
  }
  if (!satellitesForCharts?.length) {
    return <div className="p-4 text-center text-gray-400">No satellites for the charts yet.</div>;
  }

  return (
    <div className="w-full bg-black/50 rounded-lg shadow-lg py-10">
      {/* 📊 Title Section */}
      <div className="w-full py-4 flex items-center justify-center bg-gray-900 border border-gray-700">
        <hr className="hidden sm:block w-20 h-[2px] bg-teal-300 border-none" />
        <h3 className="text-xl sm:text-2xl font-semibold text-teal-300 text-center mx-4">
          🛰 Satellite Infographics
        </h3>
        <hr className="hidden sm:block w-20 h-[2px] bg-teal-300 border-none" />
      </div>

      {/* 📊 Zigzag Three-Row Layout */}
      <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-8 items-center justify-center">
        
        {/* 🟢 Row 1 */}
        <div
          id="velocity-histogram"
          className="bg-gray-800 rounded-md shadow-md p-4 w-[90%] max-w-[480px] mx-auto"
        />
        <div
          id="purpose-pie"
          className="bg-gray-800 rounded-md shadow-md p-4 w-[90%] max-w-[480px] mx-auto"
        />

        {/* 🟠 Row 2 (Zigzag) */}
        <div
          id="perigee-apogee-scatter"
          className="bg-gray-800 rounded-md shadow-md p-4 w-[90%] max-w-[480px] mx-auto md:order-last"
        />
        <div
          id="another-chart"
          className="bg-gray-800 rounded-md shadow-md p-4 w-[90%] max-w-[480px] mx-auto md:order-first"
        />

        {/* 🔵 Row 3 */}
        <div
          id="some-other-chart"
          className="bg-gray-800 rounded-md shadow-md p-4 w-[90%] max-w-[480px] mx-auto"
        />
        <div
          id="one-more-chart"
          className="bg-gray-800 rounded-md shadow-md p-4 w-[90%] max-w-[480px] mx-auto"
        />

      </div>
    </div>
  );
};

export default Infographics;





