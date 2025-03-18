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
const API_BASE_URL = "https://satellite-tracker-production.up.railway.app/api/satellites";
const CDM_URL = "https://satellite-tracker-production.up.railway.app/api/cdm/fetch";
const SUGGEST_URL = "https://satellite-tracker-production.up.railway.app/api/satellites/suggest";


//const API_BASE_URL = "http://127.0.0.1:8000/api/satellites";
//const CDM_URL = "http://127.0.0.1:8000/api/cdm/fetch";
//const SUGGEST_URL = "http://127.0.0.1:8000/api/satellites/suggest";

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

  // Toggles
  const [showOrbitHistory, setShowOrbitHistory] = useState(false);
  const [isFocusEnabled, setIsFocusEnabled] = useState(false); // <--- Restored focus toggle
  const [cameraMode, setCameraMode] = useState("sideHorizon"); // default approach

  // Telemetry overlay (always visible)
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

  // Generate stable starfield
  const stableStars = useStableStars(150, generateStars);

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

    // Camera: side horizon
    const camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 999999);
    camera.position.set(6371 * 3, 0, 0); // ~3 Earth radii away
    camera.lookAt(0, 0, 0);
    cameraRef.current = camera;

    // Light
    const light = new THREE.DirectionalLight(0xffffff, 1);
    light.position.set(10000, 10000, 10000);
    scene.add(light);

    // Earth w/ day-night textures
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

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    mountRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Controls
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

      // Advance simulation time if not paused
      if (!isPausedRef.current && satrecRef.current) {
        simulationTimeRef.current += deltaMs * speedFactorRef.current;
      }

      // If we have a satellite, update its position
      if (satrecRef.current && satelliteMeshRef.current) {
        const currentDate = new Date(simulationTimeRef.current);
        const posVel = satellite.propagate(satrecRef.current, currentDate);

        if (posVel.position && posVel.velocity) {
          // Convert ECI => lat/long => x,y,z
          const gmst = satellite.gstime(currentDate);
          const geo = satellite.eciToGeodetic(posVel.position, gmst);
          const lat = geo.latitude;
          const lon = geo.longitude;
          const alt = geo.height;
          const r = 6371 + alt;

          const x = r * Math.cos(lat) * Math.cos(lon);
          const z = r * Math.cos(lat) * Math.sin(lon);
          const y = r * Math.sin(lat);

          // Place satellite
          satelliteMeshRef.current.position.set(x, y, z);

          // Telemetry
          const vx = posVel.velocity.x;
          const vy = posVel.velocity.y;
          const vz = posVel.velocity.z;
          const velocity = Math.sqrt(vx * vx + vy * vy + vz * vz);
          const bstarVal = satrecRef.current.bstar;

          setLastVelocity(velocity.toFixed(2));
          setLastAltitude(alt.toFixed(2));
          setLastPosition({ x: x.toFixed(2), y: y.toFixed(2), z: z.toFixed(2) });
          addTelemetry(velocity, alt, bstarVal);

          // If "Focus on Satellite" is enabled => do camera logic
          if (isFocusEnabledRef.current) {
            const minCamDist = 6371 + 500; // clamp to 500 km above Earth
            let desiredPos;

            if (cameraModeRef.current === "topView") {
              // Overhead
              desiredPos = new THREE.Vector3(x, y + 3000, z);
            } else {
              // sideHorizon or fallback
              desiredPos = new THREE.Vector3(x * 1.2, y * 0.1, z * 1.2);
            }

            // clamp
            const dist = desiredPos.length();
            if (dist < minCamDist) {
              desiredPos.normalize().multiplyScalar(minCamDist);
            }

            // Smoothly move camera
            camera.position.lerp(desiredPos, 0.05);
            camera.lookAt(x, y, z);
          }
        }
      }

      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      if (renderer) renderer.dispose();
      if (mountRef.current && renderer.domElement) {
        mountRef.current.removeChild(renderer.domElement);
      }
    };
  }, []);

  // Basic references for loop
  const isPausedRef = useRef(false);
  const speedFactorRef = useRef(1);
  const isFocusEnabledRef = useRef(false);
  const cameraModeRef = useRef("sideHorizon");

  useEffect(() => {
    isPausedRef.current = isPaused;
    speedFactorRef.current = speedFactor;
    isFocusEnabledRef.current = isFocusEnabled;
    cameraModeRef.current = cameraMode;
  }, [isPaused, speedFactor, isFocusEnabled, cameraMode]);

  // Hide/Show orbit line
  useEffect(() => {
    if (orbitLineRef.current) {
      orbitLineRef.current.visible = showOrbitHistory;
    }
  }, [showOrbitHistory]);

  /* -------------------------------------------------------------
     7) Build Orbit for 3 orbits, smaller steps
  ------------------------------------------------------------- */
  function buildOrbitLine(satrec) {
    if (!sceneRef.current) return null;

    // 3 orbits for LEO, MEO, GEO coverage
    let orbitMins = satrec.period ? satrec.period * 3 : 300;
    const stepMin = satrec.period < 120 ? 1 : 2; // smaller steps if short period

    const orbitPoints = [];
    const startTime = Date.now();

    for (let t = 0; t <= orbitMins; t += stepMin) {
      const timeMs = startTime + t * 60000;
      const dateObj = new Date(timeMs);
      const posVel = satellite.propagate(satrec, dateObj);
      if (!posVel.position) continue;

      const gmst = satellite.gstime(dateObj);
      const geo = satellite.eciToGeodetic(posVel.position, gmst);

      const lat = geo.latitude;
      const lon = geo.longitude;
      const alt = geo.height;
      const r = 6371 + alt;

      const x = r * Math.cos(lat) * Math.cos(lon);
      const z = r * Math.cos(lat) * Math.sin(lon);
      const y = r * Math.sin(lat);

      orbitPoints.push(new THREE.Vector3(x, y, z));
    }

    if (!orbitPoints.length) return null;
    const orbitGeo = new THREE.BufferGeometry().setFromPoints(orbitPoints);
    // Mako-ish teal for orbit
    const orbitMat = new THREE.LineBasicMaterial({
      color: 0x0ea5e9,
      linewidth: 2,
    });
    return new THREE.Line(orbitGeo, orbitMat);
  }

  /* -------------------------------------------------------------
     8) On Satellite Chosen
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

      // Remove old mesh/line
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

      // Satellite mesh
      const satGeo = new THREE.SphereGeometry(120, 16, 16);
      const satMat = new THREE.MeshBasicMaterial({ color: 0xff5533 });
      const satMesh = new THREE.Mesh(satGeo, satMat);
      satelliteMeshRef.current = satMesh;
      sceneRef.current.add(satMesh);

      // Orbit line
      const orbitLine = buildOrbitLine(rec);
      if (orbitLine) {
        orbitLineRef.current = orbitLine;
        sceneRef.current.add(orbitLine);
      }

      // Reset sim time + chart data
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
     9) Searching & Suggestions
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
     10) Add Telemetry for Charts
  ------------------------------------------------------------- */
  function addTelemetry(velocity, altitude, bstarVal) {
    setVelocityData((prev) => {
      const arr = [...prev, velocity];
      if (arr.length > 60) arr.shift();
      return arr;
    });
    setAltitudeData((prev) => {
      const arr = [...prev, altitude];
      if (arr.length > 60) arr.shift();
      return arr;
    });
    setBstarData((prev) => {
      const arr = [...prev, bstarVal];
      if (arr.length > 60) arr.shift();
      return arr;
    });
  }

  /* -------------------------------------------------------------
     11) Render Chart
  ------------------------------------------------------------- */
  function renderChart(dataArray, color, label) {
    // We'll always show the chart background
    const width = 400;
    const height = 160;
    const margin = { top: 20, right: 30, bottom: 20, left: 40 };

    let minVal = 0;
    let maxVal = 1;
    if (dataArray.length > 0) {
      minVal = Math.min(...dataArray);
      maxVal = Math.max(...dataArray);
    }
    const range = maxVal - minVal || 1;
    const chartWidth = width - margin.left - margin.right;
    const chartHeight = height - margin.top - margin.bottom;

    const scaleY = (val) => ((val - minVal) / range) * chartHeight;

    let pathData = `M0,${chartHeight} L${chartWidth},${chartHeight}`; // fallback
    let notEnoughData = false;

    if (dataArray.length >= 2) {
      pathData = dataArray
        .map((val, i) => {
          const x = (i / (dataArray.length - 1)) * chartWidth;
          const y = chartHeight - scaleY(val);
          return i === 0 ? `M${x},${y}` : `L${x},${y}`;
        })
        .join(" ");
    } else {
      notEnoughData = true;
    }

    // Y-axis ticks
    const tickCount = 4;
    const ticks = [];
    for (let i = 0; i <= tickCount; i++) {
      const v = minVal + (i * range) / tickCount;
      const y = chartHeight - scaleY(v);
      ticks.push(
        <g key={i}>
          <line x1={0} x2={chartWidth} y1={y} y2={y} stroke="#3b82f6" strokeWidth="0.5" />
          <text x={-6} y={y + 3} fontSize="10" fill="#a5f3fc" textAnchor="end">
            {v.toFixed(2)}
          </text>
        </g>
      );
    }

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
            {/* X-axis */}
            <line
              x1={0}
              x2={chartWidth}
              y1={chartHeight}
              y2={chartHeight}
              stroke="#6ee7b7"
              strokeWidth="1"
            />
            <path
              d={pathData}
              fill="none"
              stroke={color}
              strokeWidth="2"
              strokeLinecap="round"
            />
            {notEnoughData && (
              <text
                x={chartWidth / 2}
                y={chartHeight / 2}
                fill="#fef9c3"
                textAnchor="middle"
                fontSize="12"
              >
                Not enough data...
              </text>
            )}
          </g>
        </svg>
      </div>
    );
  }

  /* -------------------------------------------------------------
     12) Render
  ------------------------------------------------------------- */
  return (
    <div
      className="relative flex flex-col w-screen min-h-screen pt-[120px] overflow-hidden text-white"
      style={{
        background:
          "linear-gradient(to bottom, #050716 0%, #1B1E3D 50%, #2E4867 100%)",
      }}
    >
      {/* Starfield */}
      <div className="absolute w-full h-full overflow-hidden pointer-events-none z-0">
        {stableStars}
      </div>

     {/* ---------- TOP SECTION ---------- */}
<section className="z-10 px-8 py-12 w-full max-w-screen-2xl mx-auto space-y-6">
  <div className="text-center text-3xl sm:text-4xl md:text-5xl font-bold tracking-wide text-teal-100">
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
  </div>

  <p className="text-lg sm:text-xl text-teal-200 max-w-4xl mx-auto leading-relaxed text-center">
    Monitor real-time satellite positions and orbital parameters with precise TLE propagation.  
    Integrated CDM event tracking ensures early detection of potential conjunctions,  
    supporting advanced predictive analytics for risk assessment and space situational awareness.
  </p>



        {/* Search + CDM */}
        <div className="flex flex-col md:flex-row md:items-start md:justify-center gap-6 relative">
          {/* Search */}
          <div className="flex flex-col items-center">
            <label className="mb-2 text-sm font-semibold text-teal-100">
              Search Satellite (Name or NORAD)
            </label>
            <div className="relative">
              <input
                type="text"
                placeholder="STARLINK-3000 or 76000"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-72 p-2 rounded-md bg-black text-teal-100 outline-none 
                           placeholder-gray-400 border border-teal-700"
              />
              {suggestions.length > 0 && (
                <ul className="absolute left-[-300px] top-0 w-72 max-h-48 overflow-y-auto bg-black text-teal-100 border border-teal-700 rounded-md shadow-md z-50">
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
            <button
              onClick={handleSearch}
              className="mt-3 px-4 py-2 bg-teal-500 hover:bg-teal-600 text-white rounded-md shadow transition-colors"
            >
              {loading ? "Searching..." : "Search"}
            </button>
          </div>

          {/* CDM Events */}
          <div className="flex flex-col">
            <span className="mb-2 text-sm font-semibold text-teal-100">
              Active CDM Events
            </span>
            <div className="max-h-32 overflow-y-auto border border-teal-700 rounded p-2 bg-black/40 text-sm w-72">
              {cdmEvents.length === 0 ? (
                <p className="text-teal-400">No active events</p>
              ) : (
                cdmEvents.map((ev) => (
                  <div key={ev.cdm_id} className="mb-2 border-b border-teal-700 pb-1">
                    <p className="text-teal-100">
                      <strong>ID:</strong> {ev.cdm_id}
                    </p>
                    <p className="text-teal-200">
                      <strong>Object:</strong> {ev.sat_1_name} ({ev.sat_1_type})
                    </p>
                    <p className="text-teal-300">
                      <strong>TCA:</strong> {ev.tca}
                    </p>
                    <p className="text-teal-300">
                      <strong>Min Range:</strong> {ev.min_rng} km
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ---------- MAIN SECTION (3D + Controls) ---------- */}
      <section className="z-10 flex flex-row w-full max-w-screen-2xl mx-auto px-8 gap-6 relative">
        {/* 3D UI Container */}
        <div className="relative flex-1 rounded-lg min-h-[600px] h-[65vh] overflow-hidden border border-teal-700">
          <div ref={mountRef} className="absolute inset-0" />

          {/* Telemetry overlay ALWAYS visible */}
          <div className="absolute top-4 left-4 bg-black/60 text-sm text-teal-100 p-3 rounded shadow z-50 w-52">
            <p>Velocity: {lastVelocity} km/s</p>
            <p>Altitude: {lastAltitude} km</p>
            <p>
              X={lastPosition.x}, Y={lastPosition.y}, Z={lastPosition.z}
            </p>
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
              className={`px-3 py-1 rounded-md text-sm font-semibold ${
                isPaused ? "bg-green-500" : "bg-red-500"
              }`}
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
              className={`px-3 py-1 rounded-md text-sm font-semibold ${
                isFocusEnabled ? "bg-purple-500" : "bg-gray-600"
              }`}
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
            </select>
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
            {/* Velocity (Mako cyan) */}
            {renderChart(velocityData, "#14b8a6", "Velocity (km/s)")}
          </div>
          <div className="flex-1 min-w-[300px] max-w-md p-4">
            {/* Altitude (Mako blue) */}
            {renderChart(altitudeData, "#0ea5e9", "Altitude (km)")}
          </div>
          <div className="flex-1 min-w-[300px] max-w-md p-4">
            {/* BSTAR: Light Yellow-Teal (#a7f3d0) */}
            {renderChart(bstarData, "#a7f3d0", "BSTAR")}
          </div>
        </div>
      </section>
    </div>
  );
}
