import { useState, useEffect, useRef } from "react";
import { Link, useLocation } from "react-router-dom";

// Custom hook to detect clicks outside of a referenced element
function useOnClickOutside(ref, handler) {
  useEffect(() => {
    const listener = (event) => {
      // Do nothing if clicking ref's element or its children
      if (!ref.current || ref.current.contains(event.target)) return;
      handler(event);
    };

    document.addEventListener("mousedown", listener);
    document.addEventListener("touchstart", listener);
    return () => {
      document.removeEventListener("mousedown", listener);
      document.removeEventListener("touchstart", listener);
    };
  }, [ref, handler]);
}

export default function Navbar() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isResourcesOpen, setIsResourcesOpen] = useState(false);
  const [utcTime, setUtcTime] = useState(new Date().toUTCString().split(" ")[4]);
  const location = useLocation();

  const menuRef = useRef(null);
  const resourcesRef = useRef(null);

  // Automatically close menus when route changes
  useEffect(() => {
    setIsMenuOpen(false);
    setIsResourcesOpen(false);
  }, [location]);

  // Close mobile menu if clicking outside
  useOnClickOutside(menuRef, () => setIsMenuOpen(false));
  // Close resources dropdown if clicking outside
  useOnClickOutside(resourcesRef, () => setIsResourcesOpen(false));

  // Update UTC time every second
  useEffect(() => {
    const interval = setInterval(() => {
      setUtcTime(new Date().toUTCString().split(" ")[4]);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <nav className="w-full bg-gray-950 text-white py-4 fixed top-0 left-0 z-50 shadow-lg font-[Space Grotesk] border-b border-gray-800 min-h-[70px]">
      <div className="max-w-8xl mx-auto flex justify-between items-center px-6 md:px-12 lg:px-16 gap-16">
        {/* Logo & Title */}
        <div className="flex items-center gap-4">
          <div className="relative w-8 h-8 flex-shrink-0">
            <svg className="w-full h-full animate-rotateGlobe" viewBox="0 0 100 100">
              <circle cx="50" cy="50" r="40" stroke="teal" strokeWidth="5" fill="none" />
              <line x1="50" y1="10" x2="50" y2="90" stroke="teal" strokeWidth="3" />
              <line x1="10" y1="50" x2="90" y2="50" stroke="teal" strokeWidth="3" />
              <path d="M 10 50 Q 50 90, 90 50" stroke="teal" strokeWidth="3" fill="none" />
              <path d="M 10 50 Q 50 10, 90 50" stroke="teal" strokeWidth="3" fill="none" />
            </svg>
          </div>
          <h1 className="text-xl md:text-2xl font-medium tracking-wide whitespace-nowrap">
            Sat-Track
          </h1>
        </div>

        {/* Navigation Links (Desktop) */}
        <div className="hidden md:flex items-center space-x-8 flex-1 border-l border-gray-700 pl-6">
          <Link to="/" className="hover:text-teal-300 transition-colors duration-200">Home</Link>
          <Link to="/satellites" className="hover:text-teal-300 transition-colors duration-200">Satellites</Link>
          <Link to="/launches" className="hover:text-teal-300 transition-colors duration-200">Launches</Link>
          <Link to="/tracking" className="hover:text-teal-300 transition-colors duration-200">Tracking</Link>
          <Link to="/gallery" className="hover:text-teal-300 transition-colors duration-200">Gallery</Link>
          <Link to="/about" className="hover:text-teal-300 transition-colors duration-200">About</Link>

          {/* Resources Dropdown (Desktop) */}
          <div className="relative" ref={resourcesRef}>
            <button
              onClick={() => setIsResourcesOpen((prev) => !prev)}
              className="hover:text-teal-300 transition-colors duration-200 focus:outline-none"
              aria-expanded={isResourcesOpen}
              aria-haspopup="true"
            >
              Resources ⏷
            </button>
            {isResourcesOpen && (
              <div className="absolute right-0 mt-2 w-64 bg-gray-800 text-white rounded-md shadow-lg border border-gray-700 transition transform origin-top-right">
                <a href="https://www.spacestrak.com/" target="_blank" rel="noopener noreferrer" className="block px-6 py-3 hover:bg-gray-700 transition-colors duration-200">
                  SpaceTrak (TLE & Tracking)
                </a>
                <a href="https://www.n2yo.com/" target="_blank" rel="noopener noreferrer" className="block px-6 py-3 hover:bg-gray-700 transition-colors duration-200">
                  N2YO (Live Tracking)
                </a>
                <a href="https://spaceweather.com/" target="_blank" rel="noopener noreferrer" className="block px-6 py-3 hover:bg-gray-700 transition-colors duration-200">
                  Space Weather
                </a>
                <a href="https://www.nasa.gov/" target="_blank" rel="noopener noreferrer" className="block px-6 py-3 hover:bg-gray-700 transition-colors duration-200">
                  NASA
                </a>
              </div>
            )}
          </div>
        </div>

        {/* UTC Clock */}
        <div className="hidden md:flex items-center text-sm text-gray-300 font-mono tracking-wider border-l border-gray-700 pl-6">
          UTC Time: <span className="ml-3 text-teal-300 font-medium">{utcTime}</span>
        </div>

        {/* Live Tracking Always On */}
        <div className="border-l border-gray-700 pl-6">
          <button
            className="px-5 py-3 rounded-md font-medium text-sm shadow-md transition-all duration-300 bg-green-500 hover:bg-green-600 cursor-default"
            disabled
          >
            Live Tracking: ON
          </button>
        </div>

        {/* Mobile Menu Toggle */}
        <button 
          className="md:hidden text-white text-2xl ml-4 focus:outline-none"
          onClick={() => setIsMenuOpen((prev) => !prev)}
          aria-label="Toggle mobile menu"
        >
          ☰
        </button>
      </div>

      {/* Mobile Navigation */}
      {isMenuOpen && (
        <div ref={menuRef} className="md:hidden absolute top-[70px] right-4 bg-gray-800 rounded-md shadow-lg border border-gray-700 w-56 py-3 text-center transition transform origin-top-right">
          <Link to="/" className="block px-6 py-2 hover:bg-gray-700 transition-colors duration-200">Home</Link>
          <Link to="/satellites" className="block px-6 py-2 hover:bg-gray-700 transition-colors duration-200">Satellites</Link>
          <Link to="/launches" className="block px-6 py-2 hover:bg-gray-700 transition-colors duration-200">Launches</Link>
          <Link to="/tracking" className="block px-6 py-2 hover:bg-gray-700 transition-colors duration-200">Tracking</Link>
          <Link to="/gallery" className="block px-6 py-2 hover:bg-gray-700 transition-colors duration-200">Gallery</Link>
          <Link to="/about" className="block px-6 py-2 hover:bg-gray-700 transition-colors duration-200">About</Link>
          <button 
            onClick={() => setIsResourcesOpen((prev) => !prev)} 
            className="block w-full px-6 py-2 hover:bg-gray-700 transition-colors duration-200 text-left focus:outline-none"
            aria-expanded={isResourcesOpen}
            aria-haspopup="true"
          >
            Resources ⏷
          </button>
          {isResourcesOpen && (
            <div className="w-full bg-gray-700 rounded-md text-center py-2 border border-gray-600 transition transform origin-top">
              <a href="https://www.celestrak.com/" target="_blank" rel="noopener noreferrer" className="block py-2 hover:text-teal-300 transition-colors duration-200">
                CelesTrak
              </a>
              <a href="https://www.n2yo.com/" target="_blank" rel="noopener noreferrer" className="block py-2 hover:text-teal-300 transition-colors duration-200">
                N2YO
              </a>
              <a href="https://spaceweather.com/" target="_blank" rel="noopener noreferrer" className="block py-2 hover:text-teal-300 transition-colors duration-200">
                Space Weather
              </a>
              <a href="https://www.nasa.gov/" target="_blank" rel="noopener noreferrer" className="block py-2 hover:text-teal-300 transition-colors duration-200">
                NASA
              </a>
            </div>
          )}
        </div>
      )}
    </nav>
  );
}
