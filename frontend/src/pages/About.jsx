import { TypeAnimation } from "react-type-animation";
import { generateStars } from "./Home";

export default function About() {
  return (
    <div className="relative flex flex-col items-center justify-center min-h-screen bg-gradient-to-b from-[#050716] via-[#1B1E3D] to-[#2E4867] text-white p-6 space-y-20 overflow-hidden">
      {/* Background starfield */}
      <div className="absolute w-full h-full pointer-events-none z-0">
        {generateStars(100)}
      </div>
{/* Animated heading */}
<div className="text-4xl max-w-screen-4xl w-full sm:text-5xl md:text-6xl font-extrabold text-center tracking-wide mb-4">
          <TypeAnimation
            sequence={[
              "TLE & SGP4 Orbit Calculations",
              2500,
              "Space Weather Data via NOAA",
              2500,
              "Collision Avoidance & Debris Tracking",
              2500,
              "NASA Observations & Deep-Space Insights",
              2500,
              "Powered by SpaceTrak & Our Dedicated Team",
              3000
            ]}
            speed={50}
            repeat={Infinity}
          />
        </div>
      {/* Main container content */}
      <div className="z-10 max-w-4xl text-center flex flex-col items-center justify-center space-y-8">
        

        {/* Subtitle / Introduction */}
        <p className="text-lg sm:text-xl text-gray-200 leading-relaxed">
          Welcome to our Satellite Tracker project. We combine 
          high-fidelity orbital calculations (SGP4) with real-time 
          TLE data to visualize spacecraft, satellites, and debris 
          around Earth. Our integration of NOAA’s space weather 
          updates ensures you see the full picture—highlighting 
          orbital paths, potential collisions, and more.
        </p>

        {/* Key Features */}
        <div className="w-full bg-[#1E233F] bg-opacity-80 rounded-xl shadow-md p-6 text-left">
          <h2 className="text-2xl font-semibold text-teal-400 mb-3">
            Key Features
          </h2>
          <ul className="list-disc list-inside space-y-2 text-gray-300">
            <li>Interactive 3D Earth for real-time satellite orbits</li>
            <li>Filtering by launch year, country, mission type, and more</li>
            <li>Customizable camera controls (zoom, pan, track selected satellite)</li>
            <li>Real-time “space weather” integration via NOAA</li>
            <li>High-performance rendering using GPU-accelerated WebGL</li>
          </ul>
        </div>

        {/* Data Sources */}
        <div className="w-full bg-[#253654] bg-opacity-80 rounded-xl shadow-md p-6 text-left">
          <h2 className="text-2xl font-semibold text-blue-300 mb-3">
            Data Sources
          </h2>
          <p className="text-gray-300 leading-relaxed">
            We rely on multiple reputable sources, including:
          </p>
          <ul className="list-disc list-inside space-y-2 mt-2 text-gray-300">
            <li>NORAD’s Two-Line Element sets (TLEs) for orbital parameters</li>
            <li>NOAA for space weather forecasts and solar activity data</li>
            <li>SpaceTrak for curated satellite data and historical records</li>
            <li>NASA observational archives for deep-space mission tracking</li>
          </ul>
        </div>

        {/* About Us */}
        <div className="w-full bg-[#2E4867] bg-opacity-80 rounded-xl shadow-md p-6 text-left">
          <h2 className="text-2xl font-semibold text-green-400 mb-3">
            About Us
          </h2>
          <p className="text-gray-200 leading-relaxed">
            Our mission is to make orbital data more accessible and engaging 
            for researchers, educators, and enthusiasts. By weaving together 
            space weather insights, near-Earth object tracking, and open 
            source visualization tools, we aim to foster a deeper understanding 
            of Earth’s space environment. Whether you’re analyzing 
            collision risks, studying orbital evolution, or simply marveling 
            at human ingenuity in orbit, we invite you to explore our 
            ever-expanding platform.
          </p>
        </div>
      </div>
    </div>
  );
}
