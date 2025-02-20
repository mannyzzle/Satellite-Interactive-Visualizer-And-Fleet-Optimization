// src/components/Navbar.jsx
import { useState, useEffect } from "react";
import { Link } from "react-router-dom";

export default function Navbar({ toggleLiveTracking, isLiveTracking }) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isResourcesOpen, setIsResourcesOpen] = useState(false);
  const [utcTime, setUtcTime] = useState(new Date().toUTCString().split(" ")[4]); // Extract HH:MM:SS

  // Update UTC clock every second
  useEffect(() => {
    const interval = setInterval(() => {
      setUtcTime(new Date().toUTCString().split(" ")[4]);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <nav className="w-full bg-gray-950 text-white py-4 fixed top-0 left-0 z-90 shadow-lg font-[Space Grotesk]">
      <div className="max-w-7xl mx-auto flex justify-between items-center px-6 md:px-12 lg:px-16">

        {/* 🚀 App Logo & Title */}
        <div className="flex items-center space-x-3">
          {/* Custom Satellite Icon (Hovering Animation) */}
          <div className="w-6 h-6 bg-teal-300 rounded-full animate-bounce"></div>

          {/* App Title */}
          <h1 className="text-xl md:text-2xl font-medium tracking-wide">
            Sat-Track
          </h1>
        </div>

        {/* 📱 Mobile Menu Toggle */}
        <button 
          className="md:hidden text-white text-2xl focus:outline-none"
          onClick={() => setIsMenuOpen(!isMenuOpen)}
        >
          ☰
        </button>

        {/* 🌍 Desktop Navigation */}
        <div className="hidden md:flex items-center space-x-12 ml-12 text-sm font-medium">
          <Link to="/" className="hover:text-teal-300 transition-all duration-200">Home</Link>
          <Link to="/satellites" className="hover:text-teal-300 transition-all duration-200">Satellites</Link>
          <a 
            href="https://spaceflightnow.com/launch-schedule/" 
            target="_blank" 
            rel="noopener noreferrer" 
            className="hover:text-teal-300 transition-all duration-200"
          >
            Missions
          </a>
          <Link to="/about" className="hover:text-teal-300 transition-all duration-200">About</Link>

          {/* 🔗 Resources Dropdown */}
          <div className="relative">
            <button 
              onClick={() => setIsResourcesOpen(!isResourcesOpen)} 
              className="hover:text-teal-300 transition-all duration-200"
            >
              Resources ⏷
            </button>

            {isResourcesOpen && (
              <div className="absolute left-0 mt-3 w-56 bg-gray-800 text-white rounded-md shadow-lg overflow-hidden">
                <a 
                  href="https://www.celestrak.com/" 
                  target="_blank" 
                  rel="noopener noreferrer" 
                  className="block px-6 py-3 hover:bg-gray-700 transition-all duration-200"
                >
                  CelesTrak (TLE & Tracking)
                </a>
                <a 
                  href="https://www.n2yo.com/" 
                  target="_blank" 
                  rel="noopener noreferrer" 
                  className="block px-6 py-3 hover:bg-gray-700 transition-all duration-200"
                >
                  N2YO (Live Satellite Tracking)
                </a>
                <a 
                  href="https://spaceweather.com/" 
                  target="_blank" 
                  rel="noopener noreferrer" 
                  className="block px-6 py-3 hover:bg-gray-700 transition-all duration-200"
                >
                  Space Weather (Solar Activity)
                </a>
                <a 
                  href="https://www.nasa.gov/" 
                  target="_blank" 
                  rel="noopener noreferrer" 
                  className="block px-6 py-3 hover:bg-gray-700 transition-all duration-200"
                >
                  NASA (Official Website)
                </a>
              </div>
            )}
          </div>
        </div>

        {/* 🕒 UTC Clock */}
        <div className="hidden md:flex items-center text-sm text-gray-300 font-mono tracking-wider ml-12">
          UTC Time: <span className="ml-3 text-teal-300 font-medium">{utcTime}</span>
        </div>

        {/* 🔄 Live Tracking Toggle */}
        <button
          onClick={toggleLiveTracking}
          className={`px-5 py-3 rounded-md font-medium text-sm shadow-md transition-all duration-300 ml-6 ${
            isLiveTracking ? "bg-green-500 hover:bg-green-600" : "bg-gray-700 hover:bg-gray-600"
          }`}
        >
          {isLiveTracking ? "Live Tracking: ON" : "Live Tracking: OFF"}
        </button>
      </div>

      {/* 📱 Mobile Navigation (Dropdown) */}
      {isMenuOpen && (
        <div className="md:hidden flex flex-col items-center bg-gray-800 py-4 space-y-6">
          <Link to="/" className="hover:text-teal-300 transition-all duration-200">Home</Link>
          <Link to="/satellites" className="hover:text-teal-300 transition-all duration-200">Satellites</Link>
          <a 
            href="https://spaceflightnow.com/launch-schedule/" 
            target="_blank" 
            rel="noopener noreferrer" 
            className="hover:text-teal-300 transition-all duration-200"
          >
            Missions
          </a>
          <Link to="/about" className="hover:text-teal-300 transition-all duration-200">About</Link>
          
          {/* 🔗 Mobile Resources Dropdown */}
          <button 
            onClick={() => setIsResourcesOpen(!isResourcesOpen)} 
            className="hover:text-teal-300 transition-all duration-200"
          >
            Resources ⏷
          </button>

          {isResourcesOpen && (
            <div className="w-full bg-gray-700 rounded-md text-center p-4">
              <a href="https://www.celestrak.com/" target="_blank" rel="noopener noreferrer" className="block py-2 hover:text-teal-300">CelesTrak</a>
              <a href="https://www.n2yo.com/" target="_blank" rel="noopener noreferrer" className="block py-2 hover:text-teal-300">N2YO</a>
              <a href="https://spaceweather.com/" target="_blank" rel="noopener noreferrer" className="block py-2 hover:text-teal-300">Space Weather</a>
              <a href="https://www.nasa.gov/" target="_blank" rel="noopener noreferrer" className="block py-2 hover:text-teal-300">NASA</a>
            </div>
          )}

          {/* 🕒 UTC Clock (Mobile) */}
          <div className="text-sm text-gray-300 font-mono mt-3">
            UTC Time: <span className="ml-3 text-teal-300 font-medium">{utcTime}</span>
          </div>
        </div>
      )}
    </nav>
  );
}
