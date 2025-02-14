import { useEffect, useState } from "react";
import { fetchInfographics } from "../api/satelliteService";

const Infographics = ({ activeFilters }) => {
  const [infographicUrls, setInfographicUrls] = useState([]);

  useEffect(() => {
    if (activeFilters.length === 0) return;

    fetchInfographics(activeFilters).then((urls) => {
      setInfographicUrls(urls);
    });
  }, [activeFilters]);

  return (
    <div className="flex flex-wrap justify-center gap-4 mt-6">
      {infographicUrls.map((url, index) => (
        <img key={index} src={url} alt="Satellite infographic" className="rounded-lg shadow-md w-80 h-auto border border-gray-700" />
      ))}
    </div>
  );
};

export default Infographics;
