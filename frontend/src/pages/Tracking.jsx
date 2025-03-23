import React, { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { TypeAnimation } from "react-type-animation";
import * as satellite from "satellite.js";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

/* ------------------------------------------------------------------
   1) Mako Gradient + Starfield
------------------------------------------------------------------ */
function useStableStars(numStars, generateStarsFn) {
  const starsRef = useRef(null);
  if (!starsRef.current) {
    starsRef.current = generateStarsFn(numStars);
  }
  return starsRef.current;
}

function generateStars(numStars) {
  return Array.from({ length: numStars }).map((_, i) => {
    const size = Math.random() * 3 + 1;
    const duration = Math.random() * 5 + 3;
    const positionX = Math.random() * 100;
    const positionY = Math.random() * 100;
    return (
      <motion.div
        key={i}
        className="absolute bg-white rounded-full"
        style={{
          width: `${size}px`,
          height: `${size}px`,
          left: `${positionX}%`,
          top: `${positionY}%`,
          opacity: Math.random() * 0.5 + 0.3,
          filter: "drop-shadow(0 0 5px rgba(255, 255, 255, 0.8))",
        }}
        animate={{ opacity: [0.2, 1, 0.2] }}
        transition={{
          duration,
          repeat: Infinity,
          ease: "easeInOut",
        }}
      />
    );
  });
}

/* ------------------------------------------------------------------
   2) API Endpoints
------------------------------------------------------------------ */

//FOR PRODUCTION

const API_BASE_URL = "https://satellite-tracker-production.up.railway.app/api/satellites";
const CDM_URL = "https://satellite-tracker-production.up.railway.app/api/cdm/fetch";
const SUGGEST_URL = "https://satellite-tracker-production.up.railway.app/api/satellites/suggest";


// FOR DEV
//const API_BASE_URL = "http://localhost:8000/api/satellites";
//const CDM_URL = "http://localhost:8000/api/cdm/fetch";
//const SUGGEST_URL = "http://localhost:8000/api/satellites/suggest";

/* ------------------------------------------------------------------
   3) Earth Textures (Day/Night)
------------------------------------------------------------------ */
const basePath = import.meta.env.BASE_URL;
const dayTexture = `${basePath}earth_day.jpg`;
const nightTexture = `${basePath}earth_night.jpg`;

const textureLoader = new THREE.TextureLoader();
const dayMap = textureLoader.load(dayTexture);
const nightMap = textureLoader.load(nightTexture);

export default function Tracking() {
  /* -------------------------------------------------------------
     State Variables
  ------------------------------------------------------------- */
  const [searchQuery, setSearchQuery] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedSatellite, setSelectedSatellite] = useState(null);
  const [cdmEvents, setCdmEvents] = useState([]);

  // Propagation
  const [isPaused, setIsPaused] = useState(false);
  const [speedFactor, setSpeedFactor] = useState(1);

  // Toggles & Camera
  const [showOrbitHistory, setShowOrbitHistory] = useState(true);
  const [isFocusEnabled, setIsFocusEnabled] = useState(false);
  const [cameraMode, setCameraMode] = useState("sideHorizon"); // "sideHorizon" | "topView" | "topFront"
  const [cameraZoom, setCameraZoom] = useState(1);

  // NEW: Nearby orbits count (0 means disabled)
  const [nearbyCount, setNearbyCount] = useState(0);
  const [nearbyLoading, setNearbyLoading] = useState(false);

  // Telemetry overlay
  const [lastVelocity, setLastVelocity] = useState("0.00");
  const [lastAltitude, setLastAltitude] = useState("0.00");
  const [lastPosition, setLastPosition] = useState({ x: "0.00", y: "0.00", z: "0.00" });

  // Chart data
  const [velocityData, setVelocityData] = useState([]);
  const [altitudeData, setAltitudeData] = useState([]);
  const [bstarData, setBstarData] = useState([]);

  // 3D references
  const mountRef = useRef(null);
  const sceneRef = useRef(null);
  const cameraRef = useRef(null);
  const rendererRef = useRef(null);
  const controlsRef = useRef(null);

  // Earth & Satellite references
  const globeRef = useRef(null);
  const satelliteMeshRef = useRef(null);
  const orbitLineRef = useRef(null);
  const satrecRef = useRef(null);
  const simulationTimeRef = useRef(Date.now());

  // NEW: Refs to store nearby orbit lines and nearby satellite data (mesh + satrec)
  const nearbyOrbitLinesRef = useRef([]);
  const nearbySatellitesRef = useRef([]);

  // Generate stable starfield
  const stableStars = useStableStars(150, generateStars);

  // Keep refs in sync with state
  const isPausedRef = useRef(false);
  const speedFactorRef = useRef(1);
  const isFocusEnabledRef = useRef(false);
  const cameraModeRef = useRef("sideHorizon");
  const cameraZoomRef = useRef(1);
  useEffect(() => {
    isPausedRef.current = isPaused;
    speedFactorRef.current = speedFactor;
    isFocusEnabledRef.current = isFocusEnabled;
    cameraModeRef.current = cameraMode;
    cameraZoomRef.current = cameraZoom;
  }, [isPaused, speedFactor, isFocusEnabled, cameraMode, cameraZoom]);

  // Add this near your other state variables
const [simTime, setSimTime] = useState(new Date(simulationTimeRef.current));

// Update simulation time on an interval (e.g., every second)
useEffect(() => {
  const interval = setInterval(() => {
    setSimTime(new Date(simulationTimeRef.current));
  }, 1000);
  return () => clearInterval(interval);
}, []);


  /* -------------------------------------------------------------
     4) Fetch Active CDM on Mount
  ------------------------------------------------------------- */
  useEffect(() => {
    async function fetchActiveCDM() {
      try {
        const res = await fetch(CDM_URL);
        if (!res.ok) throw new Error(`CDM fetch error: ${res.status}`);
        const data = await res.json();
        const active = data.cdm_events?.filter((ev) => ev.is_active) || [];
        setCdmEvents(active);
      } catch (err) {
        console.error("Failed to fetch CDM events:", err);
      }
    }
    fetchActiveCDM();
  }, []);

  /* -------------------------------------------------------------
     5) Autocomplete Suggestions
  ------------------------------------------------------------- */
  useEffect(() => {
    if (!searchQuery) {
      setSuggestions([]);
      return;
    }
    const delayDebounce = setTimeout(async () => {
      try {
        const resp = await fetch(`${SUGGEST_URL}?query=${searchQuery}`);
        if (!resp.ok) throw new Error("Suggestion fetch error");
        const { suggestions: sugs } = await resp.json();
        setSuggestions(sugs || []);
      } catch (err) {
        console.error("Error fetching suggestions:", err);
      }
    }, 300);
    return () => clearTimeout(delayDebounce);
  }, [searchQuery]);

  /* -------------------------------------------------------------
     6) Initialize Three.js Scene
  ------------------------------------------------------------- */
  useEffect(() => {
    if (!mountRef.current) return;
    const width = mountRef.current.clientWidth;
    const height = mountRef.current.clientHeight;

    const scene = new THREE.Scene();
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 9999999);
    camera.position.set(6371 * 3, 0, 0);
    camera.lookAt(0, 0, 0);
    cameraRef.current = camera;

    const light = new THREE.DirectionalLight(0xffffff, 1);
    light.position.set(10000, 10000, 10000);
    scene.add(light);

    const globe = new THREE.Mesh(
      new THREE.SphereGeometry(6371, 64, 64),
      new THREE.MeshStandardMaterial({
        map: dayMap,
        emissiveMap: nightMap,
        emissiveIntensity: 0.2,
        emissive: new THREE.Color(0xffffff),
        bumpScale: 0.4,
        roughness: 1.2,
        metalness: 0.3,
      })
    );
    globeRef.current = globe;
    scene.add(globe);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    mountRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.1;
    controlsRef.current = controls;

    let lastTime = performance.now();

    // Animation loop
    const animate = (now) => {
      requestAnimationFrame(animate);
      const deltaMs = now - lastTime;
      lastTime = now;

      if (!isPausedRef.current && satrecRef.current) {
        simulationTimeRef.current += deltaMs * speedFactorRef.current;
      }

      // Update main satellite position & telemetry
      if (satrecRef.current && satelliteMeshRef.current) {
        const currentDate = new Date(simulationTimeRef.current);
        const posVel = satellite.propagate(satrecRef.current, currentDate);
        if (posVel.position && posVel.velocity) {
          const { x, y, z } = posVel.position;
          satelliteMeshRef.current.position.set(x, z, -y);
          const gmst = satellite.gstime(currentDate);
          const geo = satellite.eciToGeodetic(posVel.position, gmst);
          const alt = geo.height;
          setLastAltitude(alt.toFixed(2));
          setLastPosition({
            x: x.toFixed(2),
            y: y.toFixed(2),
            z: z.toFixed(2),
          });
          const vx = posVel.velocity.x;
          const vy = posVel.velocity.y;
          const vz = posVel.velocity.z;
          const velocity = Math.sqrt(vx * vx + vy * vy + vz * vz);
          setLastVelocity(velocity.toFixed(2));
          addTelemetry(velocity, alt, satrecRef.current.bstar);
        }
      }

      // Update nearby satellites positions if not paused
      if (!isPausedRef.current && nearbySatellitesRef.current.length > 0) {
        const currentDate = new Date(simulationTimeRef.current);
        nearbySatellitesRef.current.forEach(item => {
          const posVel = satellite.propagate(item.satrec, currentDate);
          if (posVel.position) {
            const { x, y, z } = posVel.position;
            item.mesh.position.set(x, z, -y);
          }
        });
      }

      // Continuous camera tracking for main satellite
      if (isFocusEnabledRef.current && satelliteMeshRef.current && cameraRef.current) {
        const satPos = satelliteMeshRef.current.position.clone();
        let baseOffset = new THREE.Vector3();
        if (cameraModeRef.current === "topFront") {
          baseOffset.set(0, 800, 800);
        } else if (cameraModeRef.current === "topView") {
          baseOffset.set(0, 3000, 0);
        } else {
          baseOffset.set(2000, 0, 0);
        }
        baseOffset.multiplyScalar(cameraZoomRef.current);
        const desiredPos = satPos.clone().add(baseOffset);
        const minDistance = 6371 + 200;
        const maxDistance = 6371 * 50;
        const dist = desiredPos.length();
        if (dist < minDistance) {
          desiredPos.setLength(minDistance);
        } else if (dist > maxDistance) {
          desiredPos.setLength(maxDistance);
        }
        cameraRef.current.position.lerp(desiredPos, 0.08);
        cameraRef.current.lookAt(satPos);
      }

      controls.update();
      renderer.render(scene, camera);
    };
    animate(performance.now());

    return () => {
      if (renderer) renderer.dispose();
      if (mountRef.current && renderer.domElement) {
        mountRef.current.removeChild(renderer.domElement);
      }
    };
  }, []);

  // Hide/Show main orbit line when toggled
  useEffect(() => {
    if (orbitLineRef.current) {
      orbitLineRef.current.visible = showOrbitHistory;
    }
  }, [showOrbitHistory]);

  /* -------------------------------------------------------------
     7) Build Orbit for a Satellite using raw ECI positions
  ------------------------------------------------------------- */
  function buildOrbitLineWithColor(satrec, color) {
    if (!sceneRef.current) return null;
    const periodMin = satrec.period ?? (satrec.no ? (2 * Math.PI) / satrec.no : null);
    if (!periodMin) {
      console.warn("No valid orbital period available");
      return null;
    }
    const numPoints = 500;
    const orbitPoints = [];
    const baseTime = Date.now() / 1000;
    for (let i = 0; i <= numPoints; i++) {
      const offsetSec = (i / numPoints) * periodMin * 60;
      const posVel = satellite.propagate(satrec, new Date((baseTime + offsetSec) * 1000));
      if (!posVel.position) continue;
      const { x, y, z } = posVel.position;
      orbitPoints.push(new THREE.Vector3(x, z, -y));
    }
    if (!orbitPoints.length) return null;
    const orbitGeo = new THREE.BufferGeometry().setFromPoints(orbitPoints);
    return new THREE.Line(orbitGeo, new THREE.LineBasicMaterial({ color }));
  }

  // Helper: Build a small satellite mesh (yellow)
  function buildSatelliteMesh(satrec) {
    const geo = new THREE.SphereGeometry(80, 8, 8);
    // Nearby satellites remain yellow
    const mat = new THREE.MeshBasicMaterial({ color: 0xffff00 });
    return new THREE.Mesh(geo, mat);
  }
  

  /* -------------------------------------------------------------
     8) On Main Satellite Selection
  ------------------------------------------------------------- */
  useEffect(() => {
    if (!selectedSatellite || !selectedSatellite.tle_line1 || !selectedSatellite.tle_line2) {
      satrecRef.current = null;
      if (satelliteMeshRef.current && sceneRef.current) {
        sceneRef.current.remove(satelliteMeshRef.current);
        satelliteMeshRef.current = null;
      }
      if (orbitLineRef.current && sceneRef.current) {
        sceneRef.current.remove(orbitLineRef.current);
        orbitLineRef.current = null;
      }
      return;
    }
    try {
      const rec = satellite.twoline2satrec(
        selectedSatellite.tle_line1.trim(),
        selectedSatellite.tle_line2.trim()
      );
      satrecRef.current = rec;
      if (satelliteMeshRef.current) {
        sceneRef.current.remove(satelliteMeshRef.current);
        satelliteMeshRef.current.geometry.dispose();
        satelliteMeshRef.current.material.dispose();
        satelliteMeshRef.current = null;
      }
      if (orbitLineRef.current) {
        sceneRef.current.remove(orbitLineRef.current);
        orbitLineRef.current.geometry.dispose();
        orbitLineRef.current.material.dispose();
        orbitLineRef.current = null;
      }
      // Create main satellite mesh (yellow)
      const satGeo = new THREE.SphereGeometry(120, 16, 16);
      // Create main satellite mesh (bright green)
      const satMat = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
      const satMesh = new THREE.Mesh(satGeo, satMat);
      satelliteMeshRef.current = satMesh;
      sceneRef.current.add(satMesh);
      // Build and add main orbit line
      const orbitLine = buildOrbitLineWithColor(rec, 0x0ea5e9);
      if (orbitLine) {
        orbitLineRef.current = orbitLine;
        sceneRef.current.add(orbitLine);
      }
      simulationTimeRef.current = Date.now();
      setVelocityData([]);
      setAltitudeData([]);
      setBstarData([]);
    } catch (err) {
      console.error("Error parsing TLE:", err);
      satrecRef.current = null;
    }
  }, [selectedSatellite]);

  /* -------------------------------------------------------------
     9) Fetch Nearby Orbits and Satellite Meshes
  ------------------------------------------------------------- */
  useEffect(() => {
    // Remove existing nearby orbit lines and satellite meshes
    nearbyOrbitLinesRef.current.forEach(line => {
      if (sceneRef.current) sceneRef.current.remove(line);
    });
    nearbyOrbitLinesRef.current = [];
    nearbySatellitesRef.current.forEach(item => {
      if (sceneRef.current) sceneRef.current.remove(item.mesh);
    });
    nearbySatellitesRef.current = [];

    if (!selectedSatellite || nearbyCount < 1) return;

    const controller = new AbortController();
    async function fetchNearby() {
      setNearbyLoading(true);
      try {
        const url = `${API_BASE_URL}/nearby/${selectedSatellite.norad_number}?limit=${nearbyCount}`;
        const resp = await fetch(url, { signal: controller.signal });
        if (!resp.ok) throw new Error(`Nearby fetch error: ${resp.status}`);
        const data = await resp.json();
        const sats = data.nearby_satellites || [];
        const orbitLines = [];
        const satelliteItems = [];
        sats.forEach(sat => {
          if (!sat.tle_line1 || !sat.tle_line2) return;
          const rec = satellite.twoline2satrec(sat.tle_line1.trim(), sat.tle_line2.trim());
          // Build nearby orbit line in red
          const orbitLine = buildOrbitLineWithColor(rec, 0xff0000);
          if (orbitLine && sceneRef.current) {
            sceneRef.current.add(orbitLine);
            orbitLines.push(orbitLine);
          }
          // Build nearby satellite mesh (yellow)
          const mesh = buildSatelliteMesh(rec);
          if (mesh && sceneRef.current) {
            const posVel = satellite.propagate(rec, new Date(simulationTimeRef.current));
            if (posVel.position) {
              const { x, y, z } = posVel.position;
              mesh.position.set(x, z, -y);
            }
            sceneRef.current.add(mesh);
            satelliteItems.push({ satrec: rec, mesh });
          }
        });
        nearbyOrbitLinesRef.current = orbitLines;
        nearbySatellitesRef.current = satelliteItems;
      } catch (err) {
        console.error("Error fetching nearby orbits:", err);
      } finally {
        setNearbyLoading(false);
      }
    }
    fetchNearby();
    return () => {
      controller.abort();
    };
  }, [selectedSatellite, nearbyCount]);

  /* -------------------------------------------------------------
     10) Searching & Suggestions
  ------------------------------------------------------------- */
  const handleSearch = async () => {
    if (!searchQuery) return;
    setLoading(true);
    try {
      let url;
      const numeric = /^\d+$/.test(searchQuery);
      if (numeric) {
        url = `${API_BASE_URL}/by_norad/${searchQuery}`;
      } else {
        const formatted = encodeURIComponent(searchQuery.toLowerCase());
        url = `${API_BASE_URL}/${formatted}`;
      }
      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`Search error: ${resp.status}`);
      const sat = await resp.json();
      setSelectedSatellite(sat);
      setSuggestions([]);
    } catch (err) {
      console.error("Error searching satellite:", err);
      setSelectedSatellite(null);
    } finally {
      setLoading(false);
    }
  };

  const handleSuggestionClick = async (sug) => {
    setSearchQuery(sug.name);
    setSuggestions([]);
    setLoading(true);
    try {
      let url;
      if (sug.norad_number) {
        url = `${API_BASE_URL}/by_norad/${sug.norad_number}`;
      } else {
        const formatted = encodeURIComponent(sug.name.toLowerCase());
        url = `${API_BASE_URL}/${formatted}`;
      }
      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`Search error: ${resp.status}`);
      const sat = await resp.json();
      setSelectedSatellite(sat);
    } catch (err) {
      console.error("Error searching from suggestion:", err);
      setSelectedSatellite(null);
    } finally {
      setLoading(false);
    }
  };

  /* -------------------------------------------------------------
     11) Add Telemetry for Charts
  ------------------------------------------------------------- */
  function addTelemetry(velocity, altitude, bstarVal) {
    setVelocityData((prev) => [...prev, velocity]);
    setAltitudeData((prev) => [...prev, altitude]);
    setBstarData((prev) => [...prev, bstarVal]);
  }

  /* -------------------------------------------------------------
     12) Render Chart
  ------------------------------------------------------------- */
  function renderChart(dataArray, color, label) {
    const width = 400;
    const height = 160;
    const margin = { top: 20, right: 30, bottom: 20, left: 40 };
    const chartWidth = width - margin.left - margin.right;
    const chartHeight = height - margin.top - margin.bottom;

    if (dataArray.length < 2) {
      return (
        <div className="w-full">
          <div className="text-sm text-[#a5f3fc] mb-1">{label}</div>
          <svg width="100%" height={height} style={{ backgroundColor: "rgba(0,0,0,0.3)" }}>
            <text x="50%" y="50%" textAnchor="middle" fill="#fef9c3">
              Not enough data...
            </text>
          </svg>
        </div>
      );
    }

    let minVal = Math.min(...dataArray);
    let maxVal = Math.max(...dataArray);

    if (label === "Velocity (km/s)") {
      const buffer = (maxVal - minVal) * 0.05 || 0.0001;
      minVal -= buffer;
      maxVal += buffer;
    } else {
      const padding = (maxVal - minVal) * 0.001;
      minVal -= padding;
      maxVal += padding;
    }

    const padding = (maxVal - minVal) * 0.1;
    minVal -= padding;
    maxVal += padding;

    minVal = Math.floor(minVal * 100) / 100;
    maxVal = Math.ceil(maxVal * 100) / 100;

    const range = maxVal - minVal;
    const scaleY = (val) => ((val - minVal) / range) * chartHeight;

    const pathData = dataArray
      .map((val, i) => {
        const x = (i / (dataArray.length - 1)) * chartWidth;
        const y = chartHeight - scaleY(val);
        return i === 0 ? `M${x},${y}` : `L${x},${y}`;
      })
      .join(" ");

    const tickCount = 4;
    const ticks = Array.from({ length: tickCount + 1 }, (_, i) => {
      const v = minVal + (i * range) / tickCount;
      const y = chartHeight - scaleY(v);
      return (
        <g key={i}>
          <line x1={0} x2={chartWidth} y1={y} y2={y} stroke="#3b82f6" strokeWidth="0.5" />
          <text x={-6} y={y + 3} fontSize="10" fill="#a5f3fc" textAnchor="end">
            {v.toFixed(2)}
          </text>
        </g>
      );
    });

    return (
      <div className="w-full">
        <div className="text-sm text-[#a5f3fc] mb-1">{label}</div>
        <svg
          width="100%"
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          className="rounded-md"
          style={{ backgroundColor: "rgba(0, 0, 0, 0.3)" }}
        >
          <g transform={`translate(${margin.left},${margin.top})`}>
            {ticks}
            <line x1={0} x2={chartWidth} y1={chartHeight} y2={chartHeight} stroke="#6ee7b7" strokeWidth="1" />
            <path d={pathData} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" />
          </g>
        </svg>
      </div>
    );
  }

  /* -------------------------------------------------------------
     13) Render
  ------------------------------------------------------------- */
  return (
    <div
      className="relative flex flex-col w-screen min-h-screen pt-[120px] overflow-hidden text-white"
      style={{ background: "linear-gradient(to bottom, #050716 0%, #1B1E3D 50%, #2E4867 100%)" }}
    >
      {/* Starfield */}
      <div className="absolute w-full h-full overflow-hidden pointer-events-none z-0">
        {stableStars}
      </div>

     {/* ---------- TOP / HERO SECTION ---------- */}
<section className="relative min-h-[90vh] w-full flex flex-col justify-center items-center text-white overflow-hidden">
  {/* Dark overlay for extra contrast */}
  <div className="absolute inset-0  pointer-events-none" />

  <div className="relative z-10 w-full max-w-6xl mx-auto px-6 py-16 text-center space-y-8">
    {/* Heading with TypeAnimation */}
    <motion.h1
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.8 }}
      className="text-4xl sm:text-5xl md:text-6xl font-extrabold leading-tight
                 bg-clip-text text-transparent bg-gradient-to-r from-teal-300 to-blue-400"
    >
      <TypeAnimation
        sequence={[
          "Real-Time Satellite Tracking & CDM Monitoring",
          3000,
          "NOAA Data Integration & TLE Processing",
          3000,
          "Predictive Analytics for Collision Avoidance",
          3500,
        ]}
        speed={40}
        repeat={Infinity}
      />
    </motion.h1>

    {/* Subtext */}
    <motion.p
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2, duration: 0.8 }}
      className="mx-auto max-w-3xl text-teal-200 text-lg sm:text-xl leading-relaxed"
    >
      Monitor real-time satellite positions and orbital parameters with precise TLE propagation.
      Integrated CDM event tracking ensures early detection of potential conjunctions,
      supporting advanced predictive analytics for risk assessment and space situational awareness.
    </motion.p>

    {/* Cards Row */}
    <div className="flex flex-col md:flex-row gap-8 justify-center items-start mt-6">
      {/* Search Card */}
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.3, duration: 0.6 }}
        className="bg-black/60 backdrop-blur-lg p-8 rounded-xl border border-teal-700 shadow-xl w-full md:w-[420px]"
      >
        <label className="block mb-2 text-sm font-semibold text-teal-100">
          Search Satellite (Name or NORAD)
        </label>
        <div className="relative">
          <input
            type="text"
            placeholder="STARLINK-3000 or 76000"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full p-2 rounded-md bg-black/70 text-teal-100 outline-none
                       placeholder-gray-400 border border-teal-600 focus:border-teal-400"
          />
          {suggestions.length > 0 && (
            <ul className="absolute left-0 top-[105%] w-full max-h-48 overflow-y-auto bg-black text-teal-100 border border-teal-700 rounded-md shadow-md z-50">
              {suggestions.map((sug, idx) => (
                <li
                  key={idx}
                  className="p-2 hover:bg-teal-700 cursor-pointer"
                  onClick={() => handleSuggestionClick(sug)}
                >
                  {sug.name} ({sug.norad_number})
                </li>
              ))}
            </ul>
          )}
        </div>
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={handleSearch}
          className="mt-4 w-full px-4 py-2 bg-teal-500 hover:bg-teal-600 text-white rounded-md font-medium
                     shadow transition-colors"
        >
          {loading ? "Searching..." : "Search"}
        </motion.button>
      </motion.div>

