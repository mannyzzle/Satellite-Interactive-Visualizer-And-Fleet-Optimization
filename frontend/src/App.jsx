// src/App.jsx
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import Navbar from "./components/Navbar"; 
import Home from "./pages/Home";
import SatelliteList from "./pages/SatelliteList";
import SatelliteDetails from "./pages/SatelliteDetail";

function App() {
  return (
    <Router>
      <Navbar />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/satellites" element={<SatelliteList />} />
        <Route path="/satellites/:name" element={<SatelliteDetails />} /> {/* ✅ Correct route */}
      </Routes>
    </Router>
  );
}

export default App;