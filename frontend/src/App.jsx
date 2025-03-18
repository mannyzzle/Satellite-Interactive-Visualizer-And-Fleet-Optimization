import { Routes, Route } from "react-router-dom";
import { useState } from "react";
import Navbar from "./components/Navbar";
import Home from "./pages/Home";
import SatelliteList from "./pages/SatelliteList";
import SatelliteDetails from "./pages/SatelliteDetail";
import About from "./pages/About";
import Launches from "./pages/Launches"; // 🚀 Import the new Launches page
import Tracking from "./pages/Tracking"; // 
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
      <Routes>
        <Route path="/" element={<Home searchQuery={searchQuery} isLiveTracking={isLiveTracking} />} />
        <Route path="/satellites" element={<SatelliteList searchQuery={searchQuery} />} />
        <Route path="/satellites/:name" element={<SatelliteDetails />} />
        <Route path="/about" element={<About />} />
        <Route path="/launches" element={<Launches />} /> 
        <Route path="/tracking" element={<Tracking />} /> 
      </Routes>
    </>
  );
}

export default App;