{/* CDM Events Card */}
<motion.div
  initial={{ opacity: 0, scale: 0.9 }}
  animate={{ opacity: 1, scale: 1 }}
  transition={{ delay: 0.4, duration: 0.6 }}
  className="bg-black/60 backdrop-blur-lg p-8 rounded-xl border border-teal-700 shadow-xl w-full md:w-[420px]"
>
  <h4 className="text-teal-100 font-semibold mb-4 text-xl">Active CDM Events</h4>
  <div className="max-h-60 overflow-y-auto space-y-4">
    {cdmEvents.length === 0 ? (
      <p className="text-teal-400">No active events</p>
    ) : (
      cdmEvents.map((ev) => {
        // Convert Probability of Collision (pc) to a percentage with 3 decimals:
        const collisionPercent = (ev.pc * 100).toFixed(3);

        return (
          <div
            key={ev.cdm_id}
            className="p-3 rounded-md bg-black/50 border border-teal-700 last:mb-0 text-left"
          >
            {/* CDM Identifiers */}
            <p className="text-teal-200">
              <strong>CDM ID:</strong> {ev.cdm_id}
            </p>
            <p className="text-teal-300">
              <strong>Created On:</strong> {ev.created}
            </p>

            {/* TCA & Range */}
            <p className="text-teal-300">
              <strong>Time of Closest Approach:</strong> {ev.tca}
            </p>
            <p className="text-teal-300">
              <strong>Minimum Range:</strong> {ev.min_rng} km
            </p>

            {/* Probability of Collision as a percentage */}
            <p className="text-teal-300">
              <strong>Collision Probability:</strong> {collisionPercent}%
            </p>

            {/* Satellite #1 Details */}
            <p className="text-teal-200 mt-2">
              <strong>Satellite #1 ID:</strong> {ev.sat_1_id}
            </p>
            <p className="text-teal-200">
              <strong>Name/Type:</strong> {ev.sat_1_name} ({ev.sat_1_type})
            </p>
            <p className="text-teal-200">
              <strong>RCS:</strong> {ev.sat_1_rcs} &mdash; 
              <strong> Excl. Volume:</strong> {ev.sat_1_excl_vol}
            </p>

            {/* Satellite #2 Details */}
            <p className="text-teal-200 mt-2">
              <strong>Satellite #2 ID:</strong> {ev.sat_2_id}
            </p>
            <p className="text-teal-200">
              <strong>Name/Type:</strong> {ev.sat_2_name} ({ev.sat_2_type})
            </p>
            <p className="text-teal-200">
              <strong>RCS:</strong> {ev.sat_2_rcs} &mdash; 
              <strong> Excl. Volume:</strong> {ev.sat_2_excl_vol}
            </p>

            {/* Emergency & Active Status */}
            <p className="text-teal-300 mt-2">
              <strong>Emergency Reportable:</strong> {ev.emergency_reportable ? "Yes" : "No"}
            </p>
            <p className="text-teal-300">
              <strong>Currently Active:</strong> {ev.is_active ? "Yes" : "No"}
            </p>
          </div>
        );
      })
    )}
  </div>
