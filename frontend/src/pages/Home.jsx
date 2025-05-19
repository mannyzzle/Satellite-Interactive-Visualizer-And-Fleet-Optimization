// src/pages/Home.jsx

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import Navbar from "../components/Navbar";  // ✅ Ensure correct path
import SatelliteCounter from "../components/SatelliteCounter";  // ✅ Import Satellite Counter
import { useCallback } from "react";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";
import { fetchSatellites } from "../api/satelliteService";
import Infographics from "../components/Infographics"; // Ensure correct path
import { twoline2satrec, propagate, gstime, eciToGeodetic, degreesLong, degreesLat } from "satellite.js";
import { Button } from "../components/button";
import { Select, SelectTrigger, SelectContent, SelectItem } from "../components/select";
import { motion } from "framer-motion";
import { TypeAnimation } from "react-type-animation";
import { useMemo } from "react";
const basePath = import.meta.env.BASE_URL;  // ✅ Dynamically fetch the base URL
const dayTexture = `${basePath}earth_day.jpg`;
const nightTexture = `${basePath}earth_night.jpg`;
const cloudTexture = `${basePath}clouds.png`;
// 🔍 Autocomplete endpoint
const SUGGEST_URL = "https://satellite-tracker-production.up.railway.app/api/satellites/suggest";





// ✅ Generate stars **once** and persist them
export function StarField({ numStars = 150 }) {
  const starsRef = useRef(null);

  // ✅ Ensure stars are only generated **once** (not on re-renders)
  if (!starsRef.current) {
    starsRef.current = Array.from({ length: numStars }).map((_, i) => {
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

  return (
    <div className="absolute w-full h-full overflow-hidden pointer-events-none z-0">
      {starsRef.current}
    </div>
  );
}


export default function Home() {
  const globeRef = useRef(null);
  const cloudRef = useRef(null);
  const atmosphereRef = useRef(null);
  const sunRef = useRef(null);
  const moonRef = useRef(null);
  const [isExpanded, setIsExpanded] = useState(false);

  // Toggle function
  const toggleExpanded = () => setIsExpanded((prev) => !prev);
  let isFetching = false;  // Prevent duplicate fetch calls
  const [is3DEnabled, setIs3DEnabled] = useState(false);
  const threeDRef = useRef(null);

  const [satellitesForCharts, setSatellitesForCharts] = useState([]);
  const [chartLoading, setChartLoading] = useState(false);
  const [chartError, setChartError] = useState(false);


  const orbitPathsRef = useRef([]); // 🛰 Track all orbit paths
  const sceneRef = useRef(null); // ✅ Store scene reference
  const selectedPointerRef = useRef(null); // 🔼 Arrow Pointer
  const cameraRef = useRef(null); // Stores camera
  const mountRef = useRef(null);
  const [isInteractionEnabled, setIsInteractionEnabled] = useState(false);
  const satelliteObjectsRef = useRef({}); // ✅ Use a ref for real-time updates
  const [selectedSatellite, setSelectedSatellite] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadingComplete, setLoadingComplete] = useState(false);
  const [page, setPage] = useState(1); // 🚀 Current page of satellites
  const [satellites, setSatellites] = useState([]);
  const [limit, setLimit] = useState(500);

const [searchQuery, setSearchQuery] = useState(""); // 🔍 For filtering satellites
const [suggestions, setSuggestions] = useState([]);
const [searchLoading, setSearchLoading] = useState(false);
// refs to close dropdown on outside-click
const inputRef = useRef(null);
const dropdownRef = useRef(null);

// 🔍 Find which page a satellite lives on within current filters
const findPageForSatellite = async (sat) => {
  const filt = activeFilters.length ? activeFilters.join(",") : null;
  const MAX_PAGES = 80;                // safety limit
  for (let p = 1; p <= MAX_PAGES; p++) {
    const data = await fetchSatellites(p, limit, filt);
    if (data?.satellites?.some(s => s.norad_number === sat.norad_number)) {
      return { page: p, sats: data.satellites };
    }
  }
  return null; // not found
};


  const [sidebarOpen, setSidebarOpen] = useState(() => {
    return localStorage.getItem("sidebarOpen") === "true"; // Restore from localStorage
  });
  


  useEffect(() => {
    localStorage.setItem("sidebarOpen", sidebarOpen); // Save state change
  }, [sidebarOpen]);



  useEffect(() => {
    if ("scrollRestoration" in window.history) {
      window.history.scrollRestoration = "manual";
    }
    window.scrollTo(0, 0);
  }, []);
  

  const [isTracking, setIsTracking] = useState(true); // 🚀 Default: Tracking is ON
  const controlsRef = useRef(null);

  const textureLoader = new THREE.TextureLoader();
  const dayMap = textureLoader.load(dayTexture);
  const nightMap = textureLoader.load(nightTexture);
  const clouds = textureLoader.load(cloudTexture);
  const sunTexture = textureLoader.load(`${basePath}sun_texture.jpg`);
  const moonTexture = textureLoader.load(`${basePath}moon_texture.jpg`);



  const [filteredSatellites, setFilteredSatellites] = useState([]);
  const [activeFilters, setActiveFilters] = useState(["Recent Launches"]); // ✅ Track multiple filters
  
  
  const [total, setTotal] = useState(0);




  useEffect(() => {
    // Create an IntersectionObserver to trigger once
    // our threeDRef enters the viewport
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          console.log("🎉 Container is now visible - enabling 3D!");
          setIs3DEnabled(true);

          // If you only want to enable once and not disable again,
          // you can unobserve after the first intersection
          observer.unobserve(entry.target);
        }
      },
      {
        root: null,         // browser viewport
        rootMargin: "0px",  // no margin
        threshold: 0.3      // fire when 30% of container is visible
      }
    );

    if (threeDRef.current) {
      observer.observe(threeDRef.current);
    }

    // Cleanup
    return () => {
      if (threeDRef.current) {
        observer.unobserve(threeDRef.current);
      }
    };
  }, []);


  


  function computeSatellitePosition(satellite, time) {
    const { tle_line1, tle_line2 } = satellite;
    
    // ✅ Convert TLE to SGP4 satellite record
    const satrec = twoline2satrec(tle_line1, tle_line2);
    
    // ✅ Convert time to Date object
    const currentTime = new Date(time * 1000); // Convert from UNIX timestamp to JS Date
    
    // ✅ Calculate sidereal time for Earth rotation
    const julianDate = gstime(currentTime);
  
    // ✅ Propagate satellite position
    const positionAndVelocity = propagate(satrec, currentTime);
    if (!positionAndVelocity.position) return null; // ❌ Return null if no position found
  
    const { x, y, z } = positionAndVelocity.position; // ECI coordinates (km)
  
    // ✅ Convert ECI coordinates to a `THREE.Vector3` for visualization
    return new THREE.Vector3(x, z, -y); // ✅ Swap axes to align with THREE.js
  }



// 🔹 Each time page or activeFilters changes, fetch data for charts
useEffect(() => {
  async function fetchChartData() {
    setChartLoading(true);
    setChartError(false);

    try {
      // For example, 1, limit=500, plus activeFilters
      // Or if you want all satellites for that page, just do page & limit
      // Or if you want to ignore pagination for charts, set limit = 1000
      const data = await fetchSatellites(page, limit, activeFilters.join(","));
      if (!data || !data.satellites || data.satellites.length === 0) {
        setChartError(true);
      } else {
        setSatellitesForCharts(data.satellites);
      }
    } catch (err) {
      console.error("❌ Error fetching chart data:", err);
      setChartError(true);
    } finally {
      setChartLoading(false);
    }
  }

  fetchChartData();
}, [page, limit, activeFilters]);

  
  const addOrbitPaths = () => {
    console.log("🛰️ Updating orbit paths...");
  
    if (orbitPathsRef.current.length === Object.keys(satelliteObjectsRef.current).length) {
      console.log("✅ Orbit paths already correct, skipping update.");
      return;
    }
  
    // ✅ Remove existing paths before adding new ones
    orbitPathsRef.current.forEach((path) => {
      if (sceneRef.current) {
        sceneRef.current.remove(path);
      }
      path.geometry.dispose();
      path.material.dispose();
    });
  
    orbitPathsRef.current = [];
  
    const MAX_ORBITS = 1000;
    const selectedSatellites = Object.values(satelliteObjectsRef.current).slice(0, MAX_ORBITS);
  
    selectedSatellites.forEach((satelliteModel) => {
      if (satelliteModel.userData) {
        const orbitPath = createOrbitPath(satelliteModel.userData);
        if (orbitPath) {
          sceneRef.current.add(orbitPath);
          orbitPathsRef.current.push(orbitPath);
        }
      }
    });
  
    console.log(`🛰️ Added ${orbitPathsRef.current.length} orbit paths.`);
  };

  

  function createOrbitPath(satellite) {
    if (!satellite || !satellite.period) return null; // ❌ Prevents crash if no period

    const numPoints = 500;
    const orbitPoints = [];

    // ✅ Step 1: Generate Orbit Positions
    for (let i = 0; i <= numPoints; i++) {
        const timeOffset = (i / numPoints) * satellite.period * 60;
        const position = computeSatellitePosition(satellite, Date.now() / 1000 + timeOffset);

        if (!position) continue;
        orbitPoints.push(new THREE.Vector3(position.x, position.y, position.z));
    }

    if (orbitPoints.length === 0) return null; // 🚀 Avoid empty orbits

    // ✅ Step 2: Define Purpose-Based Colors
    const purposeColors = {
        "Space Debris": 0xFF0000,  // 🔴 Bright Red (Deorbiting or debris)
        "Rocket Body (Debris)": 0xFF0000,  // 🔴 Bright Red
        "Unknown": 0xFF0000,  // 🔴 Bright Red
        "Unknown Payload": 0xFF0000,  // 🔴 Bright Red
    };

    // ✅ Default orbit color based on classification
    let orbitColor = purposeColors[satellite.purpose] || 0x00FFFF; // Default Light Blue (Operational)

    // ✅ Override color if satellite is inactive
    if (satellite.active_status === "Inactive") {
        orbitColor = 0xFFFF00;  // 🟡 Bright Yellow (Inactive satellites)
    }

    // ✅ Step 3: Create Orbit Path
    const orbitGeometry = new THREE.BufferGeometry().setFromPoints(orbitPoints);
    const orbitMaterial = new THREE.LineBasicMaterial({
        color: orbitColor,
        opacity: 0.99,
        transparent: true,
    });

    return new THREE.Line(orbitGeometry, orbitMaterial);
}






  const resetMarker = () => {
    if (selectedPointerRef.current) {
      console.log("🔄 Removing previous marker...");
      sceneRef.current.remove(selectedPointerRef.current);
      selectedPointerRef.current.geometry.dispose();
      selectedPointerRef.current.material.dispose();
      selectedPointerRef.current = null;
    }
  };
  



