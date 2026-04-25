// Global footer mounted from App.jsx so every route ends with a defined edge
// instead of trailing into space. Intentionally subtle — gray on the existing
// gradient, no accents fighting the page chrome above it.
import React from "react";
import { Link } from "react-router-dom";

export default function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer className="relative z-10 mt-16 border-t border-gray-800/70 bg-gray-950/80 backdrop-blur-sm">
      <div className="max-w-7xl mx-auto px-6 py-8 flex flex-col md:flex-row md:items-center md:justify-between gap-4 text-sm text-gray-400">
        <div className="flex flex-col md:flex-row md:items-center gap-2 md:gap-4">
          <span className="font-mono text-teal-300">Sat-Track</span>
          <span className="hidden md:inline text-gray-600">·</span>
          <span>
            Built on real public data — Space-Track, NOAA SWPC, SpaceLaunchNow.
          </span>
        </div>
        <div className="flex items-center gap-5">
          <Link to="/about" className="hover:text-teal-300 transition-colors">
            About
          </Link>
          <a
            href="https://github.com/mannyzzle/Satellite-Interactive-Visualizer-And-Fleet-Optimization"
            target="_blank"
            rel="noreferrer"
            className="hover:text-teal-300 transition-colors"
          >
            GitHub
          </a>
          <span className="text-gray-600 font-mono text-xs">© {year}</span>
        </div>
      </div>
    </footer>
  );
}
