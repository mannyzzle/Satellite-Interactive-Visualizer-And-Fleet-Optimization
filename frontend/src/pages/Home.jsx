// src/pages/Home.jsx

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import Navbar from "../components/Navbar";  // ✅ Ensure correct path
import { useCallback } from "react";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";
import { fetchSatellites } from "../api/satelliteService";
import Infographics from "../components/Infographics"; // Ensure correct path
import { twoline2satrec, propagate, gstime, eciToGeodetic, degreesLong, degreesLat } from "satellite.js";

const basePath = import.meta.env.BASE_URL;  // ✅ Dynamically fetch the base URL
const dayTexture = `${basePath}earth_day.jpg`;
const nightTexture = `${basePath}earth_night.jpg`;
const cloudTexture = `${basePath}clouds.png`;
 

export default function Home() {
  const globeRef = useRef(null);
  const cloudRef = useRef(null);
  const atmosphereRef = useRef(null);
  const sunRef = useRef(null);
  const moonRef = useRef(null);
  let isFetching = false;  // Prevent duplicate fetch calls
  const [is3DEnabled, setIs3DEnabled] = useState(false);



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


  const [sidebarOpen, setSidebarOpen] = useState(() => {
    return localStorage.getItem("sidebarOpen") === "true"; // Restore from localStorage
  });
  


  useEffect(() => {
    localStorage.setItem("sidebarOpen", sidebarOpen); // Save state change
  }, [sidebarOpen]);



  

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
      "Space Debris": 0xFF0000,  // 🔴 Bright Red
      "Rocket Body (Debris)": 0xFF0000,  // 🔴 Bright Red
      "Unknown": 0xFF0000,  // 🔴 Bright Red
      "Unknown Payload": 0xFF0000
  
    };
  
    const orbitColor = purposeColors[satellite.purpose] || 0x00FFFF; // Default Light Blue for unclassified
  
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
  


  function createMoon(scene) {

    const moonGeometry = new THREE.SphereGeometry(15.27, 32, 32); // 🌙 Size ~1/4th of Earth
    const moonMaterial = new THREE.MeshStandardMaterial({
      map: moonTexture,
      bumpMap: moonTexture,  // Surface roughness
      bumpScale: 0.2,
    });
  
    const moon = new THREE.Mesh(moonGeometry, moonMaterial);
    
    // 🚀 Position it at a realistic scale (but scaled down for visualization)
    moon.position.set(0, 0, 0);  // ~384,400 km in real scale, scaled down
  
    // ✅ Store in ref for animation
    moonRef.current = moon;
    scene.add(moon);

    console.log("✅ Moon added!");
  }

  // 🔄 Animate Moon's Orbit
function animateMoon() {
  if (moonRef.current) {
    const time = Date.now() / 1000;
    const moonOrbitRadius = 300; // Adjusted for visualization
    const moonSpeed = 0.001; // Adjust speed to match real orbit

    // 🌙 Compute circular orbit
    moonRef.current.position.x = Math.cos(time * moonSpeed) * moonOrbitRadius;
    moonRef.current.position.z = Math.sin(time * moonSpeed) * moonOrbitRadius;
  }

  // 🌙 Make the Moon face Earth
  moonRef.current.lookAt(new THREE.Vector3(0, 0, 0));

  requestAnimationFrame(animateMoon);
}





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
  const sphereMaterial = new THREE.MeshBasicMaterial({ color: sphereColor, emissive: sphereColor, emissiveIntensity: 0.8 });
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
  window.scrollTo({ top: 0, behavior: "smooth" });

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

