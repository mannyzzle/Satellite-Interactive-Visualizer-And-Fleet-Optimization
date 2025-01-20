import React, { useEffect, useState } from 'react';
import SearchBar from './SearchBar';

function SatelliteList() {
  const [satellites, setSatellites] = useState([]);
  const [filteredSatellites, setFilteredSatellites] = useState([]);

  useEffect(() => {
    // Replace the local URL with your Codespaces API URL
    fetch('https://ideal-space-waddle-x74qvwxr6q7c6j66-8000.app.github.dev/satellites?page=1&limit=10')
      .then((response) => response.json())
      .then((data) => {
        setSatellites(data);
        setFilteredSatellites(data);
      })
      .catch((err) => console.error('Error fetching satellite data:', err));
  }, []);

  const handleSearch = (query) => {
    const filtered = satellites.filter((sat) =>
      sat.satellite_name.toLowerCase().includes(query.toLowerCase())
    );
    setFilteredSatellites(filtered);
  };

  return (
    <div>
      <h2>Satellites</h2>
      <SearchBar onSearch={handleSearch} />
      <ul>
        {filteredSatellites.map((sat) => (
          <li key={sat.id}>
            {sat.satellite_name} (ID: {sat.norad_number})
          </li>
        ))}
      </ul>
    </div>
  );
}

export default SatelliteList;