const loadSatelliteModel = (satellite) => {
  if (!is3DEnabled) return; // 🚨 Prevents loading if 3D mode is off

  console.log(`🔄 Attempting to load model for: ${satellite.name} (${satellite.norad_number})`);

  // ✅ Prevent duplicate loading
  if (satelliteObjectsRef.current[satellite.norad_number]) {
    console.log(`⚠️ Satellite ${satellite.norad_number} already exists in the scene.`);
    return;
  }

  const scene = sceneRef.current;
  if (!scene) return;

  // 🚀 Compute Initial Position
  const initialPos = computeSatellitePosition(satellite, Date.now() / 1000);

  // ✅ **FIX: Check if the position is valid before continuing**
  if (!initialPos || initialPos.x === undefined || initialPos.y === undefined || initialPos.z === undefined) {
    console.warn(`⚠️ Skipping ${satellite.name} (${satellite.norad_number}) due to missing position data.`);
    return;
  }

  const purposeColors = {
    "Communications": 0x0000FF, // 🟦 Blue
    "Navigation": 0x0000FF, // 🟦 Blue
    "OneWeb Constellation": 0x0000FF, // 🟦 Blue
    "Iridium NEXT Constellation": 0x0000FF, // 🟦 Blue
    "Starlink Constellation": 0x0000FF, // 🟦 Blue
  
    "Weather Monitoring": 0x00FF00, // 🟩 Green
    "Earth Observation": 0x00FF00, // 🟩 Green
    "Scientific Research": 0x00FF00, // 🟩 Green
    "Space Infrastructure": 0x00FF00, // 🟩 Green
  
    "Technology Demonstration": 0xFFA500, // 🟧 Orange
    "Human Spaceflight": 0xFFA500, // 🟧 Orange
    "Satellite Servicing & Logistics": 0xFFA500, // 🟧 Orange
    "Deep Space Exploration": 0xFFA500, // 🟧 Orange
    "Military/Reconnaissance": 0xFFA500, // 🟧 Orange
  
    "Rocket Body (Debris)": 0xFF0000, // 🟥 Red
    "Space Debris": 0xFF0000, // 🟥 Red
    "Unknown Payload": 0xFF0000, // 🟥 Red
    "Unknown": 0xFF0000, // 🟥 Red
  };
  
  // 🚀 **Determine Color Based on Purpose**
  const sphereColor = purposeColors[satellite.purpose] || 0xFFFFFF; // Default to white if undefined
  

  // ✅ Create Sphere for Satellite
  const sphereGeometry = new THREE.SphereGeometry(0.1, 8, 8);
  const sphereMaterial = new THREE.MeshBasicMaterial({ color: sphereColor });
  const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial);

  // 🚀 Set Position
  sphere.position.copy(initialPos);

  // ✅ Attach metadata
  sphere.userData = satellite;

  // ✅ Store reference & add to scene
  satelliteObjectsRef.current[satellite.norad_number] = sphere;
  scene.add(sphere);

  console.log(`✅ Sphere successfully added: ${satellite.name} (${satellite.norad_number})`);
};




// ✅ Smooth Camera Transition Function (Now Fixed)
function smoothCameraTransition(targetPosition, satellite) {
  if (!is3DEnabled || !cameraRef.current) return;

  const startPos = cameraRef.current.position.clone();
  const targetDistance = startPos.distanceTo(targetPosition);

  // ✅ Fix Zoom Factor (Logarithmic Scaling)
  let zoomFactor;
  if (satellite) {
    const altitude = (satellite.perigee + satellite.apogee) / 2; // Compute average altitude

    if (altitude < 2000) {
      zoomFactor = 1.2;  // LEO - Small Adjustment (Closer View)
    } else if (altitude < 20000) {
      zoomFactor = 1.5;  // MEO - Mid Adjustment
    } else if (altitude < 40000) {
      zoomFactor = 2.0;  // GEO - Slightly More Distance
    } else {
      zoomFactor = 3.0;  // HEO - Prevent Extreme Zoom-In
    }
  } else {
    zoomFactor = 1.5; // Default zoom for unknown altitudes
  }

  // ✅ Fix Target Position Calculation (Don't Over-Divide)
  const targetPos = targetPosition.clone().multiplyScalar(zoomFactor);

  let t = 0;

  function moveCamera() {
    t += 0.03; // ✅ Lower speed for smooth transitions

    const speedFactor = Math.log(targetDistance) * 0.05; // ✅ Dynamic Speed Scaling
    cameraRef.current.position.lerpVectors(startPos, targetPos, t * speedFactor);
    cameraRef.current.lookAt(targetPosition);

    if (t < 1) {
      requestAnimationFrame(moveCamera);
    } else {
      cameraRef.current.position.copy(targetPos);
      cameraRef.current.lookAt(targetPosition);
      console.log("✅ Camera transition complete!");
    }
  }

  moveCamera();
}









const focusOnSatellite = useCallback((sat) => {
  if (!is3DEnabled) return;
  if (!sat) return;

  console.log(`🚀 Focusing on satellite: ${sat.name} (NORAD: ${sat.norad_number})`);
  setSelectedSatellite(sat);
  setIsTracking(true);
  localStorage.setItem("selectedSatellite", JSON.stringify(sat));

  const checkModelLoaded = () => {
      const satModel = satelliteObjectsRef.current[sat.norad_number];

      if (!satModel || !satModel.position) {
          console.warn(`⚠️ Satellite model ${sat.name} not found, retrying...`);
          setTimeout(checkModelLoaded, 500);
          return;
      }

      resetMarker(); // ✅ Remove existing marker before adding a new one

      if (selectedPointerRef.current?.userData?.followingSatellite === sat.norad_number) {
          console.log("✅ Marker already exists for this satellite, skipping...");
          return; // ❌ Prevent duplicate marker
      }

      const markerGeometry = new THREE.RingGeometry(0.3, 0.35, 32);
      const markerMaterial = new THREE.MeshBasicMaterial({
          color: 0xffff99,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.5,
      });

      const marker = new THREE.Mesh(markerGeometry, markerMaterial);
      marker.position.copy(satModel.position);
      marker.lookAt(new THREE.Vector3(0, 0, 0));

      sceneRef.current.add(marker);
      selectedPointerRef.current = marker;
      selectedPointerRef.current.userData.followingSatellite = sat.norad_number;

      if (cameraRef.current) {
          smoothCameraTransition(satModel.position, sat); // ✅ Pass the satellite object here
      }

      console.log("📡 Tracking Enabled!");
  };



  checkModelLoaded();
}, [setSelectedSatellite, setIsTracking, sceneRef, selectedPointerRef, cameraRef, is3DEnabled]);








const toggleFilter = async (filterType) => {
  if (!is3DEnabled) return;
  console.log(`🔍 Selecting filter: ${filterType}`);

  setActiveFilters([filterType]); // ✅ Only one active filter at a time
  setPage(1); // ✅ Reset pagination
  

  setLoading(true); // ✅ Show loading screen

  try {
      resetMarker(); // ✅ Remove previous marker
      await removeAllSatelliteModels(); // ✅ Clear satellites
      await removeAllOrbitPaths(); // ✅ Clear orbits

      setSatellites([]);
      setFilteredSatellites([]);

      await new Promise((resolve) => setTimeout(resolve, 2000)); // ⏳ 2s delay for full cleanup
      await fetchAndUpdateSatellites([filterType], 1); // ✅ Fetch satellites
  } catch (error) {
      console.error("❌ Error applying filter:", error);
  } finally {
      setTimeout(() => setLoading(false), 2500); // ⏳ Extra delay to ensure scene is fully updated
  }
};

