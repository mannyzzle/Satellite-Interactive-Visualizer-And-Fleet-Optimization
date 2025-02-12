// src/components/Navbar.jsx
import { useState } from "react";
import { Link } from "react-router-dom";

export default function Navbar({ toggleLiveTracking, isLiveTracking }) {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isResourcesOpen, setIsResourcesOpen] = useState(false);

  return (
    <nav className="w-full bg-gray-900 text-white p-4 flex justify-between items-center fixed top-0 left-0 z-80 shadow-lg">
      {/* 🌍 App Title */}
      <h1 className="text-xl font-bold">🛰️ Satellite Tracker</h1>

          {/* 🌍 Navigation Links */}
          <div className="flex space-x-6 text-sm font-medium">
        <Link to="/" className="hover:text-blue-400 transition-all duration-200">Home</Link>
        <Link to="/satellites" className="hover:text-blue-400 transition-all duration-200">Satellites</Link>
        <a 
          href="https://spaceflightnow.com/launch-schedule/" 
          target="_blank" 
          rel="noopener noreferrer" 
          className="hover:text-blue-400 transition-all duration-200"
        >
          Missions
        </a>
        <Link to="/about" className="hover:text-blue-400 transition-all duration-200">About</Link>
               
        {/* 🔗 Resources Dropdown (Click to Open) */}
        <div className="relative">
          <button 
            onClick={() => setIsResourcesOpen(!isResourcesOpen)} 
            className="hover:text-blue-400 transition-all duration-200"
          >
            Resources ⏷
          </button>

          {isResourcesOpen && (
            <div className="absolute left-0 mt-2 w-48 bg-gray-800 text-white rounded-md shadow-lg overflow-hidden">
              <a 
                href="https://www.celestrak.com/" 
                target="_blank" 
                rel="noopener noreferrer" 
                className="block px-4 py-2 hover:bg-gray-700 transition-all duration-200"
              >
                CelesTrak (TLE & Tracking)
              </a>
              <a 
                href="https://www.n2yo.com/" 
                target="_blank" 
                rel="noopener noreferrer" 
                className="block px-4 py-2 hover:bg-gray-700 transition-all duration-200"
              >
                N2YO (Live Satellite Tracking)
              </a>
              <a 
                href="https://spaceweather.com/" 
                target="_blank" 
                rel="noopener noreferrer" 
                className="block px-4 py-2 hover:bg-gray-700 transition-all duration-200"
              >
                Space Weather (Solar Activity)
              </a>
              <a 
                href="https://www.nasa.gov/" 
                target="_blank" 
                rel="noopener noreferrer" 
                className="block px-4 py-2 hover:bg-gray-700 transition-all duration-200"
              >
                NASA (Official Website)
              </a>
            </div>
          )}
        </div>
      </div>
    


      {/* 🔄 Live Tracking Toggle (Standalone Button) */}
      <button
        onClick={toggleLiveTracking}
        className={`px-3 py-2 rounded-md font-medium text-sm shadow-md transition-all duration-300 ${
          isLiveTracking ? "bg-green-500 hover:bg-green-600" : "bg-green-500 hover:bg-green-600"
        }`}
      >
        {isLiveTracking ? "🟢 Live ON" : "🟢 Live ON"}
      </button>
    </nav>
  );
}
