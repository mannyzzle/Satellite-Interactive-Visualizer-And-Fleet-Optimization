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
import {
  Search,
  Satellite as SatelliteIcon,
  X,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  ChevronDown,
  Maximize2,
  Minimize2,
  SlidersHorizontal,
  RotateCcw,
  Zap,
  AlertTriangle,
  TrendingUp,
  ExternalLink,
} from "lucide-react";
import { SATELLITES_API } from "../config";
import { StarField } from "../components/StarField";
import {
  SAT_GEOMETRY,
  materialForOrbit,
  makeAtmosphereMaterial,
  makePulseMarker,
} from "../lib/satelliteGeometry";
import NLSearchBar from "../components/NLSearchBar";
import DailyDigestCard from "../components/DailyDigestCard";

// Wrap the case-insensitive substring of `query` inside `text` with a
// highlighted span. Returns the original string when there is no match or no
// query so non-matching entries don't get an unstyled wrapper.
function highlightMatch(text, query) {
  if (!query) return text;
  const i = text.toLowerCase().indexOf(query.toLowerCase());
  if (i < 0) return text;
  return (
    <>
      {text.slice(0, i)}
      <span className="bg-teal-400/30 text-teal-100 rounded px-0.5">
        {text.slice(i, i + query.length)}
      </span>
      {text.slice(i + query.length)}
    </>
  );
}
// Re-export so existing imports (`import { StarField } from "./Home"`) still
// work during/after this refactor. New code should import from the dedicated
// component file.
export { StarField };
const basePath = import.meta.env.BASE_URL;  // ✅ Dynamically fetch the base URL
const dayTexture = `${basePath}earth_day.jpg`;
const nightTexture = `${basePath}earth_night.jpg`;
// 🔍 Autocomplete endpoint
const SUGGEST_URL = `${SATELLITES_API}/suggest`;





export default function Home() {
  const globeRef = useRef(null);
  const cloudRef = useRef(null);
  const atmosphereRef = useRef(null);
  const sunRef = useRef(null);
  const moonRef = useRef(null);
  const [isExpanded, setIsExpanded] = useState(false);
  // Filters panel collapses to save vertical space — list takes priority.
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);

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
// Index of the currently highlighted suggestion. -1 = no highlight (Enter
// then falls back to handleSearch / first result). Reset whenever the
// suggestion list itself changes.
const [highlightedIdx, setHighlightedIdx] = useState(-1);
// refs to close dropdown on outside-click
const inputRef = useRef(null);
const dropdownRef = useRef(null);