const changePage = async (newPage) => {
  if (!is3DEnabled) return;
  if (newPage < 1 || loading) return;

  console.log(`📡 Changing to page ${newPage}...`);
  setLoading(true); // ✅ Show loading screen
  setPage(newPage);

  try {
      resetMarker(); // ✅ Remove previous marker
      await removeAllSatelliteModels(); // ✅ Clear satellites
      await removeAllOrbitPaths(); // ✅ Clear orbits

      await new Promise((resolve) => setTimeout(resolve, 2500)); // ⏳ Extra delay for cleanup
      const data = await fetchSatellites(newPage, limit, activeFilters.length > 0 ? activeFilters.join(",") : null);

      if (data?.satellites?.length) {
          const limitedSatellites = data.satellites.slice(0, 500);
          setFilteredSatellites(limitedSatellites);
          setSatellites(limitedSatellites);
          updateSceneWithFilteredSatellites(limitedSatellites);
      } else {
          console.warn("⚠️ No satellites found for page.");
          setFilteredSatellites([]);
      }
  } catch (error) {
      console.error("❌ Error fetching new page:", error);
  } finally {
      setTimeout(() => setLoading(false), 3000); // ⏳ Extra delay before hiding loading screen
  }
};



  
  const removeAllSatelliteModels = () => {
    if (!is3DEnabled) return;
    console.log("🗑️ Removing all satellite models...");
    console.log("🚀 Before cleanup, satelliteObjectsRef:", Object.keys(satelliteObjectsRef.current));
    console.log("🛰️ Satellites in Scene (before cleanup):", sceneRef.current.children.length);

    Object.keys(satelliteObjectsRef.current).forEach((norad_number) => {
        const satModel = satelliteObjectsRef.current[norad_number];

        if (satModel && sceneRef.current) {
            // ✅ Remove from scene
            sceneRef.current.remove(satModel);

            // ✅ Dispose of geometry & material
            if (satModel.geometry) satModel.geometry.dispose();
            if (satModel.material) satModel.material.dispose();

            // ✅ Remove all children from satellite
            while (satModel.children.length > 0) {
                const child = satModel.children[0];
                if (child.geometry) child.geometry.dispose();
                if (child.material) child.material.dispose();
                satModel.remove(child);
            }

            delete satelliteObjectsRef.current[norad_number];
        }
    });

    // ✅ Ensure no lingering references
    satelliteObjectsRef.current = {};

    console.log("✅ After cleanup, satelliteObjectsRef:", Object.keys(satelliteObjectsRef.current));
    console.log("🛰️ Satellites in Scene (after cleanup):", sceneRef.current.children.length);
};







  
  const removeAllOrbitPaths = () => {
    if (!is3DEnabled) return;
    console.log("🗑️ Removing all orbit paths...");
  
    if (orbitPathsRef.current.length > 0) {
      orbitPathsRef.current.forEach((path) => {
        if (sceneRef.current) {
          sceneRef.current.remove(path);
        }
        path.geometry.dispose();
        path.material.dispose();
      });
  
      orbitPathsRef.current = []; // ✅ Ensure full reset
    }
  };
  


  const resetFilters = async () => {
    if (!is3DEnabled) return;
    console.log("🔄 Resetting filters...");
  
    setActiveFilters([]);
    setPage(1);
    setLoading(true);
    setSatellites([]); // ✅ Clear previous satellites
    setFilteredSatellites([]);
    removeAllSatelliteModels(); // ✅ Ensure no stale models remain
  
    try {
      const data = await fetchSatellites(1, limit, null);
  
      if (data?.satellites?.length) {
        console.log(`📡 Loaded ${data.satellites.length} unfiltered satellites.`);
        setFilteredSatellites(data.satellites);
        setSatellites(data.satellites);
      } else {
        console.warn("⚠️ No satellites returned after reset.");
      }
    } catch (error) {
      console.error("❌ Error fetching unfiltered satellites:", error);
    } finally {
      setLoading(false);
    }
  };
  







  const fetchAndUpdateSatellites = async (updatedFilters, newPage = 1) => {
    if (!is3DEnabled) return;
    if (loading || isFetching || (satellites.length > 0 && page === newPage)) {
        console.log("⚠️ Skipping redundant satellite fetch.");
        return;
    }

    isFetching = true;  // 🚀 Lock fetch to prevent duplication
    setLoading(true);
    setPage(newPage);

    console.log("🛑 Removing all old satellites before fetching...");
    removeAllSatelliteModels(); // ✅ Ensure satellites are cleared
    removeAllOrbitPaths(); // ✅ Ensure orbit paths are cleared

    try {
        console.log(`📡 Fetching satellites (page ${newPage}, filters: ${updatedFilters})`);
        const data = await fetchSatellites(newPage, 500, updatedFilters.join(","));

        if (data?.satellites?.length) {
            console.log(`📌 Loaded ${data.satellites.length} satellites for page ${newPage}`);

            // ✅ Store only 100 satellites
            const limitedSatellites = data.satellites.slice(0, 500);
            setSatellites(limitedSatellites);
            updateSceneWithFilteredSatellites(limitedSatellites);
        } else {
            console.warn("⚠️ No satellites found for this page.");
            setSatellites([]);
        }
    } catch (error) {
        console.error("❌ Error fetching satellites:", error);
    } finally {
        setLoading(false);
        isFetching = false;  // ✅ Unlock fetch
    }
};








const updateSceneWithFilteredSatellites = (satellites) => {
  if (!is3DEnabled) return;
  if (!sceneRef.current) {
    console.warn("⚠️ Scene is not ready yet. Skipping satellite update.");
    return;
  }
  
  console.log(`🛰️ Updating scene with ${satellites.length} satellites...`);
  console.log("🚀 Current satelliteObjectsRef (before update):", Object.keys(satelliteObjectsRef.current));
  console.log("🛰️ Satellites in Scene (before update):", sceneRef.current.children.length);

  // ✅ Ensure satellites are cleared before adding new ones
  removeAllSatelliteModels();
  removeAllOrbitPaths();

  // ✅ Ensure only 100 satellites are rendered
  const limitedSatellites = satellites.slice(0, 500);
  const newSatelliteIds = new Set(limitedSatellites.map((s) => s.norad_number));

  // ✅ Remove satellites NOT in the new list
  Object.keys(satelliteObjectsRef.current).forEach((norad_number) => {
      if (!newSatelliteIds.has(Number(norad_number))) {
          console.log(`🗑️ Removing old satellite: ${norad_number}`);
          const satModel = satelliteObjectsRef.current[norad_number];

          if (satModel && sceneRef.current) {
              sceneRef.current.remove(satModel);
              delete satelliteObjectsRef.current[norad_number];
          }
      }
  });

  setTimeout(() => {
      limitedSatellites.forEach((sat) => {
          if (!satelliteObjectsRef.current[sat.norad_number]) {
              loadSatelliteModel(sat);
          }
      });

      setTimeout(() => {
          console.log("🛰️ Adding new orbit paths...");
          addOrbitPaths();
          console.log("🚀 Current satelliteObjectsRef (after update):", Object.keys(satelliteObjectsRef.current));
          console.log("🛰️ Satellites in Scene (after update):", sceneRef.current.children.length);
      }, 300);
  }, 500);
};



  

useEffect(() => {
  if (!is3DEnabled) return;
  if (!satellites.length) {
      console.warn("⚠️ No satellites to load, waiting for fetch...");
      return;
  }

  console.log(`🚀 Updating scene for ${satellites.length} satellites...`);
  console.log("🚀 Current satelliteObjectsRef (before update):", Object.keys(satelliteObjectsRef.current));
  console.log("🛰️ Satellites in Scene (before update):", sceneRef.current.children.length);

  const newSatelliteIds = new Set(satellites.map((s) => s.norad_number));

  // 🚨 Remove satellites NOT in the new list
  Object.keys(satelliteObjectsRef.current).forEach((norad_number) => {
      if (!newSatelliteIds.has(Number(norad_number))) {
          console.log(`🗑️ Removing old satellite: ${norad_number}`);
          const satModel = satelliteObjectsRef.current[norad_number];
          if (satModel && sceneRef.current) {
              sceneRef.current.remove(satModel);
              delete satelliteObjectsRef.current[norad_number];
          }
      }
  });

  // 🚀 Load missing satellites
  satellites.forEach((sat) => {
      if (!satelliteObjectsRef.current[sat.norad_number]) {
          loadSatelliteModel(sat);
      }
  });

  setTimeout(() => {
    addOrbitPaths();  // 🚀 Ensure orbits are added after everything else
    console.log("✅ Orbit paths manually added after delay.");
  }, 500); // ⏳ Small delay ensures everything is loaded before orbits are drawn

  console.log("🚀 Current satelliteObjectsRef (after update):", Object.keys(satelliteObjectsRef.current));
  console.log("🛰️ Satellites in Scene (after update):", sceneRef.current.children.length);
}, [satellites,is3DEnabled]);

  




  useEffect(() => {
    if (!is3DEnabled) return;
    if (satellites.length > 0) {
      console.log("⚠️ Skipping fetch, satellites already loaded.");
      return;
    }
  
    console.log(`📡 Fetching satellites for page ${page} (filters: ${activeFilters.length > 0 ? activeFilters.join(", ") : "None"})...`);
    fetchAndUpdateSatellites(activeFilters, page);
  }, [page, activeFilters,is3DEnabled]); // Ensures it only runs when `page` or `activeFilters` change

  



  useEffect(() => {
    if (!is3DEnabled) return;
    const getSatellites = async () => {
      setLoading(true);
      try {
        console.log(`📡 Fetching satellites (page: ${page}, limit: ${limit}, filter: ${activeFilters})...`);
  
        let data = await fetchSatellites(page, limit, activeFilters); // ✅ Always use active filter
        if (data?.satellites?.length) {
          console.log(`📡 Loaded ${data.satellites.length} satellites.`);
          setSatellites(data.satellites);
          setTotal(data.total); // ✅ Store dataset
        } else {
          console.warn("⚠️ No satellites returned from API.");
          setSatellites([]);
        }
      } catch (error) {
        console.error("❌ Error fetching satellites:", error);
        setSatellites([]);
      } finally {
        setLoading(false);
      }
    };
  
    getSatellites();
  }, [page, limit, activeFilters,is3DEnabled]); // ✅ Runs when page, limit, or filter changes
  




console.log(" 🛑 Tracking useEffect dependencies: ", { page, limit, activeFilters, loading, selectedSatellite, isTracking });