useEffect(() => {
  if (!is3DEnabled || !mountRef.current) return; // ✅ Only run if 3D is enabled

  console.log("🚀 Initializing 3D Scene...");

  const scene = new THREE.Scene();
  sceneRef.current = scene;

  // ✅ Adjust the Initial Camera Position Dynamically
  const initialAltitude = 50000; // LEO default
  const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.5, 900000);
  camera.position.set(0, 5, initialAltitude);
  cameraRef.current = camera;

  // ✅ Optimize Renderer
  const renderer = new THREE.WebGLRenderer({ antialias: true, precision: "highp" });
  renderer.setSize(mountRef.current.clientWidth, mountRef.current.clientHeight);
  renderer.setPixelRatio(window.devicePixelRatio);
  mountRef.current.appendChild(renderer.domElement);

  // ✅ Optimize Controls
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableZoom = true;
  controls.enablePan = false;
  controls.enableDamping = true;
  controls.dampingFactor = 0.1;
  controls.rotateSpeed = 0.5;

  controls.minDistance = 6230; // 🔥 Prevents too-close zoom
  controls.maxDistance = 500000; // 🚀 Allows zooming for deep-space objects

  controlsRef.current = controls;

  // ✅ Add Light Source
  const light = new THREE.DirectionalLight(0xffffff, 4.5);
  light.position.set(200, 50, 0);
  scene.add(light);



  
  // 🌍 **Create Earth**
  const globe = new THREE.Mesh(
    new THREE.SphereGeometry(6000, 64, 64),
    new THREE.MeshStandardMaterial({
      map: dayMap,
      emissiveMap: nightMap,
      emissiveIntensity: 0.1,
      emissive: new THREE.Color(0xffffff), // White glow for night areas
      bumpScale: 0.5,
      roughness: 1.5,
      metalness: 0.7,
    })
  );
  globeRef.current = globe;
  scene.add(globe);


  // ☁️ **Cloud Layer**
  const cloudMesh = new THREE.Mesh(
    new THREE.SphereGeometry(6050.6, 906, 906),
    new THREE.MeshStandardMaterial({
      map: clouds,
      transparent: true,
      opacity: 0.8,
      depthWrite: false,
      side: THREE.DoubleSide,
    })
  );
  cloudRef.current = cloudMesh;
  scene.add(cloudMesh);



  // 🔄 **Handle Window Resize**
  const resizeRenderer = () => {
    if (!mountRef.current) return;

    const width = mountRef.current.clientWidth;
    const height = mountRef.current.clientHeight;

    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
  };

  window.addEventListener("resize", resizeRenderer);

  // 🌫 **Atmosphere Glow**
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







  

  // 🌞 **Create Sun**
  const sun = new THREE.Mesh(
    new THREE.SphereGeometry(20, 4, 4),
    new THREE.MeshStandardMaterial({
      map: sunTexture,
      emissive: 0xffffe0,
      emissiveIntensity: 2,
      emissiveMap: sunTexture,
    })
  );
  sun.position.set(5000, 50, 0);
  sunRef.current = sun;
  //scene.add(sun);

 

  // 🌌 **Create Larger Star Field**
const starGeometry = new THREE.BufferGeometry();
const starVertices = [];

// ✅ Increase star count and expand volume
const starCount = 200000;  // More stars
const starFieldSize = 3000000; // Increase field size

for (let i = 0; i < starCount; i++) {
  starVertices.push(
    (Math.random() - 0.5) * starFieldSize,  // Spread over larger area
    (Math.random() - 0.5) * starFieldSize,
    (Math.random() - 0.5) * starFieldSize
  );
}

starGeometry.setAttribute("position", new THREE.Float32BufferAttribute(starVertices, 3));

// ✅ Adjust Material to Improve Appearance
const starMaterial = new THREE.PointsMaterial({
  color: 0xffffff,
  size: 0.03,  // Slightly larger stars
  transparent: true,
  opacity: 0.8,
  depthWrite: false
});

const stars = new THREE.Points(starGeometry, starMaterial);
scene.add(stars);








  
  // ✅ ADD THE MOON HERE
  //createMoon(scene, globe); 

  // ✅ Start Moon Orbit Animation
  //animateMoon();


  // 🔄 **Animation Loop**
  const animate = () => {
    
    requestAnimationFrame(animate);

    if (globeRef.current) globeRef.current.rotation.y += 0.00000727;
    if (cloudRef.current) cloudRef.current.rotation.y += 0.00009;

    const time = Date.now() / 1000;
    const timeFactor = 1;

    // 🛰️ Force all satellites to recalculate position
  Object.values(satelliteObjectsRef.current).forEach((satelliteModel) => {
    if (satelliteModel.userData) {
      const newPos = computeSatellitePosition(satelliteModel.userData, time * timeFactor);
      if (newPos) {
        satelliteModel.position.lerp(newPos, 0.1); // 🔄 Smooth movement
      } else {
        console.warn(`⚠️ Satellite ${satelliteModel.userData.norad_number} has no new position!`);
      }
    }
  });

  

    if (selectedPointerRef.current && selectedPointerRef.current.userData.followingSatellite) {
      const followedSat = satelliteObjectsRef.current[selectedPointerRef.current.userData.followingSatellite];
      if (followedSat) {
        selectedPointerRef.current.position.copy(followedSat.position);
        selectedPointerRef.current.lookAt(new THREE.Vector3(0, 0, 0));
      }
    }

    controls.update();
    renderer.render(scene, camera);
  };

  animate();

  
  return () => {
    window.removeEventListener("resize", resizeRenderer);
    
    // ✅ Ensure mountRef.current exists before calling .contains()
    if (mountRef.current && mountRef.current.contains(renderer.domElement)) {
      mountRef.current.removeChild(renderer.domElement);
    }
  };  
}, [is3DEnabled]); // ✅ Runs only once!


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


