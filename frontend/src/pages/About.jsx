export default function About() {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-900 text-white p-6">
        <h1 className="text-3xl font-bold mb-4">About Satellite Tracker</h1>
        <p className="text-lg text-gray-300 max-w-2xl text-center">
          This project visualizes real-time satellite tracking in a 3D environment.
          Users can explore satellite positions, orbits, and details dynamically.
        </p>
  
        <div className="mt-6 text-center">
          <h2 className="text-xl font-semibold text-blue-400">🔧 Features</h2>
          <ul className="mt-2 space-y-2">
            <li>🛰️ Real-time satellite tracking</li>
            <li>🌍 Interactive 3D Earth visualization</li>
            <li>🔍 Search and filter satellites</li>
            <li>🚀 Smooth animations and transitions</li>
          </ul>
        </div>
  
        <div className="mt-6">
          <h2 className="text-lg font-semibold text-green-400">📡 Data Sources</h2>
          <p className="text-gray-400">
            The satellite data is sourced from **NORAD’s TLE database** and processed for visualization.
          </p>
        </div>
      </div>
    );
  }
  