// Find which page a satellite lives on within the current filter set.
// Capped at 5 pages (≈2500 sats with the default 500-per-page) to avoid
// a 40+ second cascade of API calls when the satellite isn't in the
// filtered set at all — which used to silently return null after walking
// 80 pages while the user wondered why the picked satellite vanished.
const findPageForSatellite = async (sat) => {
  const filt = activeFilters.length ? activeFilters.join(",") : null;
  const MAX_PAGES = 5;
  for (let p = 1; p <= MAX_PAGES; p++) {
    const data = await fetchSatellites(p, limit, filt);
    if (data?.satellites?.some((s) => s.norad_number === sat.norad_number)) {
      return { page: p, sats: data.satellites };
    }
    // Bail early if we've already seen all pages: total may be small.
    if (data?.total && p * limit >= data.total) break;
  }
  return null; // not found within the search window
};


  const [sidebarOpen, setSidebarOpen] = useState(() => {
    return localStorage.getItem("sidebarOpen") === "true"; // Restore from localStorage
  });
  


  useEffect(() => {
    localStorage.setItem("sidebarOpen", sidebarOpen); // Save state change
  }, [sidebarOpen]);

  // ESC closes the sidebar — better than dragging the user back to the
  // chevron button when they want to refocus on the globe.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") setSidebarOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);



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

  // Use module-shared geometry + material (one of 5 flyweights keyed
  // by orbit type). This is the cheap perf win: the previous code
  // allocated a fresh SphereGeometry + MeshBasicMaterial per satellite
  // — 500× duplicate GPU buffers and material programs per page.
  const mesh = new THREE.Mesh(SAT_GEOMETRY, materialForOrbit(satellite.orbit_type));
  mesh.position.copy(initialPos);
  // Modest random rotation per sat so the cube/panels read with
  // varying orientation — feels more alive than uniform alignment.
  mesh.rotation.set(
    Math.random() * Math.PI,
    Math.random() * Math.PI,
    Math.random() * Math.PI
  );
  mesh.userData = satellite;

  satelliteObjectsRef.current[satellite.norad_number] = mesh;
  scene.add(mesh);
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

  // Cap retry: previously this looped forever if the satellite was never
  // loaded into the scene (e.g. user changed filter mid-focus). 20 attempts
  // = 10s ceiling, then we silently give up.
  let attempts = 0;
  const MAX_ATTEMPTS = 20;
  const checkModelLoaded = () => {
      const satModel = satelliteObjectsRef.current[sat.norad_number];

      if (!satModel || !satModel.position) {
          if (++attempts >= MAX_ATTEMPTS) {
              console.warn(`focusOnSatellite: gave up on ${sat.name} after ${MAX_ATTEMPTS} attempts`);
              return;
          }
          setTimeout(checkModelLoaded, 500);
          return;
      }

      resetMarker(); // ✅ Remove existing marker before adding a new one

      if (selectedPointerRef.current?.userData?.followingSatellite === sat.norad_number) {
          console.log("✅ Marker already exists for this satellite, skipping...");
          return; // ❌ Prevent duplicate marker
      }

      const marker = makePulseMarker();
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

  // Single-active-filter model: clicking the same filter (or its chip ✕) clears
  // it; clicking a different one swaps. Empty `nextFilters` means "show the
  // unfiltered catalog".
  const isAlreadyActive = activeFilters.includes(filterType);
  const nextFilters = isAlreadyActive ? [] : [filterType];

  setActiveFilters(nextFilters);
  setPage(1);
  setLoading(true);

  try {
      resetMarker();
      await removeAllSatelliteModels();
      await removeAllOrbitPaths();

      setSatellites([]);
      setFilteredSatellites([]);

      await new Promise((resolve) => setTimeout(resolve, 2000));
      await fetchAndUpdateSatellites(nextFilters, 1);
  } catch (error) {
      console.error("❌ Error applying filter:", error);
  } finally {
      setTimeout(() => setLoading(false), 2500);
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
    // Scene can be null briefly: is3DEnabled flips before sceneRef is wired up
    // on first mount, and StrictMode unmount nulls the ref between cleanup
    // and remount.
    if (!sceneRef.current) return;

    // NOTE: geometry + material come from the shared module flyweights now
    // (`SAT_GEOMETRY` and `SAT_MATERIALS` in lib/satelliteGeometry.js).
    // Disposing them here would break every subsequent satellite render —
    // we only remove the mesh from the scene and drop the ref entry.
    Object.keys(satelliteObjectsRef.current).forEach((norad_number) => {
      const satModel = satelliteObjectsRef.current[norad_number];
      if (satModel && sceneRef.current) {
        sceneRef.current.remove(satModel);
        delete satelliteObjectsRef.current[norad_number];
      }
    });
    satelliteObjectsRef.current = {};
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
          if (!sceneRef.current) return; // unmounted between timeouts
          console.log("🛰️ Adding new orbit paths...");
          addOrbitPaths();
      }, 300);
  }, 500);
};



  

