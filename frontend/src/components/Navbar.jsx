// src/components/Navbar.jsx

import { useState } from "react";
import { Link } from "react-router-dom";

export default function Navbar({ onSearch, toggleLiveTracking, isLiveTracking }) {
  const [searchQuery, setSearchQuery] = useState("");

  return (
    <nav className="w-full bg-gray-900 text-white p-4 flex justify-between items-center fixed top-0 left-0 z-50 shadow-lg">
      {/* 🌍 App Title */}
      <h1 className="text-xl font-bold">🛰️ Satellite Tracker</h1>

      {/* 🔍 Search Bar */}
      <input
        type="text"
        placeholder="Search satellites..."
        value={searchQuery}
        onChange={(e) => {
          setSearchQuery(e.target.value);
          onSearch(e.target.value);
        }}
        className="p-2 rounded-md bg-gray-800 text-white placeholder-gray-400 border border-gray-700"
      />

      {/* 🌍 Navigation Links */}
      <div className="flex space-x-4">
        <Link to="/" className="hover:text-blue-400">Home</Link>
        <Link to="/satellites" className="hover:text-blue-400">Satellites</Link>
        <Link to="/about" className="hover:text-blue-400">About</Link>
      </div>

      {/* 🔄 Live Tracking Toggle */}
      <button
        onClick={toggleLiveTracking}
        className={`px-3 py-2 rounded-md transition-all duration-300 ${
          isLiveTracking ? "bg-green-500" : "bg-red-500"
        }`}
      >
        {isLiveTracking ? "🟢 Live ON" : "🔴 Live OFF"}
      </button>
    </nav>
  );
}