useEffect(() => {
  if (!is3DEnabled) return;
  if (selectedSatellite && isTracking) {
    console.log(`📌 Tracking satellite: ${selectedSatellite.name} (NORAD: ${selectedSatellite.norad_number})`);
  }
}, [selectedSatellite, isTracking,is3DEnabled]);






useEffect(() => {
  if (!is3DEnabled) return;
  if (loading) {
    console.log("⏳ Waiting for satellites...");
  } else if (!loading) {
    if (satellites.length > 0) {
      console.log(`📌 Sidebar Updated: ${satellites.length} satellites available.`, satellites);
    } else {
      console.warn("⚠️ Sidebar has no satellites, waiting for fetch...");
    }
  }
}, [satellites, loading,is3DEnabled]);



useEffect(() => {
  if (!is3DEnabled) return;
  console.log("📌 Page changed! Resetting selection and tracking.");
  setSelectedSatellite(null);
  setIsTracking(false); // ✅ Reset tracking so new selections work properly
  localStorage.removeItem("selectedSatellite");
  selectedPointerRef.current = null; // ✅ Clear any lingering tracking
}, [page,is3DEnabled]);





// ✅ Restore Last Selected Satellite After Refresh (Without Duplicates)
useEffect(() => {
  if (!is3DEnabled) return;
  const savedSatellite = localStorage.getItem("selectedSatellite");
  if (!savedSatellite) return;

  console.log("🔄 Restoring last selected satellite...");
  const parsedSat = JSON.parse(savedSatellite);

  // ✅ Avoid duplicate models
  if (satelliteObjectsRef.current[parsedSat.norad_number]) {
    console.log(`✅ Satellite ${parsedSat.name} already in scene. Skipping reload.`);
    setSelectedSatellite(parsedSat);
    setIsTracking(true);
    return;
  }

  // ✅ Ensure satellite exists in the fetched list before restoring
  if (!satellites.some((sat) => sat.norad_number === parsedSat.norad_number)) {
    console.warn(`⚠️ Saved satellite ${parsedSat.norad_number} not in current dataset.`);
    return;
  }

  setSelectedSatellite(parsedSat);
  setIsTracking(true); // ✅ Enable tracking after refresh if a satellite was selected

  const checkModelLoaded = () => {
    if (satelliteObjectsRef.current[parsedSat.norad_number]) {
      console.log(`📡 Satellite ${parsedSat.name} found! Moving camera...`);
      focusOnSatellite(parsedSat);
    } else {
      setTimeout(checkModelLoaded, 500);
    }
  };

  checkModelLoaded();
}, [satellites,is3DEnabled]); // ✅ Runs only when satellites update





useEffect(() => {
  if (!is3DEnabled) return;
  if (!controlsRef.current) return;

  let isDragging = false;

  const handleMouseDown = () => {
    isDragging = false; // Reset dragging state
  };

  const handleMouseMove = () => {
    isDragging = true; // Detect actual movement
  };

  const handleMouseUp = () => {
    if (isDragging) {
      console.log("🛑 User moved camera - stopping tracking...");
      setIsTracking(false);
    }
  };

  // ✅ Add event listeners to detect camera interaction
  controlsRef.current.addEventListener("start", handleMouseDown);
  controlsRef.current.addEventListener("change", handleMouseMove); // Movement detection
  controlsRef.current.addEventListener("end", handleMouseUp);

  return () => {
    controlsRef.current.removeEventListener("start", handleMouseDown);
    controlsRef.current.removeEventListener("change", handleMouseMove);
    controlsRef.current.removeEventListener("end", handleMouseUp);
  };
}, [controlsRef]);





const enableInteraction = () => {
  if (!is3DEnabled) return;
  setIsInteractionEnabled(true);
  if (controlsRef.current) controlsRef.current.enabled = true;
};





// ✅ Ensure Tracking Stops When Camera is Moved
useEffect(() => {
  if (!is3DEnabled) return;
  if (!controlsRef.current) return;

  controlsRef.current.enabled = !isTracking; // 🔄 Disable controls when tracking is enabled
}, [isTracking]);