const FilterButton = ({ filter }) => (
  <button
    className={`px-4 py-2 text-xs font-semibold rounded-md transition-all duration-200 shadow-md ${
      activeFilters.includes(filter.name) ? "bg-teal-500 text-white" : "bg-gray-700 hover:bg-gray-600 text-gray-300"
    }`}
    onClick={() => toggleFilter(filter.name)}
  >
    {filter.label}
  </button>
);









return (
  <div className="flex flex-col min-h-screen w-screen overflow-hidden border-gray-950">
    {/* 📌 Navbar */}
    <Navbar />

    {/* 🌍 Main Layout: Sidebar + 3D UI */}
    <div className="relative flex flex-1">
      
      {/* 🌍 3D UI + Sidebar + Info Box (All Together) */}
      <div className="relative flex-1 flex border-[50px] border-gray-950 shadow-2xl overflow-hidden">

      {/* 📌 Sidebar (Fixed & Responsive) */}
{is3DEnabled && (
  <div
    className={`absolute top-1/2 left-0 transform -translate-y-1/2 ${
      sidebarOpen ? "translate-x-0" : "-translate-x-full"
    } w-48 sm:w-52 bg-gray-900 bg-opacity-90 backdrop-blur-md text-white p-3 shadow-xl border-r border-gray-700 rounded-r-xl transition-all duration-300 ease-in-out z-50`}
  >
    {/* 🛰️ Sidebar Header */}
    <h2 className="text-md font-bold mb-2 text-center border-b border-gray-700 pb-1">
      Satellites
    </h2>

    {/* 🔍 Search Input */}
    <input
      type="text"
      placeholder="🔍 Search..."
      value={searchQuery}
      onChange={(e) => setSearchQuery(e.target.value)}
      className="w-full p-1 text-white rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 border border-gray-600 shadow-sm text-sm"
    />

    {/* 🚀 Satellite List (Two Columns) */}
    <div className="overflow-y-auto max-h-[40vh] mt-2">
      {loading ? (
        <p className="text-center text-gray-400 text-sm">Loading...</p>
      ) : displayedSatellites.length === 0 ? (
        <p className="text-center text-yellow-400 font-semibold text-sm">
          ⚠️ No satellites found
        </p>
      ) : (
        <ul className="grid grid-cols-2 gap-1">
          {displayedSatellites.map((sat) => (
            <li
              key={sat.norad_number}
              className={`cursor-pointer p-2 rounded-md text-center border border-gray-700 shadow-sm transition-all duration-200 text-xs ${
                selectedSatellite?.norad_number === sat.norad_number
                  ? "bg-teal-500 text-white border-teal-500 shadow-md"
                  : "bg-gray-800 hover:bg-gray-700"
              }`}
              onClick={() => {
                console.log(`📡 Selecting satellite: ${sat.name} (NORAD: ${sat.norad_number})`);
                focusOnSatellite(sat);
                enableInteraction();
              }}
            >
              <span className="block w-full">
                {sat.name} {getCountryFlag(sat.country)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>

    {/* 🌍 Pagination Controls (Smaller & Compact) */}
{total > limit && (
  <div className="flex flex-col items-center mt-3 border-t border-gray-700 pt-3">
    <span className="text-xs text-gray-300 mb-1">
      Page {page} of {Math.ceil(total / limit)}
    </span>
    <div className="flex justify-between w-full space-x-1">
      <button
        onClick={() => changePage(1)}
        disabled={page === 1 || loading}
        className={`px-2 py-1 text-xs bg-gray-700 text-white rounded-md shadow-md hover:bg-gray-600 transition-all ${
          page === 1 || loading ? "opacity-50 cursor-not-allowed" : ""
        }`}
      >
        ⏮
      </button>

      <button
        onClick={() => changePage(page - 1)}
        disabled={page === 1 || loading}
        className={`px-2 py-1 text-xs bg-gray-700 text-white rounded-md shadow-md hover:bg-gray-600 transition-all ${
          page === 1 || loading ? "opacity-50 cursor-not-allowed" : ""
        }`}
      >
        ←
      </button>

      <button
        onClick={() => changePage(page + 1)}
        disabled={loading || page * limit >= total}
        className={`px-2 py-1 text-xs bg-gray-700 text-white rounded-md shadow-md hover:bg-gray-600 transition-all ${
          loading || satellites.length < limit ? "opacity-50 cursor-not-allowed" : ""
        }`}
      >
        →
      </button>

      <button
        onClick={() => changePage(Math.ceil(total / limit))}
        disabled={page === Math.ceil(total / limit) || loading}
        className={`px-2 py-1 text-xs bg-gray-700 text-white rounded-md shadow-md hover:bg-gray-600 transition-all ${
          page === Math.ceil(total / limit) || loading ? "opacity-50 cursor-not-allowed" : ""
        }`}
      >
        ⏭
      </button>
    </div>
  </div>
)}
</div>
)}

{/* 📌 Sidebar Toggle (Now Always Aligned) */}
{is3DEnabled && (
  <button
    onClick={() => setSidebarOpen((prev) => !prev)}
    className={`absolute top-1/2 transform -translate-y-1/2 bg-gray-800 text-white px-3 py-4 rounded-r-lg shadow-md hover:bg-gray-700 transition-all duration-300 z-[90] ${
      sidebarOpen ? "left-[12.5rem]" : "left-0"
    }`}
  >
    {sidebarOpen ? "←" : "→"}
  </button>
)}


        {/* 🌍 3D UI Scene (Now Adaptive for Mobile with Spinning Globe) */}
<div
  className={`relative flex-1 ${window.innerWidth < 768 ? "h-[75vh]" : "h-[90vh]"} cursor-pointer`}
  onClick={() => setIs3DEnabled(true)}
>
  <div ref={mountRef} className="absolute top-0 left-0 w-full h-full" />

  {/* 🔄 Cool Loading Screen (Appears During Fetching) */}
  {loading && (
    <div className="absolute inset-0 flex flex-col items-center justify-center bg-black bg-opacity-80 text-white z-[90]">
      <div className="flex flex-col items-center">
        {/* 🔄 Spinning Loader */}
        <div className="w-12 h-12 border-t-4 border-b-4 border-teal-400 rounded-full animate-spin"></div>

        {/* 🛰️ Animated Loading Text */}
        <div className="mt-4 text-lg font-bold animate-pulse">Loading Data...</div>
      </div>
    </div>
  )}

  {/* 🌍 Welcome Screen with Animated Globe */}
  {!is3DEnabled && !loading && (
    <div
      className="absolute inset-0 flex flex-col items-center justify-center 
      bg-gradient-to-br from-black via-gray-900 to-black text-white 
      text-xl font-bold tracking-wide transition-opacity duration-300 
      animate-fadeIn"
    >
      {/* 🛰️ Spinning Globe Icon */}
      <div className="relative w-24 h-24 mb-4">
        <div className="absolute inset-0 flex items-center justify-center">
          <svg
            className="w-full h-full animate-rotateGlobe"
            viewBox="0 0 100 100"
            xmlns="http://www.w3.org/2000/svg"
          >
            <circle cx="50" cy="50" r="40" stroke="teal" strokeWidth="5" fill="none" />
            <line x1="50" y1="10" x2="50" y2="90" stroke="teal" strokeWidth="3" />
            <line x1="10" y1="50" x2="90" y2="50" stroke="teal" strokeWidth="3" />
            <path
              d="M 10 50 Q 50 90, 90 50"
              stroke="teal"
              strokeWidth="3"
              fill="none"
            />
            <path
              d="M 10 50 Q 50 10, 90 50"
              stroke="teal"
              strokeWidth="3"
              fill="none"
            />
          </svg>
        </div>
      </div>

      <div className={`${window.innerWidth < 768 ? "text-2xl" : "text-4xl"} mb-4 animate-pulse`}>
        Welcome to Sat-Track
      </div>
      <div className={`${window.innerWidth < 768 ? "text-sm" : "text-lg"} text-gray-400`}>
        Tap to Enter
      </div>
    </div>
  )}
</div>

{/* 🔄 Custom Animation for Rotating Globe */}
<style>
  {`
  @keyframes rotateGlobe {
    0% { transform: rotateY(0deg); }
    100% { transform: rotateY(360deg); }
  }
  .animate-rotateGlobe {
    animation: rotateGlobe 5s linear infinite;
  }
  `}
</style>

{/* 📌 Active Filters UI */}
{is3DEnabled && (
        <div className="absolute top-24 right-6 bg-gray-900 text-white p-3 rounded-md shadow-lg text-xs z-50">
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
      
{/* 📌 Compact Info Box (Fixed Small on Right) */}
{is3DEnabled && (
  <div
    className="absolute bottom-4 right-4 w-52 bg-gray-900 bg-opacity-90 text-yellow-300 p-3 shadow-lg text-xs border-l-4 border-yellow-500 rounded-md z-[50] transition-all duration-300 ease-in-out"
  >
    {!selectedSatellite ? (
      <div className="flex flex-col items-center justify-center h-full text-yellow-400 font-semibold text-center p-3">
        <span className="text-xl">📡</span>
        <p className="mt-1">Select a satellite</p>
      </div>
    ) : (
      <>
        {/* ✅ Satellite Header */}
        <div className="w-full text-center border-b border-yellow-500 pb-2">
          <div className="text-sm font-bold text-yellow-400 truncate">{selectedSatellite.name}</div>
          <div className="text-xs flex items-center justify-center mt-1 space-x-1">
            <span className="text-lg">{getCountryFlag(selectedSatellite.country)}</span>
            <span>{getCountryName(selectedSatellite.country)}</span>
          </div>
        </div>

        {/* ✅ Real-Time Data */}
        <div className="w-full py-2 space-y-1">
          <div className="flex justify-between">
            <span className="text-yellow-500 text-[10px] uppercase">Velocity</span>
            <span>{realTimeData.velocity} km/s</span>
          </div>
          <div className="flex justify-between">
            <span className="text-yellow-500 text-[10px] uppercase">Altitude</span>
            <span>{realTimeData.altitude} km</span>
          </div>
          <div className="flex justify-between">
            <span className="text-yellow-500 text-[10px] uppercase">Position</span>
            <span>{realTimeData.latitude}°, {realTimeData.longitude}°</span>
          </div>
        </div>

        {/* ✅ Additional Details */}
        <div className="w-full border-t border-yellow-500 pt-2 space-y-1">
          <div className="flex justify-between">
            <span className="text-yellow-500 text-[10px] uppercase">NORAD ID</span>
            <span>{selectedSatellite.norad_number}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-yellow-500 text-[10px] uppercase">Orbit</span>
            <span>{selectedSatellite.orbit_type}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-yellow-500 text-[10px] uppercase">Purpose</span>
            <span>{selectedSatellite.purpose || "Unknown"}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-yellow-500 text-[10px] uppercase">Launch</span>
            <span>{selectedSatellite.launch_date ? new Date(selectedSatellite.launch_date).toLocaleDateString() : "N/A"}</span>
          </div>
        </div>
      </>
    )}
  </div>
)}
 </div>
 </div>


<div className="w-full p-4 bg-gray-800 rounded-lg shadow-md">
  {/* 🌍 Orbital Filters */}
  <div className="w-full text-center mb-4">
    <h4 className="text-md font-semibold text-yellow-300 mb-2 tracking-wide">Orbital Categories</h4>
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {[
        { name: "LEO", label: "Low Earth Orbit (LEO)" },
        { name: "MEO", label: "Medium Earth Orbit (MEO)" },
        { name: "GEO", label: "Geostationary Orbit (GEO)" },
        { name: "HEO", label: "Highly Elliptical Orbit (HEO)" },
      ].map((filter) => (
        <FilterButton key={filter.name} filter={filter} />
      ))}
    </div>
  </div>

  {/* 🚀 Velocity & Orbital Characteristics */}
  <div className="w-full text-center mb-4">
    <h4 className="text-md font-semibold text-yellow-300 mb-2 tracking-wide">Velocity & Orbital Parameters</h4>
    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
      {[
        { name: "High Velocity", label: "Fast (>7.8 km/s)" },
        { name: "Low Velocity", label: "Slow (≤7.8 km/s)" },
        { name: "Perigee < 500 km", label: "Perigee < 500 km" },
        { name: "Apogee > 35,000 km", label: "Apogee > 35,000 km" },
        { name: "Eccentricity > 0.1", label: "High Eccentricity (>0.1)" },
        { name: "B* Drag Term > 0.0001", label: "High Drag (B* > 0.0001)" },
      ].map((filter) => (
        <FilterButton key={filter.name} filter={filter} />
      ))}
    </div>
  </div>

  {/* 🛰️ Satellite Purpose */}
  <div className="w-full text-center mb-4">
    <h4 className="text-md font-semibold text-yellow-300 mb-2 tracking-wide">Mission Type</h4>
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {[
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
      ].map((filter) => (
        <FilterButton key={filter.name} filter={filter} />
      ))}
    </div>
  </div>

  {/* 🚀 Launch & Decay Filters, Launch Year, Country, and Reset */}
  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-center mb-4">
    
    {/* 🚀 Launch & Decay Filters */}
    <div className="flex flex-col items-center">
      <h4 className="text-md font-semibold text-yellow-300 mb-2 tracking-wide">Launch & Decay Events</h4>
      <div className="flex flex-wrap justify-center gap-2">
        <FilterButton key="Recent Launches" filter={{ name: "Recent Launches", label: "Recent Launch (30 Days)" }} />
        <FilterButton key="Decayed" filter={{ name: "Decayed", label: "Decayed Satellites" }} />
      </div>
    </div>

    {/* 📅 Launch Year Dropdown */}
    <div className="flex flex-col items-center">
      <h4 className="text-md font-semibold text-yellow-300 mb-2 tracking-wide">Launch Year</h4>
      <select
        className="px-4 py-2 text-sm font-medium rounded-md bg-gray-700 text-gray-300 focus:outline-none focus:ring-2 focus:ring-yellow-500"
        onChange={(e) => toggleFilter(`Launch Year:${e.target.value}`)}
      >
        <option value="">Select Year</option>
        {Array.from({ length: 50 }, (_, i) => 2025 - i).map((year) => (
          <option key={year} value={year}>{year}</option>
        ))}
      </select>
    </div>

    {/* 🌍 Country Dropdown */}
    <div className="flex flex-col items-center">
      <h4 className="text-md font-semibold text-yellow-300 mb-2 tracking-wide">Country of Origin</h4>
      <select
        className="px-4 py-2 text-sm font-medium rounded-md bg-gray-700 text-gray-300 focus:outline-none focus:ring-2 focus:ring-yellow-500"
        onChange={(e) => toggleFilter(`Country:${e.target.value}`)}
      >
        <option value="">Select Country</option>
        {Object.entries(countryMapping).map(([code, { name, flag }]) => (
          <option key={code} value={code}>
            {flag} {name}
          </option>
        ))}
      </select>
    </div>
  </div>

  {/* 🔄 RESET FILTERS */}
  <div className="w-full text-center">
    <button
      className="px-5 py-2 text-md font-semibold bg-yellow-400 hover:bg-yellow-500 text-black rounded-md shadow-md transition-all duration-200 focus:ring-2 focus:ring-yellow-500"
      onClick={resetFilters}
    >
      Reset Filters
    </button>
  </div>
</div>



{/* 📊 Infographics Section */}
<div className="w-full p-6 bg-gray-950 shadow-md rounded-md text-white font-[Space Grotesk]">
  <h3 className="text-lg font-medium text-teal-300 text-center tracking-wide animate-jump">
    Data Visualization & Satellite Analytics
  </h3>
  <p className="text-center text-gray-400 text-sm">
    Real-time analytics based on selected filters.
  </p>
  <Infographics activeFilters={activeFilters} />
</div>



{/* 🌌 Full Page Container */}
<div className="min-h-screen bg-gradient-to-b from-black via-blue-950 to-gray-900 text-white px-6 sm:px-10 lg:px-16 py-14 z-60 font-[Space Grotesk]">

  {/* 📦 Section Container (Responsive Layout) */}
  <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 pb-40">

    {/* 🚀 About the Satellite Tracker */}
    <div className="p-8 bg-gray-900 bg-opacity-95 rounded-xl shadow-lg border border-gray-700 hover:scale-105 transition-transform duration-300 w-full lg:col-span-2">
      <h2 className="text-4xl font-medium text-teal-300 tracking-wide animate-fade-in">The Future of Satellite Tracking</h2>
      <p className="mt-5 text-lg leading-relaxed text-gray-300">
        Experience a cutting-edge <span className="text-yellow-300 font-medium uppercase tracking-wide">real-time 3D visualization</span> of Earth's satellites with unparalleled accuracy. Built on <span className="text-green-400 font-medium tracking-wide">advanced Keplerian physics</span>, this system dynamically maps orbital mechanics for a hyper-realistic space experience.
      </p>
    </div>

    {/* ⚙️ How It Works */}
    <div className="p-7 bg-gray-800 bg-opacity-90 rounded-lg shadow-md border border-gray-700 hover:scale-105 transition-transform duration-300">
      <h2 className="text-3xl font-medium text-green-400 tracking-wide">The Technology Behind It</h2>
      <p className="mt-4 text-lg leading-relaxed text-gray-300">
        Using Two-Line Element (TLE) data, this system calculates precise orbits through a high-fidelity <span className="text-lime-400 font-medium tracking-wide">orbital mechanics engine</span>. The real-time 3D interface is powered by <span className="text-cyan-400 font-medium tracking-wide">GPU-accelerated rendering</span>, ensuring seamless interactivity.
      </p>
    </div>

    {/* 🌍 Real-World Applications */}
    <div className="p-9 bg-gray-900 bg-opacity-95 rounded-xl shadow-lg border border-gray-700 hover:scale-105 transition-transform duration-300 lg:col-span-2">
      <h2 className="text-4xl font-medium text-yellow-300 tracking-wide">Real-World Impact</h2>
      <ul className="mt-5 list-disc pl-6 space-y-3 text-lg text-gray-300">
        <li><span className="text-cyan-400 font-medium">Orbital Debris Management</span> — Prevent catastrophic collisions in low-Earth orbit.</li>
        <li><span className="text-green-400 font-medium">Global Positioning Systems</span> — Optimize GPS accuracy through precise tracking.</li>
        <li><span className="text-lime-400 font-medium">High-Speed Telecommunications</span> — Ensure seamless satellite internet and broadcasting.</li>
      </ul>
    </div>

    {/* 📡 Technical Features */}
    <div className="p-8 bg-gray-800 bg-opacity-90 rounded-lg shadow-lg border border-gray-700 hover:scale-105 transition-transform duration-300">
      <h2 className="text-3xl font-medium text-teal-300 tracking-wide">Advanced Features</h2>
      <ul className="mt-4 list-disc pl-6 space-y-3 text-lg text-gray-300">
        <li><span className="text-yellow-300 font-medium">Continuous Data Refresh</span> — Fetches & updates satellite positions every few seconds.</li>
        <li><span className="text-green-400 font-medium">Hyper-Accurate 3D Rendering</span> — Powered by WebGL and Three.js.</li>
        <li><span className="text-cyan-400 font-medium">Predictive Orbit Analysis</span> — Calculates future movements with high precision.</li>
      </ul>
    </div>

    {/* 🚀 Future Enhancements */}
    <div className="p-7 bg-gray-900 bg-opacity-95 rounded-xl shadow-lg border border-gray-700 hover:scale-105 transition-transform duration-300 lg:col-span-2">
      <h2 className="text-4xl font-medium text-lime-400 tracking-wide">What’s Coming Next</h2>
      <ul className="mt-5 list-disc pl-6 space-y-3 text-lg text-gray-300">
        <li><span className="text-teal-300 font-medium">AI-Based Anomaly Detection</span> — Identifies irregular orbital shifts in real time.</li>
        <li><span className="text-yellow-300 font-medium">Space Weather Integration</span> — Displays real-time solar activity and radiation threats.</li>
        <li><span className="text-green-400 font-medium">Historical Orbit Playback</span> — Rewind and analyze past satellite movements.</li>
      </ul>
    </div>

    {/* 🌌 Space Exploration & New Missions */}
    <div className="p-10 bg-gray-800 bg-opacity-90 rounded-lg shadow-md border border-gray-700 hover:scale-105 transition-transform duration-300">
      <h2 className="text-3xl font-medium text-teal-300 tracking-wide">The Next Space Frontier</h2>
      <p className="mt-4 text-lg leading-relaxed text-gray-300">
        As humanity ventures beyond Earth, satellite tracking is expanding into <span className="text-yellow-300 font-medium tracking-wide">deep-space missions</span>. Future enhancements will include real-time monitoring of <span className="text-green-400 font-medium tracking-wide">lunar bases</span> and <span className="text-cyan-400 font-medium tracking-wide">Mars exploration vehicles</span>.
      </p>
    </div>

    {/* 📜 Additional Resources */}
    <div className="p-7 bg-gray-900 bg-opacity-95 rounded-xl shadow-lg border border-gray-700 hover:scale-105 transition-transform duration-300 lg:col-span-2">
      <h2 className="text-4xl font-medium text-cyan-400 tracking-wide">Resources & Learning</h2>
      <ul className="mt-5 list-disc pl-6 space-y-3 text-lg text-gray-300">
        <li><a href="https://www.spacestrak.com/" className="text-teal-300 hover:underline hover:text-teal-200" target="_blank">SpaceTrak — TLE Data & Orbital Elements</a></li>
        <li><a href="https://www.n2yo.com/" className="text-green-400 hover:underline hover:text-green-300" target="_blank">N2YO — Live Satellite Tracking</a></li>
      </ul>
    </div>

  </div>
</div>


</div>

);
}

