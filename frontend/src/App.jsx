import { Routes, Route } from "react-router-dom";
import { useState, lazy, Suspense } from "react";
import { Loader2 } from "lucide-react";
import Navbar from "./components/Navbar";
import Footer from "./components/Footer";
import Home from "./pages/Home";

// Non-landing routes are lazy-loaded so the initial / chunk doesn't drag in
// SatelliteDetail's Recharts surfaces or Tracking's second Three.js scene.
// Home stays eager because it's the landing route.
const SatelliteList = lazy(() => import("./pages/SatelliteList"));
const SatelliteDetails = lazy(() => import("./pages/SatelliteDetail"));
const About = lazy(() => import("./pages/About"));
const Launches = lazy(() => import("./pages/Launches"));
const Tracking = lazy(() => import("./pages/Tracking"));

function PageFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center text-gray-300 pt-24">
      <Loader2 size={20} className="animate-spin text-teal-300 mr-2" />
      Loading…
    </div>
  );
}

function App() {
  const [searchQuery, setSearchQuery] = useState("");
  const [isLiveTracking, setIsLiveTracking] = useState(true);

  return (
    <>
      <Navbar
        onSearch={setSearchQuery}
        toggleLiveTracking={() => setIsLiveTracking((prev) => !prev)}
        isLiveTracking={isLiveTracking}
      />
      <Suspense fallback={<PageFallback />}>
        <Routes>
          <Route path="/" element={<Home searchQuery={searchQuery} isLiveTracking={isLiveTracking} />} />
          <Route path="/satellites" element={<SatelliteList searchQuery={searchQuery} />} />
          <Route path="/satellites/:name" element={<SatelliteDetails />} />
          <Route path="/about" element={<About />} />
          <Route path="/launches" element={<Launches />} />
          <Route path="/tracking" element={<Tracking />} />
        </Routes>
      </Suspense>
      <Footer />
    </>
  );
}

export default App;