useEffect(() => {
  if (!is3DEnabled) return;
  if (!satellites.length) {
      console.warn("⚠️ No satellites to load, waiting for fetch...");
      return;
  }
  // is3DEnabled flips before the scene-init effect finishes wiring up sceneRef
  // on first mount; this guard prevents a TypeError that previously cascaded
  // into a re-render storm and visible flicker.
  if (!sceneRef.current) return;

  console.log(`🚀 Updating scene for ${satellites.length} satellites...`);

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
  }, 500); // ⏳ Small delay ensures everything is loaded before orbits are drawn
}, [satellites, is3DEnabled]);

  




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

    // Atmosphere — Fresnel rim-glow shader. Replaces the old flat blue
    // back-side sphere with a teal halo that brightens at the silhouette.
    const atmosphere = new THREE.Mesh(
      new THREE.SphereGeometry(6500, 48, 48),
      makeAtmosphereMaterial(0x5eead4)
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
          // Pulsing "lock-on" scale — 1.0 → 1.35 over ~1.6s. Uses time so
          // multiple selections in a row stay phase-aligned.
          const pulse = 1 + 0.18 * Math.sin(time * 4);
          selectedPointerRef.current.scale.setScalar(pulse);
          if (selectedPointerRef.current.material) {
            selectedPointerRef.current.material.opacity = 0.55 + 0.25 * Math.sin(time * 4);
          }
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




// Filter the loaded page by the typed search query (client-side).
const _baseList = (filteredSatellites.length > 0 ? filteredSatellites : satellites).filter((sat) =>
  sat.name.toLowerCase().includes(searchQuery.toLowerCase())
);

// Pin the explicitly-picked satellite to the top of the list so it's always
// visible regardless of the active filter / current page. Without this, picking
// a satellite that doesn't match the active filter (e.g. picking 1972's
// ANIK A1 while "Recent Launches" is active) made the satellite vanish from
// the list while still being focused on the globe — the user lost context.
const displayedSatellites =
  selectedSatellite &&
  !_baseList.some((s) => s.norad_number === selectedSatellite.norad_number)
    ? [selectedSatellite, ..._baseList]
    : _baseList;

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
      setHighlightedIdx(-1);
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

// Shared post-pick logic. Picking a satellite via search switches the
// scene into a single-satellite focus mode: clear all currently-rendered
// satellite meshes + orbit paths, load only the picked satellite's mesh
// and orbit, then place the focus marker on it. The list pin (in
// `displayedSatellites`) keeps the picked sat visible at the top of the
// sidebar regardless of active filter / page state. To return to the
// fleet view, the user changes filter / clicks Reset / changes page —
// each of which already triggers `fetchAndUpdateSatellites`.
const revealPickedSatellite = (sat) => {
  if (!is3DEnabled || !sceneRef.current) return;

  // 1) Clean the scene so old satellites + their orbit lines disappear.
  resetMarker();
  removeAllSatelliteModels();
  removeAllOrbitPaths();

  // 2) Add only the picked satellite + its orbit.
  loadSatelliteModel(sat);
  // Orbit lines are wired up by `addOrbitPaths()` reading the current
  // `satelliteObjectsRef`. Give the model a tick to register, then draw.
  setTimeout(() => {
    if (sceneRef.current) addOrbitPaths();
  }, 250);

  // 3) Selection state + camera focus. focusOnSatellite has its own
  // retry-until-model-loaded loop, so calling it before the model is
  // mounted is safe.
  setSelectedSatellite(sat);
  enableInteraction();
  focusOnSatellite(sat);
};

// ⏎ enter key search
const handleSearch = async () => {
  if (!searchQuery.trim()) return;
  try {
    // Backend route `/api/satellites/{name_or_norad}` handles numeric NORAD and
    // name lookups in one path — the old `/by_norad/...` URL never existed.
    const q = searchQuery.trim();
    const isNumeric = /^\d+$/.test(q);
    const endpoint = `${SATELLITES_API}/${isNumeric ? q : encodeURIComponent(q.toLowerCase())}`;
    const r = await fetch(endpoint);
    if (!r.ok) throw new Error(r.statusText);
    const sat = await r.json();
    revealPickedSatellite(sat);
    setSuggestions([]);
  } catch (err) {
    console.error("search error:", err);
  }
};

// click dropdown suggestion
const handleSuggestionClick = async (sug) => {
  setSearchQuery(sug.name);
  setSuggestions([]);
  try {
    // See note in handleSearch — single endpoint handles numeric + name.
    const endpoint = sug.norad_number
      ? `${SATELLITES_API}/${sug.norad_number}`
      : `${SATELLITES_API}/${encodeURIComponent(sug.name.toLowerCase())}`;
    const r = await fetch(endpoint);
    if (!r.ok) throw new Error(r.statusText);
    const sat = await r.json();
    revealPickedSatellite(sat);
  } catch (err) {
    console.error("suggest click:", err);
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
            className="absolute bottom-4 left-4 w-80
                       bg-gray-900/90 backdrop-blur-md text-teal-300 p-4 shadow-xl text-xs
                       border border-gray-700 rounded-lg z-[50]
                       transition-all duration-300 ease-in-out"
            style={{ maxHeight: "180px", overflowY: "auto" }}
          >
            {!selectedSatellite ? (
              <div className="flex flex-col items-center justify-center h-full text-teal-300 font-semibold text-center p-3">
                <SatelliteIcon size={28} className="text-teal-300" />
                <p className="mt-2">Select a satellite</p>
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

      </div>

      {/* Closed-sidebar pull-tab. Reads as the *handle* of the slid-out
          catalog drawer rather than a floating chip — anchored flush to
          the right edge of the viewport, vertically centered, with the
          label + count rotated 90° so the strip is narrow but readable.
          Hides on mobile (where the drawer comes in from the bottom).
          Hidden visually but kept in DOM when sidebar is open so layout
          / animation stays stable. */}
      <button
        data-testid="sat-sidebar-launcher"
        onClick={() => setSidebarOpen(true)}
        aria-label="Open satellite catalog"
        aria-hidden={sidebarOpen}
        tabIndex={sidebarOpen ? -1 : 0}
        className={`hidden md:flex absolute z-[100] top-1/2 -translate-y-1/2 right-0
                    flex-col items-center gap-2 py-5 px-2
                    bg-gray-950/55 backdrop-blur-md
                    border border-r-0 border-teal-400/25
                    rounded-l-xl text-teal-100
                    shadow-[0_0_24px_-6px_rgba(94,234,212,0.35),inset_1px_0_0_rgba(94,234,212,0.18)]
                    hover:bg-gray-900/70 hover:border-teal-400/55 hover:pr-3
                    transition-all duration-300
                    ${sidebarOpen ? "opacity-0 pointer-events-none translate-x-full" : "opacity-100 translate-x-0"}`}
      >
        <SatelliteIcon size={18} className="text-teal-300" />
        <span
          className="text-[10px] font-mono uppercase tracking-[0.3em] text-teal-100"
          style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}
        >
          Catalog
        </span>
        {total > 0 ? (
          <span className="text-[10px] font-mono text-gray-300 bg-gray-800/80 border border-gray-700/60 rounded-full px-1.5 py-0.5">
            {total.toLocaleString()}
          </span>
        ) : null}
        <ChevronLeft size={14} className="text-teal-300/80" />
      </button>

      {/* Mobile launcher — small bottom-edge handle since the drawer
          slides up from the bottom on small screens. */}
      <button
        onClick={() => setSidebarOpen(true)}
        aria-label="Open satellite catalog"
        aria-hidden={sidebarOpen}
        tabIndex={sidebarOpen ? -1 : 0}
        className={`md:hidden fixed z-[100] bottom-4 left-1/2 -translate-x-1/2
                    inline-flex items-center gap-2 px-4 py-2 rounded-full
                    bg-gray-950/70 backdrop-blur-md border border-teal-400/30
                    text-teal-100 text-xs font-medium
                    shadow-[0_8px_24px_-6px_rgba(94,234,212,0.4)]
                    ${sidebarOpen ? "opacity-0 pointer-events-none translate-y-4" : "opacity-100 translate-y-0"}
                    transition-all duration-300`}
      >
        <SatelliteIcon size={14} className="text-teal-300" />
        Catalog
        {total > 0 ? (
          <span className="text-[10px] font-mono text-gray-300 bg-gray-800/80 border border-gray-700/60 rounded-full px-1.5">
            {total.toLocaleString()}
          </span>
        ) : null}
      </button>

      {/* RIGHT-SIDE PANEL — slide-in glass drawer. Lower opacity + heavier
          backdrop-blur than before so it feels like a pane of glass over
          the globe rather than a bolted-on rail. Slides off-screen when
          closed (translate-x), with a bottom-sheet variant on mobile. */}
      <div
        data-testid="sat-sidebar"
        aria-hidden={!sidebarOpen}
        className={`
          absolute z-[99] flex flex-col
          bg-gray-950/55 backdrop-blur-2xl border border-gray-700/40
          shadow-[inset_1px_0_0_rgba(94,234,212,0.18),0_20px_60px_rgba(0,0,0,0.5)]
          transition-transform duration-300 ease-out
          /* mobile: bottom-sheet */
          bottom-0 left-0 right-0 h-[68vh] rounded-t-2xl
          /* md+: right rail */
          md:top-0 md:bottom-auto md:left-auto md:right-0 md:h-screen md:rounded-none
          ${isExpanded ? "md:w-full" : "md:w-[28rem] md:max-w-[36vw] md:min-w-[320px]"}
          ${sidebarOpen
            ? "translate-x-0 translate-y-0"
            : "translate-y-full md:translate-y-0 md:translate-x-full"}
        `}
      >
        {/* HEADER */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700/60">
          <div className="flex items-center gap-2">
            <SatelliteIcon size={18} className="text-teal-300" />
            <h3 className="text-sm font-semibold text-white tracking-wide">
              Catalog
            </h3>
            {total > 0 && (
              <span className="text-[10px] font-medium text-gray-400 bg-gray-800/80 border border-gray-700 rounded-full px-2 py-0.5">
                {total.toLocaleString()}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={toggleExpanded}
              aria-label={isExpanded ? "Collapse panel" : "Expand panel"}
              title={isExpanded ? "Collapse panel" : "Expand panel"}
              className="p-1.5 text-gray-300 rounded-md
                         hover:bg-gray-800 hover:text-white transition-colors"
            >
              {isExpanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            </button>
            <button
              onClick={() => setSidebarOpen(false)}
              aria-label="Close panel"
              title="Close panel (ESC)"
              className="p-1.5 text-gray-300 rounded-md
                         hover:bg-gray-800 hover:text-white transition-colors"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* SEARCH + ACTIVE FILTER */}
        <div className="px-4 py-3 space-y-2 border-b border-gray-700/60">
          {/* Active filter chip — single filter at a time per toggleFilter contract */}
          {activeFilters.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-[10px] uppercase tracking-wider text-gray-500">Filter</span>
              {activeFilters.map((filter) => (
                <span
                  key={filter}
                  data-testid="active-filter-chip"
                  className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px]
                             bg-teal-500/15 text-teal-200 border border-teal-500/40
                             rounded-full"
                >
                  <span className="max-w-[12rem] truncate">{filter}</span>
                  <button
                    onClick={() => toggleFilter(filter)}
                    aria-label={`Remove filter ${filter}`}
                    className="hover:text-white"
                  >
                    <X size={12} />
                  </button>
                </span>
              ))}
            </div>
          )}

          <div className="relative">
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
              <Search size={16} />
            </span>
            <input
              ref={inputRef}
              type="text"
              placeholder="Search by name or NORAD…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              role="combobox"
              aria-expanded={suggestions.length > 0}
              aria-controls="search-suggestions"
              aria-autocomplete="list"
              aria-activedescendant={
                highlightedIdx >= 0 ? `sugg-${suggestions[highlightedIdx]?.norad_number}` : undefined
              }
              onKeyDown={(e) => {
                // Keyboard nav for the suggestion list. Without this, pressing
                // Enter while suggestions are visible falls through to
                // handleSearch which does a name-lookup against the literal
                // query — useless when the user can see a list of matches.
                if (e.key === "ArrowDown") {
                  if (suggestions.length === 0) return;
                  e.preventDefault();
                  setHighlightedIdx((i) => (i + 1) % suggestions.length);
                } else if (e.key === "ArrowUp") {
                  if (suggestions.length === 0) return;
                  e.preventDefault();
                  setHighlightedIdx((i) =>
                    i <= 0 ? suggestions.length - 1 : i - 1
                  );
                } else if (e.key === "Enter") {
                  e.preventDefault();
                  if (suggestions.length > 0) {
                    // Pick the highlighted row, or fall back to the top match.
                    const pick = suggestions[Math.max(0, highlightedIdx)];
                    if (pick) {
                      handleSuggestionClick(pick);
                      return;
                    }
                  }
                  handleSearch();
                } else if (e.key === "Escape") {
                  setSuggestions([]);
                  setHighlightedIdx(-1);
                }
              }}
              className="w-full pl-9 pr-9 py-2 text-sm text-white bg-gray-800/80
                         placeholder:text-gray-500 rounded-lg
                         focus:outline-none focus:ring-2 focus:ring-teal-400/60
                         border border-gray-700"
            />
            {searchQuery && (
              <button
                onClick={() => {
                  setSearchQuery("");
                  setSuggestions([]);
                  setHighlightedIdx(-1);
                }}
                aria-label="Clear search"
                className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5
                           text-gray-400 hover:text-white rounded
                           hover:bg-gray-700 transition-colors"
              >
                <X size={14} />
              </button>
            )}

            {suggestions.length > 0 && (
              <ul
                id="search-suggestions"
                ref={dropdownRef}
                role="listbox"
                data-testid="search-suggestions"
                className="absolute z-50 mt-1 w-full max-h-72 overflow-y-auto
                           bg-gray-900/95 backdrop-blur-md text-white
                           border border-gray-700 rounded-lg shadow-2xl
                           divide-y divide-gray-800/60"
              >
                {suggestions.map((sat, idx) => {
                  const isHighlighted = idx === highlightedIdx;
                  return (
                    <li
                      key={sat.norad_number}
                      id={`sugg-${sat.norad_number}`}
                      role="option"
                      aria-selected={isHighlighted}
                      onMouseEnter={() => setHighlightedIdx(idx)}
                      onClick={() => handleSuggestionClick(sat)}
                      className={`px-3 py-2 cursor-pointer text-sm
                                  flex items-center gap-2
                                  transition-colors
                                  ${
                                    isHighlighted
                                      ? "bg-teal-500/20 text-teal-50"
                                      : "hover:bg-gray-800"
                                  }`}
                    >
                      <SatelliteIcon
                        size={14}
                        className={`shrink-0 ${isHighlighted ? "text-teal-300" : "text-gray-500"}`}
                      />
                      <span className="flex-1 min-w-0 truncate">
                        {highlightMatch(sat.name, searchQuery)}
                      </span>
                      <span className="text-[10px] font-mono text-gray-400 shrink-0">
                        #{sat.norad_number}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        {/* SATELLITE LIST — flex-1 so it always takes the remaining vertical space */}
        <div className="flex-1 overflow-y-auto px-3 py-2 scrollbar-hide">
          {loading ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-300">
              <div className="w-10 h-10 border-4 border-gray-700 border-t-teal-400 rounded-full animate-spin" />
              <p className="mt-3 text-xs tracking-wide text-gray-400">
                Fetching satellites…
              </p>
            </div>
          ) : displayedSatellites.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center px-6">
              <SatelliteIcon size={32} className="text-gray-600" />
              <p className="mt-3 text-sm text-gray-400">No satellites match the current filter.</p>
            </div>
          ) : (
            <ul className="space-y-2">
              {displayedSatellites.map((sat) => {
                const isSelected = selectedSatellite?.norad_number === sat.norad_number;
                return (
                  <li
                    key={sat.norad_number}
                    data-testid="satellite-card"
                    onClick={() => {
                      focusOnSatellite(sat);
                      enableInteraction();
                    }}
                    className={`group cursor-pointer rounded-lg border px-3 py-2
                                transition-all duration-200
                                ${
                                  isSelected
                                    ? "bg-teal-500/20 border-teal-400/60 shadow-[0_0_0_1px_rgba(94,234,212,0.3)]"
                                    : "bg-gray-800/60 border-gray-700/60 hover:bg-gray-700/60 hover:border-gray-600"
                                }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-lg shrink-0">{getCountryFlag(sat.country)}</span>
                      <div className="flex-1 min-w-0">
                        <div className={`text-sm font-medium truncate ${isSelected ? "text-teal-100" : "text-gray-100"}`}>
                          {sat.name}
                        </div>
                        <div className="text-[11px] text-gray-400 flex items-center gap-2">
                          <span className="font-mono">#{sat.norad_number}</span>
                          {sat.launch_date && (
                            <span className="truncate">
                              · {new Date(sat.launch_date).toLocaleDateString()}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* PAGINATION */}
        <div className="flex items-center justify-between px-4 py-2 border-t border-gray-700/60">
          <span className="text-[11px] text-gray-400">
            Page <span className="text-gray-200 font-medium">{page}</span>
            {" / "}
            {Math.max(1, Math.ceil(total / limit))}
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => changePage(1)}
              disabled={page === 1 || loading}
              aria-label="First page"
              className="p-1.5 rounded-md text-gray-300 hover:bg-gray-800 hover:text-white
                         disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronsLeft size={16} />
            </button>
            <button
              onClick={() => changePage(page - 1)}
              disabled={page === 1 || loading}
              aria-label="Previous page"
              className="p-1.5 rounded-md text-gray-300 hover:bg-gray-800 hover:text-white
                         disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft size={16} />
            </button>
            <button
              onClick={() => changePage(page + 1)}
              disabled={loading || page * limit >= total}
              aria-label="Next page"
              className="p-1.5 rounded-md text-gray-300 hover:bg-gray-800 hover:text-white
                         disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight size={16} />
            </button>
            <button
              onClick={() => changePage(Math.ceil(total / limit))}
              disabled={page === Math.ceil(total / limit) || loading}
              aria-label="Last page"
              className="p-1.5 rounded-md text-gray-300 hover:bg-gray-800 hover:text-white
                         disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronsRight size={16} />
            </button>
          </div>
        </div>

        {/* FILTERS DRAWER — collapsible. Drawer body uses its own scroll. */}
        <div className="border-t border-gray-700/60 shrink-0">
          <button
            onClick={() => setIsFiltersOpen((v) => !v)}
            aria-expanded={isFiltersOpen}
            aria-controls="filters-drawer"
            className="w-full flex items-center justify-between px-4 py-2
                       text-sm text-gray-200 hover:bg-gray-800/60 transition-colors"
          >
            <span className="flex items-center gap-2">
              <SlidersHorizontal size={14} className="text-teal-300" />
              <span className="font-medium">Filters</span>
              {activeFilters.length > 0 && (
                <span className="w-1.5 h-1.5 rounded-full bg-teal-400" />
              )}
            </span>
            <ChevronDown
              size={16}
              className={`transition-transform duration-200 ${isFiltersOpen ? "rotate-180" : ""}`}
            />
          </button>

          {isFiltersOpen && (
            <div
              id="filters-drawer"
              className="px-3 pb-3 pt-1 space-y-3 max-h-[42vh] overflow-y-auto scrollbar-hide"
              style={{ touchAction: "none", overscrollBehavior: "contain" }}
            >
              {/* AI search — natural language → structured filter */}
              <section>
                <h4 className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-1.5 px-1">
                  Ask the catalog
                </h4>
                <NLSearchBar onSelectSatellite={(sat) => focusOnSatellite(sat)} />
              </section>

              {/* Categories */}
              <section>
                <h4 className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-1.5 px-1">
                  Categories
                </h4>
                <div className="grid grid-cols-2 gap-1.5">
                  {Object.entries(categories).flatMap(([_, filters]) =>
                    filters.map((filter) => {
                      const isActive = activeFilters.includes(filter.name);
                      return (
                        <button
                          key={filter.name}
                          onClick={() => toggleFilter(filter.name)}
                          className={`text-[11px] font-medium px-2 py-1.5 rounded-md
                                      border transition-colors text-left
                                      ${
                                        isActive
                                          ? "bg-teal-500/20 border-teal-400/60 text-teal-100"
                                          : "bg-gray-800/60 border-gray-700/60 text-gray-300 hover:bg-gray-700/60 hover:text-white"
                                      }`}
                        >
                          {filter.label}
                        </button>
                      );
                    })
                  )}
                </div>
              </section>

              <div className="grid grid-cols-2 gap-3">
                {/* Launch Year */}
                <section className="flex flex-col">
                  <h4 className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-1.5 px-1">
                    Launch Year
                  </h4>
                  <div
                    className="h-32 overflow-y-auto bg-gray-800/40 border border-gray-700/60 rounded-md p-1.5 scrollbar-hide"
                    style={{ touchAction: "none", overscrollBehavior: "contain" }}
                  >
                    {Array.from({ length: 30 }, (_, i) => 2025 - i).map((year) => {
                      const filterKey = `Launch Year:${year}`;
                      const isActive = activeFilters.includes(filterKey);
                      return (
                        <button
                          key={year}
                          onClick={() => toggleFilter(filterKey)}
                          className={`w-full text-[11px] font-medium rounded py-0.5 mb-0.5
                                      transition-colors
                                      ${
                                        isActive
                                          ? "bg-teal-500/20 text-teal-100"
                                          : "text-gray-300 hover:bg-gray-700/60 hover:text-white"
                                      }`}
                        >
                          {year}
                        </button>
                      );
                    })}
                  </div>
                </section>

                {/* Country */}
                <section className="flex flex-col">
                  <h4 className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-1.5 px-1">
                    Country
                  </h4>
                  <div
                    className="h-32 overflow-y-auto bg-gray-800/40 border border-gray-700/60 rounded-md p-1.5 scrollbar-hide"
                    style={{ touchAction: "none", overscrollBehavior: "contain" }}
                  >
                    {Object.entries(countryMapping)
                      .slice(0, 20)
                      .map(([code, { name, flag }]) => {
                        const filterKey = `Country:${code}`;
                        const isActive = activeFilters.includes(filterKey);
                        return (
                          <button
                            key={code}
                            onClick={() => toggleFilter(filterKey)}
                            className={`w-full flex items-center gap-1.5 text-[11px] font-medium
                                        rounded py-0.5 px-1 mb-0.5 transition-colors
                                        ${
                                          isActive
                                            ? "bg-teal-500/20 text-teal-100"
                                            : "text-gray-300 hover:bg-gray-700/60 hover:text-white"
                                        }`}
                          >
                            <span className="text-base">{flag}</span>
                            <span className="truncate">{name}</span>
                          </button>
                        );
                      })}
                  </div>
                </section>
              </div>

              <button
                onClick={resetFilters}
                className="w-full flex items-center justify-center gap-1.5
                           px-3 py-1.5 text-xs font-medium
                           bg-gray-800/80 hover:bg-gray-700 text-gray-200
                           border border-gray-700 rounded-md transition-colors"
              >
                <RotateCcw size={12} />
                Reset filters
              </button>
            </div>
          )}
        </div>
      </div>
    </div>

{/* Daily AI digest — pull-tab card */}
<div className="max-w-screen-2xl mx-auto w-full px-6 sm:px-12 lg:px-20 pt-8">
  <DailyDigestCard />
</div>

 {/* Infographics Section */}
<Infographics
  satellitesForCharts={satellitesForCharts}
  loading={chartLoading}
  error={chartError}
/>

{/* ---------------------------------------------------------------
    "What it does" section — modern feature cards.
    Chrome matches the new sidebar (bg-gray-900/85 + backdrop-blur).
    Three feature cards, then a full-width sources/stack card.
    --------------------------------------------------------------- */}
<div className="max-w-screen-2xl mx-auto w-full px-6 sm:px-12 lg:px-20 py-16 z-10">
  {/* Eyebrow + heading — eyebrow ties this section to the rest of the
      Lucide-iconed visual language, and the static H2 won't compete with
      the hero typewriter above. */}
  <div className="text-center mb-12">
    <div className="text-[10px] font-mono uppercase tracking-[0.3em] text-teal-300/80 mb-3">
      What it does
    </div>
    <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold text-white">
      Three things, no marketing fluff
    </h2>
    <p className="mt-3 text-gray-400 text-base sm:text-lg max-w-2xl mx-auto">
      Powered by real public data from Space-Track, NOAA, and SpaceLaunchNow.
    </p>
  </div>

  {/* Feature grid — three cards. Each card has a tinted icon medallion,
      a numeric eyebrow, a concise headline, and the evidence paragraph. */}
  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
    {[
      {
        n: "01",
        eyebrow: "Real-time",
        Icon: Zap,
        title: "Live SGP4 propagation",
        body: (
          <>
            30,000+ active satellites tracked using <em className="text-gray-100 not-italic font-medium">SGP4</em> against
            TLE data refreshed every 15 minutes from Space-Track. Every dot
            on the globe is propagated client-side via{" "}
            <code className="inline-flex items-center px-1.5 py-0.5 rounded bg-gray-800/80 border border-gray-700/60 text-teal-200 text-xs font-mono">satellite.js</code>,
            so the positions you see are computed for this exact moment.
          </>
        ),
      },
      {
        n: "02",
        eyebrow: "Collision risk",
        Icon: AlertTriangle,
        title: "Conjunction monitoring",
        body: (
          <>
            Public Conjunction Data Messages (CDMs) from Space-Track surface
            upcoming close approaches: time of closest approach, miss
            distance, and collision probability. The Tracking page shows the
            live feed and ties each CDM back to the two NORAD objects
            involved.
          </>
        ),
      },
      {
        n: "03",
        eyebrow: "History",
        Icon: TrendingUp,
        title: "Historical orbit analysis",
        body: (
          <>
            Every NORAD has a stored TLE history. Click any satellite to see
            altitude, velocity, and B* drag-term over time, charted from the
            archival TLE data — useful for spotting orbit decay or maneuvers.
          </>
        ),
      },
    ].map(({ n, eyebrow, Icon, title, body }) => (
      <div
        key={n}
        className="group p-6 flex flex-col
                   bg-gray-900/85 backdrop-blur-xl border border-gray-700/60
                   rounded-xl
                   hover:border-teal-400/50 hover:ring-1 hover:ring-teal-400/20
                   transition-colors"
      >
        <div className="flex items-center justify-between mb-4">
          <span
            className="inline-flex items-center justify-center w-9 h-9 rounded-lg
                       bg-teal-500/15 border border-teal-500/30 text-teal-300"
          >
            <Icon size={18} />
          </span>
          <span className="text-[10px] font-mono uppercase tracking-[0.25em] text-gray-500">
            {n} · {eyebrow}
          </span>
        </div>
        <h3 className="text-xl font-semibold text-white mb-2">{title}</h3>
        <p className="text-gray-300 leading-relaxed text-sm">{body}</p>
      </div>
    ))}

    {/* Full-width sources + stack card. */}
    <div
      className="lg:col-span-3 p-6
                 bg-gray-900/70 backdrop-blur-xl border border-gray-700/50
                 rounded-xl"
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div>
          <div className="text-[10px] font-mono uppercase tracking-[0.25em] text-teal-300/80 mb-3">
            Data sources
          </div>
          <ul className="text-gray-300 space-y-2 text-sm">
            <li>
              <a
                href="https://www.space-track.org"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-teal-300 hover:text-teal-200"
              >
                Space-Track
                <ExternalLink size={12} className="opacity-60" />
              </a>
              <span className="text-gray-500"> — TLEs + CDMs</span>
            </li>
            <li>
              <a
                href="https://www.swpc.noaa.gov"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-teal-300 hover:text-teal-200"
              >
                NOAA SWPC
                <ExternalLink size={12} className="opacity-60" />
              </a>
              <span className="text-gray-500"> — F10.7, Kp, solar wind</span>
            </li>
            <li>
              <a
                href="https://thespacedevs.com/llapi"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-teal-300 hover:text-teal-200"
              >
                SpaceLaunchNow
                <ExternalLink size={12} className="opacity-60" />
              </a>
              <span className="text-gray-500"> — upcoming + past launches</span>
            </li>
          </ul>
        </div>
        <div>
          <div className="text-[10px] font-mono uppercase tracking-[0.25em] text-teal-300/80 mb-3">
            How it's built
          </div>
          <ul className="text-gray-300 space-y-2 text-sm">
            <li className="text-gray-400">React + Vite + Three.js (WebGL renderer)</li>
            <li className="text-gray-400">FastAPI + Postgres + SGP4/Skyfield on Railway</li>
            <li>
              <a
                href="https://github.com/mannyzzle/Satellite-Interactive-Visualizer-And-Fleet-Optimization"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-teal-300 hover:text-teal-200"
              >
                Source on GitHub
                <ExternalLink size={12} className="opacity-60" />
              </a>
            </li>
          </ul>
        </div>
      </div>
    </div>
  </div>
</div>
</div>
);}