// ✅ Scene & Animation Setup (Runs Once)
// ✅ Scene & Animation Setup (Runs Once)
useEffect(() => {
  if (!is3DEnabled || !mountRef.current) return; // ✅ Only run if 3D is enabled

  console.log("🚀 Initializing 3D Scene...");

  const scene = new THREE.Scene();
  sceneRef.current = scene;

  // ❌ Remove any scene background color:
  // scene.background = new THREE.Color("rgba(11, 0, 27, 0.85)");

  // ✅ Make it transparent
  scene.background = null;

  // ✅ Ensure DOM is fully loaded before setting sizes
  setTimeout(() => {
    if (!mountRef.current) return;

    const width = mountRef.current.clientWidth || window.innerWidth;
    const height = mountRef.current.clientHeight || window.innerHeight;

    const initialAltitude = 50000; // LEO default
    const camera = new THREE.PerspectiveCamera(70, width / height, 0.5, 900000);
    camera.position.set(0, 5, initialAltitude);
    camera.updateProjectionMatrix();
    cameraRef.current = camera;

    // ✅ Notice 'alpha: true' to allow a transparent background
    const renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      precision: "highp",
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(window.devicePixelRatio);
    // ✅ Make sure the background is clear
    renderer.setClearAlpha(0);

    mountRef.current.appendChild(renderer.domElement);

    // ✅ OrbitControls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableZoom = true;
    controls.enablePan = false;
    controls.enableDamping = true;
    controls.dampingFactor = 0.1;
    controls.rotateSpeed = 0.5;
    controls.minDistance = 6230;
    controls.maxDistance = 500000;
    controlsRef.current = controls;

    // ✅ Add Light Source
    const light = new THREE.DirectionalLight(0xffffff, 4.5);
    light.position.set(200, 50, 0);
    scene.add(light);

    // 🌍 Create Earth
    const globe = new THREE.Mesh(
      new THREE.SphereGeometry(6000, 64, 64),
      new THREE.MeshStandardMaterial({
        map: dayMap,
        emissiveMap: nightMap,
        emissiveIntensity: 0.1,
        emissive: new THREE.Color(0xffffff),
        bumpScale: 0.5,
        roughness: 1.5,
        metalness: 0.7,
      })
    );
    globeRef.current = globe;
    scene.add(globe);

    // 🔄 Handle Window Resize
    const resizeRenderer = () => {
      if (!mountRef.current) return;
      const width = mountRef.current.clientWidth;
      const height = mountRef.current.clientHeight;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    };
    window.addEventListener("resize", resizeRenderer);

    // 🌫 Atmosphere Glow
    const atmosphere = new THREE.Mesh(
      new THREE.SphereGeometry(6100.5, 64, 64),
      new THREE.MeshBasicMaterial({
        color: 0x3399ff,
        transparent: true,
        opacity: 0.5,
        side: THREE.BackSide,
      })
    );
    atmosphereRef.current = atmosphere;
    scene.add(atmosphere);

    // ❌ (Optional) Remove the “3D starfield” code here, so only your main page starfield is visible
    // If you have code to add star backgrounds in the scene, just comment or remove it:
    // scene.add(stars)...

    // 🔄 Animation Loop
    const animate = () => {
      requestAnimationFrame(animate);

      if (globeRef.current) globeRef.current.rotation.y += 0.000727; // Earth's rotation

      const time = Date.now() / 1000;
      const timeFactor = 1;

      // 🛰️ Update satellites’ positions
      Object.values(satelliteObjectsRef.current).forEach((satelliteModel) => {
        if (satelliteModel.userData) {
          const newPos = computeSatellitePosition(satelliteModel.userData, time * timeFactor);
          if (newPos) {
            satelliteModel.position.lerp(newPos, 0.1);
          }
        }
      });

      if (
        selectedPointerRef.current &&
        selectedPointerRef.current.userData.followingSatellite
      ) {
        const followedSat =
          satelliteObjectsRef.current[
            selectedPointerRef.current.userData.followingSatellite
          ];
        if (followedSat) {
          selectedPointerRef.current.position.copy(followedSat.position);
          selectedPointerRef.current.lookAt(new THREE.Vector3(0, 0, 0));
        }
      }

      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    // ✅ Cleanup
    return () => {
      console.log("🗑 Cleaning up Three.js scene...");
      window.removeEventListener("resize", resizeRenderer);

      if (rendererRef.current) {
        rendererRef.current.dispose();
        rendererRef.current.forceContextLoss();
        if (mountRef.current?.contains(rendererRef.current.domElement)) {
          mountRef.current.removeChild(rendererRef.current.domElement);
        }
        rendererRef.current = null;
      }
      if (sceneRef.current) {
        sceneRef.current.traverse((object) => {
          if (object.isMesh) {
            object.geometry.dispose();
            if (Array.isArray(object.material)) {
              object.material.forEach((m) => m.dispose());
            } else {
              object.material.dispose();
            }
          }
        });
        sceneRef.current = null;
      }

      globeRef.current = null;
      cloudRef.current = null;
      cameraRef.current = null;
      controlsRef.current = null;
    };
  }, 100);
}, [is3DEnabled]);




const [realTimeData, setRealTimeData] = useState({
  latitude: "N/A",
  longitude: "N/A",
  altitude: "N/A",
  velocity: "N/A",
});

  const satrecRef = useRef(null); // ✅ Store TLE propagation object
  const intervalRef = useRef(null); // ✅ Store interval reference


  useEffect(() => {
    if (!selectedSatellite || !selectedSatellite.tle_line1 || !selectedSatellite.tle_line2) return;

    console.log(`🌍 Updating Satellite: ${selectedSatellite.name}`);

    satrecRef.current = twoline2satrec(selectedSatellite.tle_line1, selectedSatellite.tle_line2);

    if (intervalRef.current) clearInterval(intervalRef.current);
    
    const updateInfoBox = () => {
      if (!satrecRef.current) return;

      const now = new Date();
      const julianDate = gstime(now);

      // ✅ Propagate position using SGP4
      const positionAndVelocity = propagate(satrecRef.current, now);
      if (!positionAndVelocity.position || !positionAndVelocity.velocity) return;

      const { x, y, z } = positionAndVelocity.position;
      const { x: vx, y: vy, z: vz } = positionAndVelocity.velocity;

      // ✅ Convert ECI to Geodetic (Latitude, Longitude, Altitude)
      const geodetic = eciToGeodetic({ x, y, z }, julianDate);

      // ✅ Convert Radians to Degrees
      const latitude = degreesLat(geodetic.latitude).toFixed(6);
      const longitude = degreesLong(geodetic.longitude).toFixed(6);

      // ✅ Convert Altitude from Meters to Kilometers
      const altitudeKm = (geodetic.height * 1000) / 1000;
      const altitudeFormatted = altitudeKm.toFixed(6); // Keep six decimal places

      // ✅ Compute real velocity from velocity components
      const velocity = Math.sqrt(vx ** 2 + vy ** 2 + vz ** 2).toFixed(6); // Keep six decimal places

      console.log(`🔄 Updating Data | Latitude: ${latitude}° | Longitude: ${longitude}° | Velocity: ${velocity} km/s | Altitude: ${altitudeFormatted} km`);

      setRealTimeData({
        latitude,
        longitude,
        altitude: altitudeFormatted,
        velocity,
      });
    };



    updateInfoBox(); // ✅ Initial update

    intervalRef.current = setInterval(updateInfoBox, 1000); // ✅ Update every second

    return () => clearInterval(intervalRef.current); // ✅ Clean up on unmount
  }, [selectedSatellite,is3DEnabled]);



  useEffect(() => {
    if (!isTracking || !selectedSatellite || !cameraRef.current) return;
  
    console.log(`📌 Tracking satellite: ${selectedSatellite.name} (NORAD: ${selectedSatellite.norad_number})`);
  
    let frameId;
  
    const trackSatellite = () => {
      if (!selectedSatellite || !satelliteObjectsRef.current[selectedSatellite.norad_number]) return;
  
      const satPosition = satelliteObjectsRef.current[selectedSatellite.norad_number].position.clone();
  
      // ✅ Dynamic Speed Factor Based on Altitude
      const altitude = selectedSatellite.perigee;
      let speedFactor = altitude < 2000 ? 0.12 : 0.08; // ✅ Lower for smooth LEO tracking
  
      // ✅ Maintain Zoom Factor Logic
      const zoomFactor = selectedSatellite.perigee < 2000 ? 1.0009 : 1.0003;
      const targetPos = satPosition.multiplyScalar(zoomFactor);
  
      // ✅ Smooth Lerp to Target Position (Frame-Timed)
      cameraRef.current.position.lerp(targetPos, speedFactor);
      cameraRef.current.lookAt(satPosition);
  
      frameId = requestAnimationFrame(trackSatellite); // 🔄 Runs per frame for smooth tracking
    };
  
    trackSatellite(); // Start tracking
  
    return () => {
      cancelAnimationFrame(frameId);
      console.log(`🛑 Stopped tracking ${selectedSatellite.name}`);
    };
  }, [isTracking, selectedSatellite, is3DEnabled]);

  

// ✅ Ensure Tracking Stops Only If User Clicks Inside 3D UI
useEffect(() => {
  if (!controlsRef.current) return;

  const handleUserInteraction = (event) => {
    // ✅ Stops tracking only if user **clicks** inside 3D UI (not just scrolling)
    if (event.type === "pointerdown" && event.target.tagName === "CANVAS") {
      console.log("🛑 User interacted with 3D UI - stopping tracking...");
      setIsTracking(false);
    }
  };

  document.addEventListener("pointerdown", handleUserInteraction);

  return () => {
    document.removeEventListener("pointerdown", handleUserInteraction);
  };
}, [isTracking, is3DEnabled]);




const displayedSatellites = (filteredSatellites.length > 0 ? filteredSatellites : satellites).filter((sat) =>
  sat.name.toLowerCase().includes(searchQuery.toLowerCase()) // ✅ Search applied here
);

const countryMapping = {
  // Major Space-Faring Nations
  "US": { name: "USA", flag: "🇺🇸" },
  "PRC": { name: "China", flag: "🇨🇳" },
  "UK": { name: "United Kingdom", flag: "🇬🇧" },
  "CIS": { name: "CIS (Former USSR)", flag: "🇷🇺" },
  "JPN": { name: "Japan", flag: "🇯🇵" },
  "IND": { name: "India", flag: "🇮🇳" },
  "ESA": { name: "European Space Agency", flag: "🇪🇺" },
  "FR": { name: "France", flag: "🇫🇷" },
  "GER": { name: "Germany", flag: "🇩🇪" },
  "SKOR": { name: "South Korea", flag: "🇰🇷" },
  "IT": { name: "Italy", flag: "🇮🇹" },
  "SPN": { name: "Spain", flag: "🇪🇸" },
  "RUS": { name: "Russia", flag: "🇷🇺" },
  "UKR": { name: "Ukraine", flag: "🇺🇦" },
  "BRAZ": { name: "Brazil", flag: "🇧🇷" },
  "CAN": { name: "Canada", flag: "🇨🇦" },
  "AUS": { name: "Australia", flag: "🇦🇺" },

  // Satellite Communication & Global Operators
  "SES": { name: "SES (Luxembourg)", flag: "🇱🇺" },
  "O3B": { name: "O3B Networks", flag: "🛰️" },
  "GLOB": { name: "Globalstar", flag: "🌎" },
  "IRID": { name: "Iridium Communications", flag: "🛰️" },
  "ITSO": { name: "INTELSAT", flag: "🛰️" },
  "INMA": { name: "INMARSAT", flag: "🛰️" },
  "EUME": { name: "EUMETSAT", flag: "🇪🇺" },
  "EUTE": { name: "EUTELSAT", flag: "🇪🇺" },

  // Middle East & Africa
  "UAE": { name: "United Arab Emirates", flag: "🇦🇪" },
  "ISRA": { name: "Israel", flag: "🇮🇱" },
  "IRAN": { name: "Iran", flag: "🇮🇷" },
  "SAFR": { name: "South Africa", flag: "🇿🇦" },
  "EGYP": { name: "Egypt", flag: "🇪🇬" },
  "TURK": { name: "Turkey", flag: "🇹🇷" },
  "KAZ": { name: "Kazakhstan", flag: "🇰🇿" },
  "QAT": { name: "Qatar", flag: "🇶🇦" },
  "PAKI": { name: "Pakistan", flag: "🇵🇰" },
  "KEN": { name: "Kenya", flag: "🇰🇪" },

  // Americas
  "ARGN": { name: "Argentina", flag: "🇦🇷" },
  "MEX": { name: "Mexico", flag: "🇲🇽" },
  "CHLE": { name: "Chile", flag: "🇨🇱" },
  "PER": { name: "Peru", flag: "🇵🇪" },
  "BOL": { name: "Bolivia", flag: "🇧🇴" },
  "URY": { name: "Uruguay", flag: "🇺🇾" },
  "VENZ": { name: "Venezuela", flag: "🇻🇪" },
  "COL": { name: "Colombia", flag: "🇨🇴" },
  "NIC": { name: "Nicaragua", flag: "🇳🇮" },

  // Europe
  "BEL": { name: "Belgium", flag: "🇧🇪" },
  "NOR": { name: "Norway", flag: "🇳🇴" },
  "POL": { name: "Poland", flag: "🇵🇱" },
  "HUN": { name: "Hungary", flag: "🇭🇺" },
  "SING": { name: "Singapore", flag: "🇸🇬" },
  "BELA": { name: "Belarus", flag: "🇧🇾" },
  "NETH": { name: "Netherlands", flag: "🇳🇱" },
  "CZE": { name: "Czech Republic", flag: "🇨🇿" },
  "SVK": { name: "Slovakia", flag: "🇸🇰" },
  "AUT": { name: "Austria", flag: "🇦🇹" },
  "SWTZ": { name: "Switzerland", flag: "🇨🇭" },
  "LUXE": { name: "Luxembourg", flag: "🇱🇺" },
  "DEN": { name: "Denmark", flag: "🇩🇰" },
  "SWE": { name: "Sweden", flag: "🇸🇪" },
  "FIN": { name: "Finland", flag: "🇫🇮" },
  "ROM": { name: "Romania", flag: "🇷🇴" },

  // Asia-Pacific
  "TWN": { name: "Taiwan", flag: "🇹🇼" },
  "INDO": { name: "Indonesia", flag: "🇮🇩" },
  "THAI": { name: "Thailand", flag: "🇹🇭" },
  "BGD": { name: "Bangladesh", flag: "🇧🇩" },
  "PHL": { name: "Philippines", flag: "🇵🇭" },
  "NZ": { name: "New Zealand", flag: "🇳🇿" },
  "MYA": { name: "Myanmar", flag: "🇲🇲" },
  "LKA": { name: "Sri Lanka", flag: "🇱🇰" },
  "MALA": { name: "Malaysia", flag: "🇲🇾" },
  "VTNM": { name: "Vietnam", flag: "🇻🇳" },
  "MNG": { name: "Mongolia", flag: "🇲🇳" },
  "NPL": { name: "Nepal", flag: "🇳🇵" },

  // International Organizations & Space Stations
  "ISS": { name: "ISS (International Space Station)", flag: "🚀" },
  "AB": { name: "Arab Satellite Communications Organization", flag: "🌍" },
  "IM": { name: "International Maritime Satellite Organization", flag: "🌊" },
  "NATO": { name: "North Atlantic Treaty Organization", flag: "🛡️" },
  "RASC": { name: "Regional African Satellite Communications Org", flag: "🌍" },
  "UNKN": { name: "Unknown", flag: "❓" },

  // Space Debris & Unknown Entities
  "TBD": { name: "To Be Determined / Unknown", flag: "🛰️" },
  "DEB": { name: "Space Debris", flag: "🗑️" },
  "RB": { name: "Rocket Body (Debris)", flag: "🚀" }
};



const getCountryFlag = (code) => countryMapping[code]?.flag || "🌍";
const getCountryName = (code) => countryMapping[code]?.name || "Unknown";




const categories = {
  "Orbital Categories": [
    { name: "LEO", label: "Low Earth Orbit (LEO)" },
    { name: "MEO", label: "Medium Earth Orbit (MEO)" },
    { name: "GEO", label: "Geostationary Orbit (GEO)" },
    { name: "HEO", label: "Highly Elliptical Orbit (HEO)" },
  ],
  "Velocity & Orbital Parameters": [
    { name: "High Velocity", label: "Fast (>7.8 km/s)" },
    { name: "Low Velocity", label: "Slow (≤7.8 km/s)" },
    { name: "Perigee < 500 km", label: "Perigee < 500 km" },
    { name: "Apogee > 35,000 km", label: "Apogee > 35,000 km" },
    { name: "Eccentricity > 0.1", label: "High Eccentricity (>0.1)" },
    { name: "B* Drag Term > 0.0001", label: "High Drag (B* > 0.0001)" },
  ],
  "Mission Type": [
    { name: "Communications", label: "Communications" },
    { name: "Navigation", label: "Navigation" },
    { name: "Military/Reconnaissance", label: "Military / Recon" },
    { name: "Weather Monitoring", label: "Weather Monitoring" },
    { name: "Earth Observation", label: "Earth Observation" },
    { name: "Scientific Research", label: "Scientific Research" },
    { name: "Human Spaceflight", label: "Human Spaceflight" },
    { name: "Technology Demonstration", label: "Technology Demo" },
    { name: "Space Infrastructure", label: "Space Infrastructure" },
    { name: "Satellite Servicing & Logistics", label: "Satellite Servicing" },
    { name: "Starlink Constellation", label: "Starlink Constellation" },
    { name: "OneWeb Constellation", label: "OneWeb Constellation" },
    { name: "Iridium NEXT Constellation", label: "Iridium NEXT Constellation" },
    { name: "Deep Space Exploration", label: "Deep Space Exploration" },
    { name: "Space Debris", label: "Space Debris" },
    { name: "Rocket Body (Debris)", label: "Rocket Body Debris" },
    { name: "Unknown", label: "Unknown Purpose" },
  ],
};






/* -------------------------------------------------------------
   🔍 Autocomplete suggestions
------------------------------------------------------------- */
useEffect(() => {
  if (!searchQuery.trim()) {
    setSuggestions([]);
    return;
  }

  const debounce = setTimeout(async () => {
    try {
      setSearchLoading(true);

      // add filter only when a filter chip is active
      const filtParam = activeFilters.length
        ? `&filter=${encodeURIComponent(activeFilters.join(","))}`
        : "";

      const resp = await fetch(
        `${SUGGEST_URL}?query=${encodeURIComponent(searchQuery)}&limit=10${filtParam}`
      );
      if (!resp.ok) throw new Error(resp.statusText);

      // backend returns { suggestions: [...] }
      const { suggestions = [] } = await resp.json();

      // keep only items that actually pass the current filter set
      const filtered = suggestions;

      setSuggestions(filtered);
    } catch (e) {
      console.error("suggest fetch error:", e);
      setSuggestions([]);
    } finally {
      setSearchLoading(false);
    }
  }, 300);

  return () => clearTimeout(debounce);
}, [searchQuery, activeFilters, filteredSatellites]);

// close suggestions on outside click
useEffect(() => {
  if (suggestions.length === 0) return;
  const handleClick = (e) => {
    if (
      dropdownRef.current &&
      !dropdownRef.current.contains(e.target) &&
      inputRef.current &&
      !inputRef.current.contains(e.target)
    ) {
      setSuggestions([]);
    }
  };
  document.addEventListener("mousedown", handleClick);
  return () => document.removeEventListener("mousedown", handleClick);
}, [suggestions]);

// Automatically enable 3D after 1 second

// ⏎ enter key search
const handleSearch = async () => {
  if (!searchQuery.trim()) return;
  setLoading(true);
  try {
    const numeric = /^\d+$/.test(searchQuery.trim());
    const endpoint = numeric
      ? `${import.meta.env.VITE_API_BASE_URL || "/api/satellites"}/by_norad/${searchQuery.trim()}`
      : `${import.meta.env.VITE_API_BASE_URL || "/api/satellites"}/${encodeURIComponent(searchQuery.trim().toLowerCase())}`;
    const r = await fetch(endpoint);
    if (!r.ok) throw new Error(r.statusText);
    const sat = await r.json();

    const found = await findPageForSatellite(sat);
    if (found) {
      setPage(found.page);
      // setSatellites(found.sats);
      // setFilteredSatellites(found.sats);
    }

    focusOnSatellite(sat);
    enableInteraction();
    setSelectedSatellite(sat);
    setSuggestions([]);
  } catch (err) {
    console.error("search error:", err);
  } finally {
    setLoading(false);
  }
};

// click dropdown suggestion
const handleSuggestionClick = async (sug) => {
  setSearchQuery(sug.name);
  setSuggestions([]);
  setLoading(true);
  try {
    const endpoint = sug.norad_number
      ? `${import.meta.env.VITE_API_BASE_URL || "/api/satellites"}/by_norad/${sug.norad_number}`
      : `${import.meta.env.VITE_API_BASE_URL || "/api/satellites"}/${encodeURIComponent(sug.name.toLowerCase())}`;
    const r = await fetch(endpoint);
    if (!r.ok) throw new Error(r.statusText);
    const sat = await r.json();

    const found = await findPageForSatellite(sat);
    if (found) {
      setPage(found.page);
      // setSatellites(found.sats);
      // setFilteredSatellites(found.sats);
    }

    focusOnSatellite(sat);
    enableInteraction();
    setSelectedSatellite(sat);
  } catch (err) {
    console.error("suggest click:", err);
  } finally {
    setLoading(false);
  }
};
useEffect(() => {
  const timer = setTimeout(() => {
    setIs3DEnabled(true);
  }, 1);
  return () => clearTimeout(timer);
}, []);



return (
  <div className="relative flex flex-col w-screen min-h-screen overflow-hidden border-gray-950 bg-gradient-to-b from-[#050716] via-[#1B1E3D] to-[#2E4867] text-white font-[Space Grotesk]">
    {/* Background stars + Navbar */}
    <div className="absolute w-full h-full overflow-hidden pointer-events-none z-0">
    <StarField numStars={150} />
    </div>
    <Navbar />

    <SatelliteCounter />

    {/* Main Layout: Left (3D) + Right (Sidebar) */}
    <div className="relative flex flex-1 max-h-screen z-10">
      {/* LEFT 3D SECTION */}
      <div className="relative flex w-3/4 max-h-screen overflow-hidden">
        {/* Optional starfield specifically inside 3D */}
        <div className="absolute w-full h-full overflow-hidden pointer-events-none">
        <StarField numStars={150} />
        </div>

        {/* 3D Scene */}
        <div className="relative flex-1 h-screen cursor-pointer">
          <div ref={mountRef} className="absolute top-0 left-0 w-full h-full" />
        </div>

        {/* Loading Overlay */}
        {loading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center z-[90]">
            <div className="w-40 h-40 animate-rotatePause">
              <img src= {`${import.meta.env.BASE_URL}favicon.svg`} alt="Site Logo" className="w-full h-full" />
            </div>
            <style>{`
              @keyframes rotatePause {
                0% { transform: rotate(0deg); }
                20% { transform: rotate(120deg); }
                25% { transform: rotate(120deg); } 
                45% { transform: rotate(240deg); }
                50% { transform: rotate(240deg); } 
                70% { transform: rotate(360deg); }
                75% { transform: rotate(360deg); } 
                100% { transform: rotate(360deg); }
              }
              .animate-rotatePause {
                animation: rotatePause 2.5s infinite ease-in-out;
                transform-origin: center center;
              }
            `}</style>
          </div>
        )}

        {/* Compact Info Box - anchored at bottom-left of LEFT container */}
        {is3DEnabled && (
          <div
            className="absolute bottom-4 left-4 w-80  /* or w-96 if you prefer */
                       bg-gray-900 bg-opacity-90 text-teal-300 p-4 shadow-lg text-xs 
                       border-t-4 border-teal-300 rounded-xl z-[50] 
                       transition-all duration-300 ease-in-out"
            style={{ maxHeight: "180px", overflowY: "auto" }}
          >
            {!selectedSatellite ? (
              <div className="flex flex-col items-center justify-center h-full text-teal-300 font-semibold text-center p-3">
                <span className="text-xl">📡</span>
                <p className="mt-1">Select a satellite</p>
              </div>
            ) : (
              <>
                <div className="w-full text-center border-b border-teal-300 pb-2">
                  <div className="text-sm font-bold text-teal-300 truncate">
                    {selectedSatellite.name}
                  </div>
                  <div className="text-xs flex items-center justify-center mt-1 space-x-1">
                    <span className="text-lg">{getCountryFlag(selectedSatellite.country)}</span>
                    <span>{getCountryName(selectedSatellite.country)}</span>
                  </div>
                </div>

                <div className="w-full py-2 space-y-1">
                  <div className="flex justify-between">
                    <span className="text-teal-300 text-[10px] uppercase">Velocity</span>
                    <span>{realTimeData.velocity} km/s</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-teal-300 text-[10px] uppercase">Altitude</span>
                    <span>{realTimeData.altitude} km</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-teal-300 text-[10px] uppercase">Position</span>
                    <span>
                      {realTimeData.latitude}°, {realTimeData.longitude}°
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-teal-300 text-[10px] uppercase">Purpose</span>
                    <span className="truncate">{selectedSatellite.purpose || "Unknown"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-teal-300 text-[10px] uppercase">Object Type</span>
                    <span className="truncate">{selectedSatellite.object_type || "Unknown"}</span>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* Active Filters UI - anchored at top-left of LEFT container */}
        {is3DEnabled && (
          <div
            className="absolute top-20 left-4  /* or top-4 right-4, your call */
                       bg-gray-900 text-white p-3 rounded-md shadow-lg text-xs 
                       z-50 w-44 /* adjust width as needed */"
          >
            <h3 className="text-sm font-semibold text-gray-300">Active Filters:</h3>
            {activeFilters.length > 0 ? (
              <ul className="mt-1 space-y-1">
                {activeFilters.map((filter, index) => (
                  <li key={index} className="text-teal-300 flex items-center">
                    • {filter}
                    <button
                      className="ml-2 text-red-500 hover:text-red-700"
                      onClick={() => toggleFilter(filter)}
                    >
                      ✖
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-gray-400">None</p>
            )}
          </div>
        )}
      </div>

      {/* RIGHT-SIDE PANEL (Expandable or fixed) */}
      <div
        className={`
          flex flex-col gap-3 px-4 z-[99]
          bg-gray-900/90 backdrop-blur-lg border border-gray-700
          shadow-xl rounded-xl
          transition-all duration-300
          ${
            isExpanded
              ? "absolute top-0 right-0 w-full h-screen z-[99]" // Full screen overlay
              : "absolute top-0 right-0 h-screen w-1/4 z-[99]"  // Narrow sidebar
          }
        `}
      >
        {/* Expand/Collapse */}
        <div className="flex justify-end mt-2 mr-2">
          <button
            onClick={toggleExpanded}
            className="px-4 py-2 text-sm font-medium bg-gray-800 text-white rounded-md 
                       hover:bg-gray-700 transition-colors"
          >
            {isExpanded ? "Close Panel" : "Expand"}
          </button>
        </div>
        {/* Satellite List - top half */}
        <div className="h-1/2 p-4 flex flex-col space-y-3">
          <h3 className="text-lg font-semibold text-white text-center tracking-wide border-b border-gray-700 pb-2">
            Active Satellites
          </h3>

          <div className="relative">
            <input
              ref={inputRef}
              type="text"
              placeholder="Search satellites..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              className="w-full p-2 pl-10 text-white bg-gray-800 rounded-md 
                         focus:outline-none focus:ring-2 focus:ring-teal-400
                         border border-gray-600 shadow-sm text-sm"
            />
            <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 text-sm">
              🔍
            </span>

            {/* suggestions dropdown */}
            {suggestions.length > 0 && (
              <ul
                ref={dropdownRef}
                className="absolute z-50 mt-1 w-full max-h-60 overflow-y-auto bg-gray-800 text-white border border-gray-700 rounded-md shadow-lg"
              >
                {suggestions.map((sat) => (
                  <li
                    key={sat.norad_number}
                    className="px-3 py-2 cursor-pointer hover:bg-teal-600 text-sm"
                    onClick={() => handleSuggestionClick(sat)}
                  >
                    {sat.name} — NORAD {sat.norad_number}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="overflow-y-auto flex-grow scrollbar-hide p-3 bg-gray-800/50 rounded-lg">
            {loading ? (
              <div className="flex flex-col items-center justify-center text-teal-300 text-lg font-semibold animate-pulse">
                <div className="w-12 h-12 border-4 border-gray-600 border-t-teal-400 rounded-full animate-spin"></div>
                <p className="mt-4 tracking-wide text-gray-300">Fetching satellite data...</p>
              </div>
            ) : displayedSatellites.length === 0 ? (
              <div className="flex flex-col items-center justify-center text-center text-lg font-semibold text-gray-300">
                <p className="text-2xl text-white tracking-wide">Open UI to select satellites</p>
                <p className="text-gray-500 text-sm mt-2">
                  Your selected satellites will appear here.
                </p>
              </div>
            ) : (
              <ul className="grid grid-cols-1 gap-3 w-full">
                {displayedSatellites.map((sat) => (
                  <li
                    key={sat.norad_number}
                    className={`cursor-pointer p-4 rounded-lg text-center border border-gray-700 shadow-md transition-all duration-300 text-lg font-semibold flex flex-col items-center justify-between
                      ${
                        selectedSatellite?.norad_number === sat.norad_number
                          ? "bg-teal-500 text-white border-teal-500 shadow-lg scale-105"
                          : "bg-gray-800 hover:bg-gray-700 active:bg-teal-600"
                      }`}
                    onClick={() => {
                      console.log(`Selecting satellite: ${sat.name} (NORAD: ${sat.norad_number})`);
                      focusOnSatellite(sat);
                      enableInteraction();
                    }}
                  >
                    <div className="flex items-center space-x-3">
                      <span className="text-3xl">{getCountryFlag(sat.country)}</span>
                      <span className="text-lg">{sat.name}</span>
                    </div>
                    <span className="text-sm text-gray-400">NORAD: {sat.norad_number}</span>
                    {sat.launch_date ? (
                      <span className="text-xs text-gray-300 mt-1">
                        Launched: {new Date(sat.launch_date).toLocaleDateString()}
                      </span>
                    ) : (
                      <span className="text-xs text-gray-500 mt-1">
                        🚀 Launch Date: Unknown
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Pagination Controls */}
          <div className="flex flex-col items-center mt-4 border-t border-gray-700 pt-2 w-full min-w-0">
            <span className="text-xs text-gray-300 mb-1">
              Page {page} of {Math.max(1, Math.ceil(total / limit))}
            </span>
            <div className="flex flex-wrap justify-center w-full space-x-2 mt-1">
              <button
                onClick={() => changePage(1)}
                disabled={page === 1 || loading}
                className={`px-3 py-1 text-xs bg-gray-700 text-white rounded-md shadow-md 
                            hover:bg-gray-600 transition-all ${
                              page === 1 || loading ? "opacity-50 cursor-not-allowed" : ""
                            }`}
              >
                ⏮ First
              </button>
              <button
                onClick={() => changePage(page - 1)}
                disabled={page === 1 || loading}
                className={`px-3 py-1 text-xs bg-gray-700 text-white rounded-md shadow-md 
                            hover:bg-gray-600 transition-all ${
                              page === 1 || loading ? "opacity-50 cursor-not-allowed" : ""
                            }`}
              >
                ← Prev
              </button>
              <button
                onClick={() => changePage(page + 1)}
                disabled={loading || page * limit >= total}
                className={`px-3 py-1 text-xs bg-gray-700 text-white rounded-md shadow-md 
                            hover:bg-gray-600 transition-all ${
                              loading || page * limit >= total
                                ? "opacity-50 cursor-not-allowed"
                                : ""
                            }`}
              >
                Next →
              </button>
              <button
                onClick={() => changePage(Math.ceil(total / limit))}
                disabled={page === Math.ceil(total / limit) || loading}
                className={`px-3 py-1 text-xs bg-gray-700 text-white rounded-md shadow-md 
                            hover:bg-gray-600 transition-all ${
                              page === Math.ceil(total / limit) || loading
                                ? "opacity-50 cursor-not-allowed"
                                : ""
                            }`}
              >
                Last ⏭
              </button>
            </div>
          </div>
        </div>

        {/* Filters - bottom half */}
        <div className="h-1/2 p-4 space-y-1 overflow-hidden flex flex-col">
          <h3 className="text-sm font-semibold text-white text-center tracking-wide border-b border-gray-700 pb-2">
            Satellite Filters
          </h3>

          <div
            className="h-[200px] overflow-y-auto border border-gray-700 rounded-lg p-10 bg-gray-800/50 scrollbar-hide"
            style={{ touchAction: "none", overscrollBehavior: "contain" }}
          >
            <h4 className="text-xs font-semibold text-teal-300 mb-2 text-center">
              Select Filters
            </h4>
            <div className="grid grid-cols-1 gap-2">
              {Object.entries(categories).flatMap(([category, filters]) =>
                filters.map((filter) => (
                  <Button
                    key={filter.name}
                    onClick={() => toggleFilter(filter.name)}
                    className="w-full px-10 py-2 text-xs font-medium text-white bg-gray-800 
                               border border-gray-600 hover:bg-teal-500 transition-all rounded-md"
                  >
                    {filter.label}
                  </Button>
                ))
              )}
            </div>
          </div>

          <div className="flex-grow grid grid-cols-2 gap-3 mt-3">
            {/* Launch Year */}
            <div className="flex flex-col">
              <h4 className="text-xs font-semibold text-teal-300 mb-2 text-center">
                Launch Year
              </h4>
              <div
                className="h-[160px] overflow-y-auto bg-gray-800/50 border border-gray-700 rounded-lg p-2 scrollbar-hide"
                style={{ touchAction: "none", overscrollBehavior: "contain" }}
              >
                {Array.from({ length: 30 }, (_, i) => 2025 - i).map((year) => (
                  <Button
                    key={year}
                    onClick={() => toggleFilter(`Launch Year:${year}`)}
                    className="w-full text-[11px] font-medium text-white bg-gray-800 
                               hover:bg-teal-500 transition-all rounded-md py-1 mb-1"
                  >
                    {year}
                  </Button>
                ))}
              </div>
            </div>

            {/* Country of Origin */}
            <div className="flex flex-col">
              <h4 className="text-xs font-semibold text-teal-300 mb-2 text-center">
                Country of Origin
              </h4>
              <div
                className="h-[160px] overflow-y-auto bg-gray-800/50 border border-gray-700 rounded-lg p-2 scrollbar-hide"
                style={{ touchAction: "none", overscrollBehavior: "contain" }}
              >
                {Object.entries(countryMapping)
                  .slice(0, 20)
                  .map(([code, { name, flag }]) => (
                    <Button
                      key={code}
                      onClick={() => toggleFilter(`Country:${code}`)}
                      className="w-full text-[11px] font-medium text-white bg-gray-800 
                                 hover:bg-teal-500 transition-all rounded-md py-1 mb-1 
                                 flex items-center space-x-2"
                    >
                      <span className="text-lg">{flag}</span>
                      <span>{name}</span>
                    </Button>
                  ))}
              </div>
            </div>
          </div>

          <div className="mt-2 text-center">
            <Button
              onClick={resetFilters}
              className="px-4 py-2 text-xs font-semibold text-black bg-teal-300 
                         hover:bg-teal-400 rounded-md shadow-md transition-all"
            >
              Reset Filters
            </Button>
          </div>
        </div>
      </div>
    </div>

 {/* Infographics Section */}
<Infographics
  satellitesForCharts={satellitesForCharts}
  loading={chartLoading}
  error={chartError}
/>

{/* ---------------------------
   🌌 Mako Experience Section
   --------------------------- */}
<div className="
  max-w-screen-2xl  /* <-- Wider than 7xl. Adjust to taste */
  mx-auto 
  w-full 
  px-6            /* <-- Adjust your side padding */
  sm:px-12 
  lg:px-20 
  py-12 
  z-10
">
  {/* Title */}
  <div className="text-6xl font-bold glow-text text-center mb-12">
    <TypeAnimation
      sequence={[
        "Observe All Objects",
        2000,
        "",
        500,
        "Explore the Skies...",
        2000,
        "",
        500,
        "Tracking Satellites in Real-Time",
        2500,
      ]}
      wrapper="span"
      speed={50}
      repeat={Infinity}
    />
  </div>

  {/* Grid Layout */}
  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-16 pb-24">
    {/* 
      ^ If you want more or less spacing between cards, 
      change `gap-16` to `gap-12`, etc.
    */}

    {/* Satellite Model Container */}
    <div className="satellite-container relative left-[55%] top-[45%] scale-[3.5] sm:scale-[3.5] md:scale-[3.5]">
      <div className="satellite">
        <div className="radio-dish"></div>
        <div className="antenna"></div>
        <div className="antenna-ball"></div>
        <div className="satellite-body"></div>
        <div className="solar-panel left"></div>
        <div className="solar-panel right"></div>
      </div>
    </div>

    {/* The Future of Orbital Tracking */}
    <div className="
      p-10 
      bg-[#1E233F] bg-opacity-95 
      rounded-xl shadow-xl 
      border border-[#3E6A89] 
      hover:scale-105 
      transition-transform 
      duration-300 
      lg:col-span-2
    ">
      <h2 className="text-4xl font-semibold text-[#86EED8] tracking-wide">
        Next-Generation Orbital Tracking
      </h2>
      <p className="mt-6 text-lg leading-relaxed text-gray-300">
        Step into the{" "}
        <span className="text-[#C8E49C] font-semibold uppercase">
          real-time orbital intelligence
        </span>{" "}
        era. Powered by <strong>high-fidelity Keplerian models</strong>, 
        this system provides a <strong>seamless visualization</strong> 
        of Earth’s satellites, designed for <strong>precision-driven mission planning</strong> 
        and <strong>collision risk mitigation</strong>.
      </p>
    </div>

    {/* Deep-Tech Insights */}
    <div className="
      p-8 
      bg-[#253654] bg-opacity-90 
      rounded-lg shadow-lg 
      border border-[#5E8A94] 
      hover:scale-105 
      transition-transform 
      duration-300
    ">
      <h2 className="text-3xl font-medium text-[#6BB8C7] tracking-wide">
        Deep-Tech Insights
      </h2>
      <p className="mt-5 text-lg leading-relaxed text-gray-300">
        By leveraging <strong>Two-Line Element (TLE) datasets</strong>, we calculate
        orbital trajectories with an{" "}
        <span className="text-[#C8E49C] font-semibold tracking-wide">
          adaptive physics engine
        </span>
        . Advanced <strong>GPU-accelerated rendering</strong> fuels an 
        <strong> interactive 3D experience</strong>, offering <strong>real-time orbital evolution</strong>.
      </p>
    </div>

    {/* Impact Across Industries */}
    <div className="
      p-10 
      bg-[#1E233F] bg-opacity-95 
      rounded-xl shadow-lg 
      border border-[#4F89A5] 
      hover:scale-105 
      transition-transform 
      duration-300 
      lg:col-span-2
    ">
      <h2 className="text-4xl font-semibold text-[#86EED8] tracking-wide">
        Impact Across Industries
      </h2>
      <ul className="mt-6 list-disc pl-6 space-y-4 text-lg text-gray-300">
        <li>
          <span className="text-[#C8E49C] font-semibold">
            Orbital Debris Mitigation
          </span>{" "}
          — Advanced AI-powered tracking of space junk.
        </li>
        <li>
          <span className="text-[#6BB8C7] font-semibold">
            Navigation Precision
          </span>{" "}
          — Enhanced GPS and satellite communication systems.
        </li>
        <li>
          <span className="text-[#5E8A94] font-semibold">
            Earth Monitoring
          </span>{" "}
          — Optimized climate and environmental observation.
        </li>
      </ul>
    </div>

    {/* System Capabilities */}
    <div className="
      p-8 
      bg-[#253654] bg-opacity-90 
      rounded-lg shadow-lg 
      border border-[#4F89A5] 
      hover:scale-105 
      transition-transform 
      duration-300
    ">
      <h2 className="text-3xl font-medium text-[#C8E49C] tracking-wide">
        System Capabilities
      </h2>
      <ul className="mt-5 list-disc pl-6 space-y-3 text-lg text-gray-300">
        <li>
          <span className="text-[#86EED8] font-semibold">Live Data Refresh</span>{" "}
          — Constant updates for orbital integrity.
        </li>
        <li>
          <span className="text-[#4F89A5] font-semibold">
            3D Orbital Mapping
          </span>{" "}
          — Built with <strong>Three.js</strong> and <strong>WebGL</strong>.
        </li>
        <li>
          <span className="text-[#5E8A94] font-semibold">
            Predictive Analytics
          </span>{" "}
          — Advanced forecasting for trajectory shifts.
        </li>
      </ul>
    </div>

    {/* Upcoming Innovations */}
    <div className="
      p-10 
      bg-[#1E233F] bg-opacity-95 
      rounded-xl shadow-lg 
      border border-[#3E6A89] 
      hover:scale-105 
      transition-transform 
      duration-300 
      lg:col-span-2
    ">
      <h2 className="text-4xl font-semibold text-[#C8E49C] tracking-wide">
        Upcoming Innovations
      </h2>
      <ul className="mt-6 list-disc pl-6 space-y-4 text-lg text-gray-300">
        <li>
          <span className="text-[#6BB8C7] font-semibold">
            AI-Based Threat Detection
          </span>{" "}
          — Identifies anomalies in satellite orbits.
        </li>
        <li>
          <span className="text-[#86EED8] font-semibold">
            Solar Weather Integration
          </span>{" "}
          — Real-time space weather monitoring.
        </li>
        <li>
          <span className="text-[#5E8A94] font-semibold">
            Historical Orbit Playback
          </span>{" "}
          — Rewind &amp; analyze satellite movements.
        </li>
      </ul>
    </div>

    {/* Beyond Low Earth Orbit */}
    <div className="
      p-9 
      bg-[#253654] bg-opacity-90 
      rounded-lg shadow-lg 
      border border-[#4F89A5] 
      hover:scale-105 
      transition-transform 
      duration-300
    ">
      <h2 className="text-3xl font-medium text-[#6BB8C7] tracking-wide">
        Beyond Low Earth Orbit
      </h2>
      <p className="mt-5 text-lg leading-relaxed text-gray-300">
        As deep-space missions accelerate, this system will evolve to <strong>track
        lunar assets</strong>, <strong>Martian surface explorers</strong>,
        and <strong>interplanetary relay satellites</strong>.
      </p>
    </div>

    {/* Educational Resources */}
    <div className="
      p-8 
      bg-[#1E233F] bg-opacity-95 
      rounded-xl shadow-lg 
      border border-[#3E6A89] 
      hover:scale-105 
      transition-transform 
      duration-300 
      lg:col-span-2
    ">
      <h2 className="text-4xl font-semibold text-[#86EED8] tracking-wide">
        Resources &amp; Further Exploration
      </h2>
      <ul className="mt-6 list-disc pl-6 space-y-4 text-lg text-gray-300">
        <li>
          <a
            href="https://www.spacestrak.com/"
            className="text-[#C8E49C] hover:underline hover:text-[#C8E49C]/80"
            target="_blank"
            rel="noreferrer"
          >
            SpaceTrak — TLE Data &amp; Orbital Elements
          </a>
        </li>
        <li>
          <a
            href="https://www.n2yo.com/"
            className="text-[#6BB8C7] hover:underline hover:text-[#6BB8C7]/80"
            target="_blank"
            rel="noreferrer"
          >
            N2YO — Live Satellite Tracking
          </a>
        </li>
      </ul>
    </div>
  </div>
</div>
</div>
);}