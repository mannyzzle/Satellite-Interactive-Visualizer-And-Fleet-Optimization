// src/components/Navbar.jsx



import { Link } from "react-router-dom";

export default function Navbar() {
  return (
    <nav className="w-full bg-gray-900 text-white p-4 flex justify-between items-center fixed top-0 left-0 z-50">
      <h1 className="text-xl font-bold">🛰️ Satellite Tracker</h1>
      <div className="flex space-x-4">
        <Link to="/" className="hover:text-blue-400">Home</Link>
        <Link to="/satellites" className="hover:text-blue-400">Satellites</Link>
      </div>
    </nav>
  );
}
