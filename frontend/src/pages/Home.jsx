// src/pages/Home.jsx

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import Navbar from "../components/Navbar";  // ✅ Ensure correct path
import { useCallback } from "react";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader";
import { fetchSatellites } from "../api/satelliteService";
import Infographics from "../components/Infographics"; // Ensure correct path


const dayTexture = "/assets/earth_day.jpg";
const nightTexture = "/assets/earth_night.jpg";
const satelliteModelPath = "/assets/satellite.glb";
const cloudTexture = "/assets/clouds.png";


export default function Home() {
  const globeRef = useRef(null);
  const cloudRef = useRef(null);
  const atmosphereRef = useRef(null);
  const sunRef = useRef(null);
  const moonRef = useRef(null);
  let isFetching = false;  // Prevent duplicate fetch calls



  const orbitPathsRef = useRef([]); // 🛰 Track all orbit paths
  const sceneRef = useRef(null); // ✅ Store scene reference
  const selectedPointerRef = useRef(null); // 🔼 Arrow Pointer
  const cameraRef = useRef(null); // Stores camera
  const mountRef = useRef(null);
  const [isInteractionEnabled, setIsInteractionEnabled] = useState(false);
  const satelliteObjectsRef = useRef({}); // ✅ Use a ref for real-time updates
  const [selectedSatellite, setSelectedSatellite] = useState(null);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1); // 🚀 Current page of satellites
  const [satellites, setSatellites] = useState([]);
  const [limit, setLimit] = useState(100);
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
  const sunTexture = textureLoader.load("/assets/sun_texture.jpg");




  const [filteredSatellites, setFilteredSatellites] = useState([]);
  const [activeFilters, setActiveFilters] = useState(["Recent Launches"]); // ✅ Track multiple filters
  
  
  const [total, setTotal] = useState(0);


  
  function computeSatellitePosition(satellite, time) {
    const { inclination, raan, arg_perigee, semi_major_axis, eccentricity, epoch } = satellite;
  
    const mu = 398600.4418; // Earth's gravitational parameter (km^3/s^2)
    const a = semi_major_axis; // Semi-major axis in km
    const n = Math.sqrt(mu / Math.pow(a, 3)); // Mean motion in rad/s
    const M = n * (time - new Date(epoch).getTime() / 1000); // Mean anomaly
  
    // ✅ Convert angles to radians
    const i = inclination * (Math.PI / 180);  // Inclination
    const Ω = raan * (Math.PI / 180);         // RAAN
    const ω = arg_perigee * (Math.PI / 180);  // Argument of Perigee
  
    // ✅ Solve Kepler's Equation for Eccentric Anomaly (E)
    let E = M;
    for (let j = 0; j < 10; j++) {
      E = M + eccentricity * Math.sin(E);
    }
  
    // ✅ Compute True Anomaly (ν)
    const nu = 2 * Math.atan2(
      Math.sqrt(1 + eccentricity) * Math.sin(E / 2),
      Math.sqrt(1 - eccentricity) * Math.cos(E / 2)
    );
  
    // ✅ Compute Orbital Distance
    const r = a * (1 - eccentricity * Math.cos(E));
  
    // ✅ Perifocal (Orbital) Coordinates
    const x_orb = r * Math.cos(nu);
    const y_orb = r * Math.sin(nu);
    const z_orb = 0; // No z-component in perifocal frame
  
    // ✅ Transformation from Perifocal to ECI (Earth-Centered Inertial) Coordinates
  
    // **Rotation Matrices**
    const cos_Ω = Math.cos(Ω);
    const sin_Ω = Math.sin(Ω);
    const cos_i = Math.cos(i);
    const sin_i = Math.sin(i);
    const cos_ω = Math.cos(ω);
    const sin_ω = Math.sin(ω);
  
    // **Transformation Equations**
    const x_final = (cos_Ω * cos_ω - sin_Ω * sin_ω * cos_i) * x_orb +
                    (-cos_Ω * sin_ω - sin_Ω * cos_ω * cos_i) * y_orb;
  
    const y_final = (sin_Ω * cos_ω + cos_Ω * sin_ω * cos_i) * x_orb +
                    (-sin_Ω * sin_ω + cos_Ω * cos_ω * cos_i) * y_orb;
  
    const z_final = (sin_ω * sin_i) * x_orb +
                    (cos_ω * sin_i) * y_orb;  // ✅ Now properly transformed!
  
    return new THREE.Vector3(-x_final / 1000,  z_final / 1000, y_final / 1000); // Scale down for visualization
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
  
    const MAX_ORBITS = 100;
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
  
    // ✅ Step 2: Choose Orbit Colors
    const orbitColors = {
      "LEO": 0x4CAF50,  // 🟢 Green for Low Earth Orbit
      "MEO": 0xFF9800,  // 🟠 Orange for Medium Earth Orbit
      "GEO": 0x2196F3,  // 🔵 Blue for Geostationary Orbit
      "HEO": 0x9C27B0,  // 🟣 Purple for Highly Elliptical Orbit
    };
  
    const orbitColor = orbitColors[satellite.orbit_type] || 0x89CFF0; // 🟦 Default Light Blue
  
    // ✅ Step 3: Create Orbit Path
    const orbitGeometry = new THREE.BufferGeometry().setFromPoints(orbitPoints);
    const orbitMaterial = new THREE.LineBasicMaterial({
      color: orbitColor,
      opacity: 0.7,
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
    const textureLoader = new THREE.TextureLoader();
    const moonTexture = textureLoader.load("/assets/moon_texture.jpg");
  
    const moonGeometry = new THREE.SphereGeometry(1.27, 32, 32); // 🌙 Size ~1/4th of Earth
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
    const moonOrbitRadius = 90; // Adjusted for visualization
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
  console.log(`🔄 Attempting to load model for: ${satellite.name} (${satellite.norad_number})`);

  // ✅ Prevent duplicate loading
  if (satelliteObjectsRef.current[satellite.norad_number]) {
    console.log(`⚠️ Satellite ${satellite.norad_number} already exists in the scene.`);
    return;
  }

  const loader = new GLTFLoader();
  
  loader.load(
    satelliteModelPath,
    (gltf) => {
      const satelliteModel = gltf.scene;
      satelliteModel.scale.set(0.00005, 0.00005, 0.00005);

      // 🚀 Compute Initial Position
      const initialPos = computeSatellitePosition(satellite, Date.now() / 1000);
      satelliteModel.position.copy(initialPos);

      // ✅ Ensure proper orientation
      satelliteModel.lookAt(new THREE.Vector3(0, 0, 0));
      satelliteModel.rotateX(Math.PI / 2);
      satelliteModel.rotateY(-Math.PI / 2);

      // ✅ Attach metadata
      satelliteModel.userData = satellite;

      // ✅ Store reference
      satelliteObjectsRef.current[satellite.norad_number] = satelliteModel;

      // ✅ Add to scene
      if (sceneRef.current) {
        sceneRef.current.add(satelliteModel);
        console.log(`📡 Satellite model successfully added: ${satellite.name} (${satellite.norad_number})`);
      }
    },
    undefined,
    (error) => {
      console.error(`❌ Error loading satellite model (${satellite.norad_number}):`, error);
    }
  );
};






  // ✅ Smooth Camera Transition Function
  // ✅ Improved Camera Transition Function
function smoothCameraTransition(targetPosition, satellite) {
  if (!cameraRef.current) return;

  const startPos = cameraRef.current.position.clone();
  let zoomFactor = 1.1; // Default zoom for MEO/Mid-range

  // 🎯 Adjust Zoom Based on Satellite Altitude (Apogee)
  if (satellite) {
      const altitude = (satellite.perigee + satellite.apogee) / 2; // Average altitude
      if (altitude < 2000) {
          zoomFactor = 1.3; // Closer for LEO
      } else if (altitude >= 2000 && altitude < 35000) {
          zoomFactor = 1.1; // Medium for MEO
      } else {
          zoomFactor = 1.1; // Further for GEO & HEO
      }
  }

  const targetPos = targetPosition.clone().multiplyScalar(zoomFactor);

  let t = 0;
  function moveCamera() {
      t += 0.1;

      const distance = startPos.distanceTo(targetPos);
      const speedFactor = distance > 50 ? 0.2 : distance > 20 ? 0.1 : 0.05;

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
}, [setSelectedSatellite, setIsTracking, sceneRef, selectedPointerRef, cameraRef]);







  const toggleFilter = async (filterType) => {
    console.log(`🔍 Selecting filter: ${filterType}`);
  
    setActiveFilters([filterType]); // ✅ Only one active filter at a time
  
    setPage(1); // ✅ Reset pagination
    window.scrollTo({ top: 0, behavior: "smooth" });
  
    setSatellites([]); // ✅ Clear previous satellite models
    setFilteredSatellites([]); // ✅ Clear sidebar list
    removeAllSatelliteModels(); // ✅ Remove old Three.js models
  
    fetchAndUpdateSatellites([filterType], 1); // ✅ Fetch satellites for new filter
  };
  


  const removeAllSatelliteModels = () => {
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
        const data = await fetchSatellites(newPage, 100, updatedFilters.join(","));

        if (data?.satellites?.length) {
            console.log(`📌 Loaded ${data.satellites.length} satellites for page ${newPage}`);

            // ✅ Store only 100 satellites
            const limitedSatellites = data.satellites.slice(0, 100);
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
  console.log(`🛰️ Updating scene with ${satellites.length} satellites...`);
  console.log("🚀 Current satelliteObjectsRef (before update):", Object.keys(satelliteObjectsRef.current));
  console.log("🛰️ Satellites in Scene (before update):", sceneRef.current.children.length);

  // ✅ Ensure satellites are cleared before adding new ones
  removeAllSatelliteModels();
  removeAllOrbitPaths();

  // ✅ Ensure only 100 satellites are rendered
  const limitedSatellites = satellites.slice(0, 100);
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
  }, 100);
};



  

useEffect(() => {
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

  addOrbitPaths(); // ✅ Ensure orbit paths are updated

  console.log("🚀 Current satelliteObjectsRef (after update):", Object.keys(satelliteObjectsRef.current));
  console.log("🛰️ Satellites in Scene (after update):", sceneRef.current.children.length);
}, [satellites]);

  




  useEffect(() => {
    if (satellites.length > 0) {
      console.log("⚠️ Skipping fetch, satellites already loaded.");
      return;
    }
  
    console.log(`📡 Fetching satellites for page ${page} (filters: ${activeFilters.length > 0 ? activeFilters.join(", ") : "None"})...`);
    fetchAndUpdateSatellites(activeFilters, page);
  }, [page, activeFilters]); // Ensures it only runs when `page` or `activeFilters` change

  



  useEffect(() => {
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
  }, [page, limit, activeFilters]); // ✅ Runs when page, limit, or filter changes
  




//console.log("🔍 Tracking useEffect dependencies: ", { page, limit, activeFilter });








useEffect(() => {
  if (selectedSatellite && isTracking) {
    console.log(`📌 Tracking satellite: ${selectedSatellite.name} (NORAD: ${selectedSatellite.norad_number})`);
  }
}, [selectedSatellite, isTracking]);




const changePage = async (newPage) => {
  if (newPage < 1 || loading) return;

  console.log(`📡 Changing to page ${newPage}...`);
  setLoading(true);
  setPage(newPage);

  try {
      resetMarker(); // ✅ Remove previous selection

      // ✅ **Ensure FULL Scene Cleanup Before Fetching New Data**
      await removeAllSatelliteModels(); // 🔥 Ensure complete removal
      await removeAllOrbitPaths(); // 🔥 Orbit cleanup

      const data = await fetchSatellites(newPage, limit, activeFilters.length > 0 ? activeFilters.join(",") : null);

      if (data?.satellites?.length) {
          const limitedSatellites = data.satellites.slice(0, 100);
          
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
      setLoading(false);
  }
};



useEffect(() => {
  if (loading) {
    console.log("⏳ Waiting for satellites...");
  } else if (!loading) {
    if (satellites.length > 0) {
      console.log(`📌 Sidebar Updated: ${satellites.length} satellites available.`, satellites);
    } else {
      console.warn("⚠️ Sidebar has no satellites, waiting for fetch...");
    }
  }
}, [satellites, loading]);



useEffect(() => {
  console.log("📌 Page changed! Resetting selection and tracking.");
  setSelectedSatellite(null);
  setIsTracking(false); // ✅ Reset tracking so new selections work properly
  localStorage.removeItem("selectedSatellite");
  selectedPointerRef.current = null; // ✅ Clear any lingering tracking
}, [page]);





// ✅ Restore Last Selected Satellite After Refresh (Without Duplicates)
useEffect(() => {
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
}, [satellites]); // ✅ Runs only when satellites update





useEffect(() => {
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
  setIsInteractionEnabled(true);
  if (controlsRef.current) controlsRef.current.enabled = true;
};





// ✅ Ensure Tracking Stops When Camera is Moved
useEffect(() => {
  if (!controlsRef.current) return;

  controlsRef.current.enabled = !isTracking; // 🔄 Disable controls when tracking is enabled
}, [isTracking]);





// ✅ Scene & Animation Setup (Runs Once)

useEffect(() => {
  if (!mountRef.current) return;

  const scene = new THREE.Scene();
  sceneRef.current = scene;

  const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.5, 9000);
  camera.position.set(0, 5, 15);
  cameraRef.current = camera;

  const renderer = new THREE.WebGLRenderer({ antialias: true , precision: "highp" });
  renderer.setSize(mountRef.current.clientWidth, mountRef.current.clientHeight);
  renderer.setPixelRatio(window.devicePixelRatio);
  mountRef.current.appendChild(renderer.domElement);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableZoom = true;
  controls.enablePan = false;
  controls.enableDamping = true;
  controls.dampingFactor = 0.1;
  controls.rotateSpeed = 0.8;
  controls.minDistance = 7;
  controls.maxDistance = 100;
  controlsRef.current = controls;

  const light = new THREE.DirectionalLight(0xffffff, 4.5);
  light.position.set(200, 50, 0);
  scene.add(light);


  
  // 🌍 **Create Earth**
  const globe = new THREE.Mesh(
    new THREE.SphereGeometry(5, 64, 64),
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
    new THREE.SphereGeometry(5.05, 64, 64),
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



  const auroraMaterial = new THREE.ShaderMaterial({
    uniforms: {
      time: { value: 0 },
    },
    vertexShader: `
      varying vec3 vPosition;
      void main() {
        vPosition = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      varying vec3 vPosition;
      uniform float time;
  
      void main() {
        float latitude = abs(vPosition.y); // Get vertical position (Y-axis)
        
        // ✅ Smooth gradient fade instead of hard cut-off
        float visibility = smoothstep(4.0, 5.0, latitude); // Start fading from 30° and fully visible above 50°
  
        // ✅ Ensure aurora isn’t fully transparent
        if (visibility < 0.1) {
          discard;
        }
  
        float intensity = pow(visibility, 1.0); // Adjust intensity
        float wave = sin(vPosition.y * 10.0 + time) * 0.4 + 0.6; // Add dynamic wave effect
  
        gl_FragColor = vec4(0.5, 1, 0.8, 0.4) * intensity * wave; // Green aurora effect
      }
    `,
    transparent: true,
    side: THREE.DoubleSide,
  });
  
  
  // ✅ Create the Aurora Mesh and Position It
  const aurora = new THREE.Mesh(new THREE.SphereGeometry(5.1, 64, 64), auroraMaterial);
  scene.add(aurora);
  
  // ✅ Animate the Aurora Over Time
  function animateAurora() {
    auroraMaterial.uniforms.time.value += 0.009;
    requestAnimationFrame(animateAurora);
  }
  animateAurora();
  

  

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
    new THREE.SphereGeometry(5.05, 64, 64),
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
    new THREE.SphereGeometry(20, 64, 64),
    new THREE.MeshStandardMaterial({
      map: sunTexture,
      emissive: 0xffffe0,
      emissiveIntensity: 2,
      emissiveMap: sunTexture,
    })
  );
  sun.position.set(600, 50, 0);
  sunRef.current = sun;
  scene.add(sun);

  // 🌌 **Create Star Field**
  const starGeometry = new THREE.BufferGeometry();
  const starVertices = [];
  for (let i = 0; i < 140000; i++) {
    starVertices.push((Math.random() - 0.5) * 1000, (Math.random() - 0.5) * 1000, (Math.random() - 0.5) * 1000);
  }
  starGeometry.setAttribute("position", new THREE.Float32BufferAttribute(starVertices, 3));
  const starMaterial = new THREE.PointsMaterial({ color: 0xffffff, size: 0.02 });
  scene.add(new THREE.Points(starGeometry, starMaterial));









  
  // ✅ ADD THE MOON HERE
  createMoon(scene, globe); 

  // ✅ Start Moon Orbit Animation
  animateMoon();


  // 🔄 **Animation Loop**
  const animate = () => {
    requestAnimationFrame(animate);

    if (globeRef.current) globeRef.current.rotation.y += 0.0000727;
    if (cloudRef.current) cloudRef.current.rotation.y += 0.00009;

    const time = Date.now() / 1000;
    const timeFactor = 60;

    // 🛰️ Force all satellites to recalculate position
  Object.values(satelliteObjectsRef.current).forEach((satelliteModel) => {
    if (satelliteModel.userData) {
      const newPos = computeSatellitePosition(satelliteModel.userData, time * timeFactor);
      if (newPos) {
        satelliteModel.position.lerp(newPos, 0.3); // 🔄 Smooth movement
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
}, []); // ✅ Runs only once!





// ✅ Separate useEffect for Tracking (Fixes tracking while keeping satellites visible)
useEffect(() => {
  if (!isTracking || !selectedSatellite || !cameraRef.current) return;

  console.log(`📌 Tracking satellite: ${selectedSatellite.name} (NORAD: ${selectedSatellite.norad_number})`);

  const trackSatellite = () => {
    if (!selectedSatellite || !satelliteObjectsRef.current[selectedSatellite.norad_number]) return;

    const satPosition = satelliteObjectsRef.current[selectedSatellite.norad_number].position;
    cameraRef.current.position.lerp(satPosition.clone().multiplyScalar(1.3), 0.05);
    cameraRef.current.lookAt(satPosition);
  };

  const interval = setInterval(trackSatellite, 15);

  return () => clearInterval(interval);
}, [isTracking, selectedSatellite]); // ✅ Runs only when tracking state or satellite selection changes






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
}, [isTracking]);




const displayedSatellites = (filteredSatellites.length > 0 ? filteredSatellites : satellites).filter((sat) =>
  sat.name.toLowerCase().includes(searchQuery.toLowerCase()) // ✅ Search applied here
);


const countryMapping = {
  "US": { name: "USA", flag: "🇺🇸" },
  "PRC": { name: "China", flag: "🇨🇳" },
  "UK": { name: "United Kingdom", flag: "🇬🇧" },
  "CIS": { name: "CIS (Former USSR)", flag: "🇷🇺" },
  "JPN": { name: "Japan", flag: "🇯🇵" },
  "IND": { name: "India", flag: "🇮🇳" },
  "ESA": { name: "European Space Agency", flag: "🇪🇺" },
  "FR": { name: "France", flag: "🇫🇷" },
  "SES": { name: "SES (Luxembourg)", flag: "🇱🇺" },
  "CA": { name: "Canada", flag: "🇨🇦" },
  "GER": { name: "Germany", flag: "🇩🇪" },
  "SKOR": { name: "South Korea", flag: "🇰🇷" },
  "IT": { name: "Italy", flag: "🇮🇹" },
  "SPN": { name: "Spain", flag: "🇪🇸" },
  "ARGN": { name: "Argentina", flag: "🇦🇷" },
  "TURK": { name: "Turkey", flag: "🇹🇷" },
  "BRAZ": { name: "Brazil", flag: "🇧🇷" },
  "NOR": { name: "Norway", flag: "🇳🇴" },
  "UAE": { name: "UAE", flag: "🇦🇪" },
  "ISRA": { name: "Israel", flag: "🇮🇱" },
  "TWN": { name: "Taiwan", flag: "🇹🇼" },
  "IRAN": { name: "Iran", flag: "🇮🇷" },
  "BEL": { name: "Belgium", flag: "🇧🇪" },
  "SING": { name: "Singapore", flag: "🇸🇬" },
  "INDO": { name: "Indonesia", flag: "🇮🇩" },
  "THAI": { name: "Thailand", flag: "🇹🇭" },
  "EGYP": { name: "Egypt", flag: "🇪🇬" },
  "KAZ": { name: "Kazakhstan", flag: "🇰🇿" },
  "SAFR": { name: "South Africa", flag: "🇿🇦" },
  "PAKI": { name: "Pakistan", flag: "🇵🇰" },
  "MEX": { name: "Mexico", flag: "🇲🇽" },
  "POL": { name: "Poland", flag: "🇵🇱" },
  "UKR": { name: "Ukraine", flag: "🇺🇦" },
  "QAT": { name: "Qatar", flag: "🇶🇦" },
  "CHLE": { name: "Chile", flag: "🇨🇱" },
  "BOL": { name: "Bolivia", flag: "🇧🇴" },
  "ISS": { name: "ISS (International Space Station)", flag: "🚀" },
  "NICO": { name: "Nicaragua", flag: "🇳🇮" },
  "PER": { name: "Peru", flag: "🇵🇪" },
  "BGD": { name: "Bangladesh", flag: "🇧🇩" },
  "IRAQ": { name: "Iraq", flag: "🇮🇶" },
  "HUN": { name: "Hungary", flag: "🇭🇺" },
  "KEN": { name: "Kenya", flag: "🇰🇪" },
  "BELA": { name: "Belarus", flag: "🇧🇾" },
  "AGO": { name: "Angola", flag: "🇦🇴" }
};

const getCountryFlag = (code) => countryMapping[code]?.flag || "🌍";
const getCountryName = (code) => countryMapping[code]?.name || "Unknown";

const FilterButton = ({ filter }) => (
  <button
    className={`px-4 py-2 text-xs font-semibold rounded-md transition-all duration-200 shadow-md ${
      activeFilters.includes(filter.name) ? "bg-blue-600 text-white" : "bg-gray-700 hover:bg-gray-600 text-gray-300"
    }`}
    onClick={() => toggleFilter(filter.name)}
  >
    {filter.label}
  </button>
);





return (
  <div className="flex flex-col min-h-screen w-screen overflow-hidden">
    {/* 📌 Navbar */}
    <Navbar />


    {/* 🌍 Main Layout: Sidebar + 3D UI */}
    <div className="relative flex flex-1">

{/* 📌 Sidebar (Satellite List, Search & Pagination) */}
<div className="relative flex flex-col h-[90vh]">
  <div
    className={`absolute top-20 left-0 h-[60vh] bg-gray-900 bg-opacity-90 backdrop-blur-md text-white p-4 shadow-xl border-r border-gray-700 transition-transform duration-300 ease-in-out w-60 md:w-1/8 z-40 rounded-r-xl ${
      sidebarOpen ? "translate-x-0" : "-translate-x-full"
    }`}
  >
    {/* 🛰️ Sidebar Header */}
    <h2 className="text-lg font-bold mb-3 text-center border-b border-gray-700 pb-2">Satellite List</h2>

    {/* 🔍 Search Input */}
    <input
      type="text"
      placeholder="🔍 Search satellites..."
      value={searchQuery}
      onChange={(e) => setSearchQuery(e.target.value)}
      className="w-full p-2 mb-3 text-white rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 border border-gray-600 shadow-sm"
    />
{/* 🚀 Satellite List (Two Columns) */}
<div className="overflow-y-auto max-h-[30vh] pr-2">
  {loading ? (
    <p className="text-center text-gray-400">Loading...</p>
  ) : displayedSatellites.length === 0 ? (
    <p className="text-center text-yellow-400 font-semibold">⚠️ No satellites available</p>
  ) : (
    <ul className="grid grid-cols-2 gap-2"> {/* ✅ Two-column grid layout */}
      {displayedSatellites.map((sat) => (
        <li
          key={sat.norad_number}
          className={`cursor-pointer p-3 rounded-md text-center border border-gray-700 shadow-sm transition-all duration-200 ${
            selectedSatellite?.norad_number === sat.norad_number
              ? "bg-blue-500 text-white border-blue-600 shadow-md"
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


    {/* 🌍 Pagination Controls */}
    {(total > limit) && (
      <div className="flex justify-between items-center mt-4 border-t border-gray-700 pt-3">
        <button
          onClick={() => changePage(page - 1)}
          disabled={page === 1 || loading}
          className={`px-4 py-2 bg-gray-700 text-white rounded-md shadow-md hover:bg-gray-600 transition-all ${
            page === 1 || loading ? "opacity-50 cursor-not-allowed" : ""
          }`}
        >
          ← Prev
        </button>

        <span className="text-sm text-gray-300">Page {page}</span>

        <button
          onClick={() => changePage(page + 1)}
          disabled={loading || page * limit >= total}
          className={`px-4 py-2 bg-gray-700 text-white rounded-md shadow-md hover:bg-gray-600 transition-all ${
            loading || satellites.length < limit ? "opacity-50 cursor-not-allowed" : ""
          }`}
        >
          Next →
        </button>
      </div>
    )}
  </div>

  {/* 📌 Sidebar Toggle */}
  <button
  onClick={() => setSidebarOpen((prev) => !prev)}
  className={`absolute top-1/2 transform -translate-y-1/2 bg-gray-800 text-white px-2 py-12 rounded-lg shadow-md hover:bg-gray-700 transition-all duration-300 z-50 ${
    sidebarOpen ? "left-[15rem] md:left-1/6" : "left-0"
  }`}
>
  {sidebarOpen ? "←" : "→"}
</button>


</div>

      {/* 🌍 3D UI + Sidebar + Info Box Sticking Together */}
      <div className="relative flex-1 flex flex-col">
        
        {/* 🛰️ 3D UI - Stays Fixed */}
        <div 
          className="relative w-full h-[100vh] cursor-pointer"
          onClick={enableInteraction} // ✅ Click to enable controls
        >
          <div ref={mountRef} className="absolute top-0 left-0 w-full h-full" />
          {!isInteractionEnabled && (
            <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50 text-white text-lg font-bold">
              🔒 Click to Enable 3D Controls
            </div>
          )}
        </div>

{/* 📌 Active Filters UI (Fix: Positioned Relative to 3D UI) */}
<div className="absolute top-24 right-6 bg-gray-900 text-white p-3 rounded-md shadow-lg text-xs z-50">
    <h3 className="text-sm font-semibold text-gray-300">Active Filters:</h3>
    {activeFilters.length > 0 ? (
      <ul className="mt-1 space-y-1">
        {activeFilters.map((filter, index) => (
          <li key={index} className="text-blue-400 flex items-center">
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


{/* 🛰️ Satellite Info Box */}
<div className="absolute bottom-0 bg-gray-900 text-yellow-300 p-3 shadow-lg text-xs border-t border-gray-700 flex flex-col items-center h-36 w-full z-[60] transition-all duration-300 ease-in-out">
  {loading ? (
    <div className="flex items-center justify-center h-full">
      <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-yellow-300 border-opacity-75"></div>
    </div>
  ) : !selectedSatellite ? (
    <div className="flex items-center justify-center h-full text-yellow-400 font-semibold">
      <p>🔍 Make a selection to view details</p>
    </div>
  ) : (
    <>
      {/* Satellite Name, Country & Last Update */}
      <div className="flex flex-col items-center w-full text-center pb-1">
        <div className="flex items-center space-x-2">
          <span className="text-lg font-bold text-yellow-400">{selectedSatellite.name}</span>
          <span className="text-sm flex items-center">
            {getCountryFlag(selectedSatellite.country)} {getCountryName(selectedSatellite.country)}
          </span>
        </div>
        <span className="text-yellow-500 text-xs">
          <strong>Last Update:</strong> {new Date(selectedSatellite.epoch).toLocaleString()}
        </span>
      </div>

      {/* Satellite Details */}
      <div className="flex flex-wrap justify-center items-center space-x-4 overflow-x-auto whitespace-nowrap w-full px-4 text-center">
        <span><strong>NORAD:</strong> {selectedSatellite.norad_number}</span>
        <span><strong>Orbit:</strong> {selectedSatellite.orbit_type}</span>
        <span className={selectedSatellite.velocity > 7.8 ? "text-red-400" : "text-green-400"}>
          <strong>Velocity:</strong> {selectedSatellite.velocity} km/s
        </span>
        <span><strong>Inclination:</strong> {selectedSatellite.inclination}°</span>
        <span><strong>Latitude:</strong> {selectedSatellite.latitude?.toFixed(4)}°</span>
        <span><strong>Longitude:</strong> {selectedSatellite.longitude?.toFixed(4)}°</span>
        <span><strong>Altitude:</strong> {selectedSatellite.perigee} - {selectedSatellite.apogee} km</span>
        <span><strong>Eccentricity:</strong> {selectedSatellite.eccentricity?.toFixed(4)}</span>
        <span><strong>B* Drag:</strong> {selectedSatellite.bstar}</span>
      </div>

      {/* Additional Info: Purpose, Status, Launch Date */}
      <div className="flex flex-wrap justify-center items-center space-x-4 overflow-x-auto whitespace-nowrap w-full px-4 text-center mt-2">
        <span><strong>Type:</strong> {selectedSatellite.purpose || "Unknown"}</span>
        <span><strong>Launch:</strong> {selectedSatellite.launch_date ? new Date(selectedSatellite.launch_date).toLocaleDateString() : "N/A"}</span>
        <span><strong>Size:</strong> {selectedSatellite.rcs < 0.1 ? "🛰️ Small" : selectedSatellite.rcs < 1.0 ? "📡 Medium" : "🚀 Large"}</span>
      </div>
    </>
  )}
</div>
</div>
</div>

 {/* 🛰️ Filter Section Below 3D UI */}
<div className="flex flex-col items-center p-4 bg-gray-800 shadow-md rounded-md w-full z-50">
  <h3 className="text-lg font-semibold text-white mb-2 text-center">Filters</h3>

  {/* 🌍 Orbital Filters */}
  <div className="w-full text-center mb-3">
    <h4 className="text-sm font-semibold text-gray-300 mb-2">🌍 Orbital Filters</h4>
    <div className="flex flex-wrap justify-center gap-2">
      {[
        { name: "LEO", label: "🛰️ Low Earth Orbit (LEO)" },
        { name: "MEO", label: "🛰️ Medium Earth Orbit (MEO)" },
        { name: "GEO", label: "🛰️ Geostationary Orbit (GEO)" },
        { name: "HEO", label: "🚀 Highly Elliptical Orbit (HEO)" },
      ].map((filter) => (
        <FilterButton key={filter.name} filter={filter} />
      ))}
    </div>
  </div>

  {/* 🚀 Velocity & Orbital Characteristics */}
  <div className="w-full text-center mb-3">
    <h4 className="text-sm font-semibold text-gray-300 mb-2">🚀 Velocity & Orbital Characteristics</h4>
    <div className="flex flex-wrap justify-center gap-2">
      {[
        { name: "High Velocity", label: "🚀 Fast (>7.8 km/s)" },
        { name: "Low Velocity", label: "🛑 Slow (≤7.8 km/s)" },
        { name: "Perigee < 500 km", label: "🌍 Perigee < 500 km" },
        { name: "Apogee > 35,000 km", label: "🌌 Apogee > 35,000 km" },
        { name: "Eccentricity > 0.1", label: "🔄 High Eccentricity (>0.1)" },
        { name: "B* Drag Term > 0.0001", label: "🌬️ High Drag (B* > 0.0001)" },
      ].map((filter) => (
        <FilterButton key={filter.name} filter={filter} />
      ))}
    </div>
  </div>

  {/* 🛰️ Satellite Purpose */}
  <div className="w-full text-center mb-3">
    <h4 className="text-sm font-semibold text-gray-300 mb-2">🛰️ Satellite Purpose</h4>
    <div className="flex flex-wrap justify-center gap-2">
      {[
        { name: "Communications", label: "📡 Communications" },
        { name: "Navigation", label: "🧭 Navigation" },
        { name: "Military", label: "🎖️ Military / Recon" },
        { name: "Weather", label: "🌦️ Weather Monitoring" },
        { name: "Earth Observation", label: "🛰️ Earth Observation" },
        { name: "Science", label: "🔬 Scientific Research" },
        { name: "Human Spaceflight", label: "🚀 Human Spaceflight" },
        { name: "Technology Demo", label: "🛠️ Technology Demo" },
      ].map((filter) => (
        <FilterButton key={filter.name} filter={filter} />
      ))}
    </div>
  </div>

  {/* 🚀 Launch & Decay Filters */}
  <div className="w-full text-center mb-3">
    <h4 className="text-sm font-semibold text-gray-300 mb-2">🚀 Launch & Decay Filters</h4>
    <div className="flex flex-wrap justify-center gap-2">
      <FilterButton key="Recent Launches" filter={{ name: "Recent Launches", label: "🚀 Recent Launch (30 Days)" }} />
    </div>
  </div>

  {/* 📅 Launch Year Dropdown */}
  <div className="w-full text-center mb-3">
    <h4 className="text-sm font-semibold text-gray-300 mb-2">📅 Launch Year</h4>
    <select
      className="px-4 py-2 text-xs font-semibold rounded-md bg-gray-700 text-gray-300"
      onChange={(e) => toggleFilter(`Launch Year:${e.target.value}`)}
    >
      <option value="">📅 Select Year</option>
      {Array.from({ length: 50 }, (_, i) => 2025 - i).map((year) => (
        <option key={year} value={year}>{year}</option>
      ))}
    </select>
  </div>

  {/* 🌍 Country Dropdown */}
  <div className="w-full text-center mb-3">
    <h4 className="text-sm font-semibold text-gray-300 mb-2">🌍 Select Country</h4>
    <select
      className="px-4 py-2 text-xs font-semibold rounded-md bg-gray-700 text-gray-300"
      onChange={(e) => toggleFilter(`Country:${e.target.value}`)}
    >
      <option value="">🌍 Select Country</option>
      {Object.entries(countryMapping).map(([code, { name, flag }]) => (
        <option key={code} value={code}>
          {flag} {name}
        </option>
      ))}
    </select>
  </div>

  {/* 🛑 RESET FILTERS */}
  <div className="w-full flex justify-center mt-3">
    <button
      className="px-5 py-2 text-sm font-semibold bg-red-600 hover:bg-red-700 text-white rounded-md shadow-md"
      onClick={resetFilters}
    >
      🔄 Reset Filters
    </button>
  </div>
</div>


{/* 📊 Infographics Section */}
<div className="w-full p-6 bg-gray-900 shadow-md rounded-md text-white">
  <h3 className="text-lg font-semibold text-center text-blue-400">📊 Satellite Infographics</h3>
  <p className="text-center text-gray-400 text-sm">Visual analytics based on your selected filters.</p>
  <Infographics activeFilters={activeFilters} />
</div>

{/* 📜 Scrollable Content Below Everything (Responsive for Mobile & Desktop) */}
<div className="overflow-y-auto h-[calc(240vh-100px)] bg-gradient-to-b from-gray-900 via-gray-800 to-black text-white px-4 sm:px-8 lg:px-12 py-10 z-60">

  {/* 🛰️ Section Container */}
  <div className="max-w-5xl mx-auto space-y-12">

    {/* 🔥 About the Satellite Tracker */}
    <div className="p-6 bg-gray-800 bg-opacity-90 rounded-lg shadow-lg border border-gray-700">
      <h2 className="text-3xl sm:text-4xl font-extrabold text-blue-400 tracking-wide animate-pulse">🛰️ About the Satellite Tracker</h2>
      <p className="mt-4 text-lg leading-relaxed">
        This advanced satellite tracker offers a **real-time 3D visualization** of Earth’s orbiting satellites, dynamically updating based on 
        precise orbital mechanics. Using **Three.js** and **TLE propagation**, it provides accurate tracking of thousands of satellites, ensuring
        a realistic space simulation.
      </p>
    </div>

    {/* 🛰️ How It Works */}
    <div className="p-6 bg-gray-800 bg-opacity-90 rounded-lg shadow-lg border border-gray-700">
      <h2 className="text-3xl sm:text-4xl font-extrabold text-green-400 tracking-wide">⚙️ How It Works</h2>
      <p className="mt-4 text-lg leading-relaxed">
        The tracker processes live **Two-Line Element (TLE) data**, which is fed into an orbital mechanics engine. Using Keplerian orbital 
        elements, it calculates each satellite’s trajectory with extreme accuracy. The **3D visualization** is powered by <strong>Three.js</strong>,
        enabling smooth real-time rendering.
      </p>
    </div>

    {/* 🌍 Real-World Applications */}
    <div className="p-6 bg-gray-800 bg-opacity-90 rounded-lg shadow-lg border border-gray-700">
      <h2 className="text-3xl sm:text-4xl font-extrabold text-yellow-400 tracking-wide">🌎 Real-World Applications</h2>
      <ul className="mt-4 list-disc pl-6 space-y-3 text-lg">
        <li>📡 **Space Situational Awareness** - Detect and track space debris to prevent collisions.</li>
        <li>⛈️ **Weather Monitoring** - Observe satellites like NOAA and GOES for real-time weather data.</li>
        <li>📍 **GPS & Navigation** - Track global navigation systems such as GPS, Galileo, and GLONASS.</li>
        <li>📺 **Telecommunications** - Monitor internet, TV, and radio signal satellites.</li>
        <li>🛡️ **Military & Defense** - Track classified satellites used for national security.</li>
      </ul>
    </div>

    {/* 📡 Technical Features */}
    <div className="p-6 bg-gray-800 bg-opacity-90 rounded-lg shadow-lg border border-gray-700">
      <h2 className="text-3xl sm:text-4xl font-extrabold text-purple-400 tracking-wide">🔧 Technical Features</h2>
      <ul className="mt-4 list-disc pl-6 space-y-3 text-lg">
        <li>🚀 **Real-Time Data Updates** - Fetches & updates satellite positions every few seconds.</li>
        <li>🌌 **Interactive 3D Visualization** - Uses <strong>Three.js</strong> for realistic rendering.</li>
        <li>🛰️ **Orbit Path Calculation** - Predicts movement using **Keplerian elements**.</li>
        <li>🎯 **Click & Track** - Select a satellite to focus and get detailed real-time data.</li>
        <li>🔍 **Sidebar Filtering** - Advanced search and filter options for easy navigation.</li>
      </ul>
    </div>

    {/* 🚀 Future Enhancements */}
    <div className="p-6 bg-gray-800 bg-opacity-90 rounded-lg shadow-lg border border-gray-700">
      <h2 className="text-3xl sm:text-4xl font-extrabold text-red-400 tracking-wide">🚀 Future Enhancements</h2>
      <ul className="mt-4 list-disc pl-6 space-y-3 text-lg">
        <li>🤖 **AI-Powered Anomaly Detection** - Detects unexpected orbital deviations.</li>
        <li>🌞 **Space Weather Integration** - Displays solar activity and geomagnetic storm risks.</li>
        <li>🕰️ **Historical Data Replay** - Play back satellite movements over time.</li>
        <li>📊 **Enhanced UI & Analytics** - Improved user control and data visualization.</li>
      </ul>
    </div>

    {/* 🌌 Space Exploration & New Missions */}
    <div className="p-6 bg-gray-800 bg-opacity-90 rounded-lg shadow-lg border border-gray-700">
      <h2 className="text-3xl sm:text-4xl font-extrabold text-pink-400 tracking-wide">🌌 Exploring the Future of Space</h2>
      <p className="mt-4 text-lg leading-relaxed">
        With the rise of **mega-constellations** like Starlink and OneWeb, and the launch of deep-space missions, tracking satellites is more 
        important than ever. Future versions of this platform could support real-time monitoring of **lunar bases**, **interplanetary probes**, 
        and even **Mars-bound spacecraft**.
      </p>
    </div>

    {/* 📜 Additional Resources */}
    <div className="p-6 bg-gray-800 bg-opacity-90 rounded-lg shadow-lg border border-gray-700">
      <h2 className="text-3xl sm:text-4xl font-extrabold text-cyan-400 tracking-wide">📜 Additional Resources</h2>
      <ul className="mt-4 list-disc pl-6 space-y-3 text-lg">
        <li><a href="https://www.celestrak.com/" className="text-blue-400 hover:underline hover:text-blue-300" target="_blank">🌍 CelesTrak - Satellite Data & TLE</a></li>
        <li><a href="https://www.n2yo.com/" className="text-blue-400 hover:underline hover:text-blue-300" target="_blank">🛰️ N2YO - Live Satellite Tracking</a></li>
        <li><a href="https://spaceweather.com/" className="text-blue-400 hover:underline hover:text-blue-300" target="_blank">☀️ Space Weather Updates</a></li>
        <li><a href="https://www.nasa.gov/" className="text-blue-400 hover:underline hover:text-blue-300" target="_blank">🚀 NASA Official Website</a></li>
      </ul>
    </div>

  </div>

</div>
</div>

);
}