</motion.div>

    </div>
  </div>
</section>



      {/* ---------- MAIN SECTION (3D + Controls) ---------- */}
      <section className="z-10 flex flex-row w-full max-w-screen-2xl mx-auto px-8 gap-6 relative">
        {/* 3D UI Container */}
        <div className="relative flex-1 rounded-lg min-h-[600px] h-[65vh] overflow-hidden border border-teal-700">
          <div ref={mountRef} className="absolute inset-0" />
          {/* Telemetry overlay */}
        <div className="absolute top-4 left-4 bg-black/60 text-sm text-teal-100 p-3 rounded shadow z-50 w-52">
          <p>Velocity: {lastVelocity} km/s</p>
          <p>Altitude: {lastAltitude} km</p>
          <p>X={lastPosition.x}, Y={lastPosition.y}, Z={lastPosition.z}</p>
          <p>Time: {simTime.toLocaleTimeString()}</p>
        </div>

        </div>

        {/* Control Panel */}
        <div className="w-80 bg-black/40 rounded-lg shadow-lg p-4 flex flex-col gap-4 border border-teal-700">
          <h3 className="text-lg font-semibold text-teal-200 border-b border-teal-700 pb-2">
            Satellite Controls
          </h3>

          <div>
            <label className="text-sm text-teal-100 mb-1 block">Selected Satellite</label>
            <div className="bg-black p-2 rounded text-teal-200 h-10 border border-teal-700">
              {selectedSatellite ? selectedSatellite.name : "None"}
            </div>
          </div>

          {/* Pause / Resume */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-teal-100">Propagation</span>
            <button
              onClick={() => setIsPaused((prev) => !prev)}
              className={`px-3 py-1 rounded-md text-sm font-semibold ${isPaused ? "bg-green-500" : "bg-red-500"}`}
            >
              {isPaused ? "Resume" : "Pause"}
            </button>
          </div>

          {/* Speed Factor */}
          <div>
            <label className="text-sm text-teal-100 mb-1 block">Speed Factor</label>
            <input
              type="range"
              min="1"
              max="10"
              value={speedFactor}
              onChange={(e) => setSpeedFactor(Number(e.target.value))}
              className="w-full"
            />
            <p className="text-xs text-teal-300 mt-1">Current speed factor: {speedFactor}x</p>
          </div>

          {/* Orbit Path Toggle */}
          <div className="flex items-center">
            <label className="mr-2 text-sm text-teal-100">Show Orbit Path</label>
            <input
              type="checkbox"
              checked={showOrbitHistory}
              onChange={() => setShowOrbitHistory((p) => !p)}
              className="cursor-pointer"
            />
          </div>

          {/* Focus on Satellite Toggle */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-teal-100">Focus on Satellite</span>
            <button
              onClick={() => setIsFocusEnabled((prev) => !prev)}
              className={`px-3 py-1 rounded-md text-sm font-semibold ${isFocusEnabled ? "bg-purple-500" : "bg-gray-600"}`}
            >
              {isFocusEnabled ? "Disable" : "Enable"}
            </button>
          </div>

          {/* Camera Mode */}
          <div>
            <label className="text-sm text-teal-100 mb-1 block">Camera Mode</label>
            <select
              value={cameraMode}
              onChange={(e) => setCameraMode(e.target.value)}
              className="bg-black text-teal-100 p-2 rounded w-full border border-teal-700"
            >
              <option value="sideHorizon">Side Horizon</option>
              <option value="topView">Top View</option>
              <option value="topFront">Top &amp; Front View</option>
            </select>
          </div>

          {/* Zoom Panel: only visible when focus is enabled */}
          {isFocusEnabled && (
            <div>
              <label className="text-sm text-teal-100 mb-1 block">Zoom</label>
              <input
                type="range"
                min="0.2"
                max="10"
                step="0.1"
                value={cameraZoom}
                onChange={(e) => setCameraZoom(Number(e.target.value))}
                className="w-full"
              />
              <p className="text-xs text-teal-300 mt-1">Zoom level: {cameraZoom}x</p>
            </div>
          )}

          {/* NEW: Nearby Orbits Panel */}
          <div>
            <label className="text-sm text-teal-100 mb-1 block">Nearby Orbits (1-100)</label>
            <input
              type="range"
              min="0"
              max="100"
              step="1"
              value={nearbyCount}
              onChange={(e) => setNearbyCount(Number(e.target.value))}
              className="w-full"
            />
            {nearbyCount > 0 && (
              <p className="text-xs text-teal-300 mt-1">
                Showing {nearbyCount} nearby orbit(s){nearbyLoading && " (Loading...)"}
              </p>
            )}
          </div>
        </div>
      </section>

      {/* ---------- BOTTOM GRAPHS SECTION ---------- */}
      <section className="z-10 w-full max-w-screen-2xl mx-auto px-8 mt-10 mb-16">
        <h2 className="text-2xl font-semibold text-center mb-6 text-teal-100">
          Satellite Telemetry &amp; Historical Trends
        </h2>
        <div className="flex flex-wrap gap-6 justify-center">
          <div className="flex-1 min-w-[300px] max-w-md p-4">
            {renderChart(velocityData, "#14b8a6", "Velocity (km/s)")}
          </div>
          <div className="flex-1 min-w-[300px] max-w-md p-4">
            {renderChart(altitudeData, "#0ea5e9", "Altitude (km)")}
          </div>
          <div className="flex-1 min-w-[300px] max-w-md p-4">
            {renderChart(bstarData, "#a7f3d0", "BSTAR")}
          </div>
        </div>
      </section>
    </div>
  );
}
