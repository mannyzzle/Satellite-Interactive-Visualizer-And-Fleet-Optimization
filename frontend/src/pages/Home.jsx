// src/pages/Home.jsx

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import Navbar from "../components/Navbar";  // ✅ Ensure correct path
import { useCallback } from "react";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader";
import { fetchSatellites } from "../api/satelliteService";

const dayTexture = "/assets/earth_day.jpg";
const nightTexture = "/assets/earth_night.jpg";
const satelliteModelPath = "/assets/satellite.glb";
const cloudTexture = "/assets/clouds.png";


export default function Home() {
  const globeRef = useRef(null);
  const cloudRef = useRef(null);
  const atmosphereRef = useRef(null);
  const sunRef = useRef(null);


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
  const limit = 50;
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

  

  // ✅ Function to Compute Satellite Position
  function computeSatellitePosition(satellite, time) {
    const { inclination, raan, arg_perigee, semi_major_axis, eccentricity, mean_motion, epoch } = satellite;
  
    const mu = 398600.4418; // Earth's gravitational parameter (km^3/s^2)
    const a = semi_major_axis; // Semi-major axis in km
    const n = (2 * Math.PI) / (satellite.period * 60); // Mean motion in rad/s
    const M = n * (time - new Date(epoch).getTime() / 1000); // Mean anomaly

    let E = M;
    for (let i = 0; i < 10; i++) {
      E = M + eccentricity * Math.sin(E);
    }
  
  

    const nu = 2 * Math.atan2(
      Math.sqrt(1 + eccentricity) * Math.sin(E / 2),
      Math.sqrt(1 - eccentricity) * Math.cos(E / 2)
    );

    const r = a * (1 - eccentricity * Math.cos(E));
    const x_orb = r * Math.cos(nu);
    const y_orb = r * Math.sin(nu);

    const cos_raan = Math.cos(raan * (Math.PI / 180));
    const sin_raan = Math.sin(raan * (Math.PI / 180));
    const cos_inc = Math.cos(inclination * (Math.PI / 180));
    const sin_inc = Math.sin(inclination * (Math.PI / 180));
    const cos_argp = Math.cos(arg_perigee * (Math.PI / 180));
    const sin_argp = Math.sin(arg_perigee * (Math.PI / 180));

    const x = x_orb * (cos_raan * cos_argp - sin_raan * sin_argp * cos_inc) - y_orb * (cos_raan * sin_argp + sin_raan * cos_argp * cos_inc);
    const y = x_orb * (sin_raan * cos_argp + cos_raan * sin_argp * cos_inc) - y_orb * (sin_raan * sin_argp - cos_raan * cos_argp * cos_inc);
    const z = x_orb * (sin_argp * sin_inc) + y_orb * (cos_argp * sin_inc);

    return new THREE.Vector3(x / 1000, y / 1000, z / 1000); // Scale down for visualization
  }



  // ✅ Create Orbit Paths
  function addOrbitPaths() {
    if (!sceneRef.current) return;
    
    // ✅ Remove old orbits
    orbitPathsRef.current.forEach((orbit) => {
      sceneRef.current.remove(orbit);
    });
    orbitPathsRef.current = [];

    Object.values(satelliteObjectsRef.current).forEach((satelliteModel) => {
      if (!satelliteModel.userData) return;

      const orbitLine = createOrbitPath(satelliteModel.userData);
      if (orbitLine) {
        sceneRef.current.add(orbitLine);
        orbitPathsRef.current.push(orbitLine);
      }
    });

    console.log(`🛰️ Added ${orbitPathsRef.current.length} orbit paths.`);
  }

  // ✅ Compute Orbit Path for a Satellite
  function createOrbitPath(satellite) {
    if (!satellite || !satellite.period) return null;

    const numPoints = 100;
    const orbitPoints = [];

    for (let i = 0; i <= numPoints; i++) {
      const timeOffset = (i / numPoints) * satellite.period * 60;
      const position = computeSatellitePosition(satellite, Date.now() / 1000 + timeOffset);
      
      if (!position) continue;
      orbitPoints.push(new THREE.Vector3(position.x, position.y, position.z));
    }

    if (orbitPoints.length === 0) return null;

    const orbitGeometry = new THREE.BufferGeometry().setFromPoints(orbitPoints);
    const orbitMaterial = new THREE.LineBasicMaterial({ color: 0x89CFF0, opacity: 0.5, transparent: true });

    return new THREE.Line(orbitGeometry, orbitMaterial);
  }
  

  //  ✅ Reset Marker Function
  function resetMarker() {
    if (selectedPointerRef.current) {
      sceneRef.current.remove(selectedPointerRef.current);
      selectedPointerRef.current.geometry.dispose();
      selectedPointerRef.current.material.dispose();
      selectedPointerRef.current = null;
    }
  }



  // ✅ Smooth Camera Transition Function
  function smoothCameraTransition(targetPosition) {
    if (!cameraRef.current) return;

    const startPos = cameraRef.current.position.clone();
    const targetPos = targetPosition.clone().multiplyScalar(1.8);

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





// ✅ Load Satellite Model (Ensuring No Duplicates)
const loadSatelliteModel = (satellite) => {
  console.log(`🔄 Loading model for: ${satellite.name} (${satellite.norad_number})`);

  const loader = new GLTFLoader();
  
  loader.load(
    satelliteModelPath,
    (gltf) => {
      const satelliteModel = gltf.scene;
      satelliteModel.scale.set(0.00005, 0.00005, 0.00005);

      // 🚀 Compute Initial Position
      const initialPos = computeSatellitePosition(satellite, Date.now() / 1000);
      satelliteModel.position.copy(initialPos);

      // ✅ Ensure satellite is oriented properly
      satelliteModel.lookAt(new THREE.Vector3(0, 0, 0));
      satelliteModel.rotateX(-Math.PI / 2);
      satelliteModel.rotateY(-Math.PI / 2);

      // ✅ Attach metadata
      satelliteModel.userData = satellite;

      // ✅ Store satellite model in reference
      satelliteObjectsRef.current[satellite.norad_number] = satelliteModel;

      // ✅ Add satellite model to scene
      if (sceneRef.current) {
        sceneRef.current.add(satelliteModel);
      }

      console.log(`📡 Satellite model added: ${satellite.name} (${satellite.norad_number})`);
    },
    undefined,
    (error) => {
      console.error("❌ Error loading satellite model:", error);
    }
  );
};





useEffect(() => {
  if (!satellites.length) {
    console.warn("⚠️ No satellites to load, waiting for fetch...");
    return;
  }

  console.log("🚀 Loading satellite models...");
  
  const newSatelliteIds = new Set(satellites.map((s) => s.norad_number));
  Object.keys(satelliteObjectsRef.current).forEach((norad_number) => {
    if (!newSatelliteIds.has(Number(norad_number))) {
      console.log(`🗑️ Removing old satellite: ${norad_number}`);
      if (sceneRef.current) sceneRef.current.remove(satelliteObjectsRef.current[norad_number]);
      delete satelliteObjectsRef.current[norad_number];
    }
  });

  resetMarker(); // 🔄 Ensure marker is removed

  // ✅ Load only missing satellites with a short delay to prevent blocking UI
  setTimeout(() => {
    satellites.forEach((sat) => {
      if (!satelliteObjectsRef.current[sat.norad_number]) {
        loadSatelliteModel(sat);
      }
    });

    addOrbitPaths(); // 🚀 Ensure orbit paths are updated after loading
  }, 500);
}, [satellites]);


const changePage = (newPage) => {
  if (newPage < 1 || loading) return;  // Prevent invalid pages or duplicate requests

  console.log(`📄 Changing to page: ${newPage}`);
  setPage(newPage);  // ✅ Update the page state
  setSidebarOpen(false);  // ✅ Close sidebar when changing pages
};




useEffect(() => {
  console.log("📌 Page changed! Resetting selection and clearing old satellites.");
  
  setSelectedSatellite(null); // ✅ Reset selected satellite
  setIsTracking(false); // ✅ Stop tracking so new selections work properly
  setSidebarOpen(false); 
  localStorage.removeItem("selectedSatellite"); // ✅ Ensure old satellite selection is removed

  // 🚨 Remove Old Marker
  if (selectedPointerRef.current) {
    console.log("🗑️ Removing old marker...");
    sceneRef.current.remove(selectedPointerRef.current);
    selectedPointerRef.current.geometry.dispose();
    selectedPointerRef.current.material.dispose();
    selectedPointerRef.current = null;
  }

  // 🚨 Remove All Previous Satellites From Scene
  Object.keys(satelliteObjectsRef.current).forEach((norad_number) => {
    if (sceneRef.current) sceneRef.current.remove(satelliteObjectsRef.current[norad_number]);
    delete satelliteObjectsRef.current[norad_number];
  });

  const getSatellites = async () => {
    setLoading(true);
    setSatellites([]); // ✅ Clear previous satellites before fetching new ones
    setSelectedSatellite(null); // ✅ Reset selection on page change
    localStorage.removeItem("selectedSatellite"); // ✅ Prevent persistence of outdated data

    try {
      const data = await fetchSatellites(page, limit);
      console.log(`📡 Fetched ${data.satellites.length} satellites for page ${page}`);
      setSatellites(data.satellites);
    } catch (error) {
      console.error("❌ Error fetching satellites:", error);
    } finally {
      setLoading(false);
    }
  };

  getSatellites();
}, [page]); // ✅ Runs when the page changes




const focusOnSatellite = useCallback((sat) => {
  if (!sat) return;

  console.log(`🚀 Focusing on satellite: ${sat.name} (NORAD: ${sat.norad_number})`);
  setSelectedSatellite(sat);
  setIsTracking(true); // ✅ Ensure tracking starts
  localStorage.setItem("selectedSatellite", JSON.stringify(sat));

  const checkModelLoaded = () => {
    const satModel = satelliteObjectsRef.current[sat.norad_number];

    if (!satModel || !satModel.position) {
      console.warn(`⚠️ Satellite model ${sat.name} not found, retrying...`);
      setTimeout(checkModelLoaded, 500);
      return;
    }

    resetMarker();

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
      smoothCameraTransition(satModel.position);
    }

    console.log("📡 Tracking Enabled!");
  };

  checkModelLoaded();
}, [setSelectedSatellite, setIsTracking, sceneRef, selectedPointerRef, cameraRef]);




useEffect(() => {
  if (selectedSatellite && isTracking) {
    console.log(`📌 Tracking satellite: ${selectedSatellite.name} (NORAD: ${selectedSatellite.norad_number})`);
  }
}, [selectedSatellite, isTracking]);




useEffect(() => {
  if (loading) {
    console.log("⏳ Waiting for satellites...");
  } else if (satellites.length > 0) {
    console.log(`📌 Sidebar Updated: ${satellites.length} satellites available.`);
  } else {
    console.warn("⚠️ Sidebar has no satellites, waiting for fetch...");
  }
}, [satellites, loading]);



useEffect(() => {
  console.log("📌 Page changed! Resetting selection and tracking.");
  setSelectedSatellite(null);
  setIsTracking(false); // ✅ Reset tracking so new selections work properly
  localStorage.removeItem("selectedSatellite");
  selectedPointerRef.current = null; // ✅ Clear any lingering tracking
}, [page]);



// ✅ Load Satellite Models Only After Fetch Completes
useEffect(() => {
  if (!satellites.length) return;

  console.log("🚀 Loading satellite models...");
  
  const newSatelliteIds = new Set(satellites.map((s) => s.norad_number));
  
  Object.keys(satelliteObjectsRef.current).forEach((norad_number) => {
    if (!newSatelliteIds.has(Number(norad_number))) {
      console.log(`🗑️ Removing old satellite: ${norad_number}`);
      if (sceneRef.current) sceneRef.current.remove(satelliteObjectsRef.current[norad_number]);
      delete satelliteObjectsRef.current[norad_number];
    }
  });

  // ✅ Delay to allow UI updates before loading new satellites
  setTimeout(() => {
    satellites.forEach((sat) => {
      if (!satelliteObjectsRef.current[sat.norad_number]) {
        loadSatelliteModel(sat);
      }
    });

    addOrbitPaths();
  }, 300);
}, [satellites]);

const enableInteraction = () => {
  setIsInteractionEnabled(true);
  if (controlsRef.current) controlsRef.current.enabled = true;
};


// ✅ Restore Last Selected Satellite After Refresh
useEffect(() => {
  const savedSatellite = localStorage.getItem("selectedSatellite");

  if (savedSatellite) {
    console.log("🔄 Restoring last selected satellite...");
    const parsedSat = JSON.parse(savedSatellite);

    setSelectedSatellite(parsedSat);
    setIsTracking(true);  // ✅ Enable tracking after refresh if a satellite was selected

    const checkModelLoaded = () => {
      if (satelliteObjectsRef.current[parsedSat.norad_number]) {
        console.log(`📡 Satellite ${parsedSat.name} found! Moving camera...`);
        focusOnSatellite(parsedSat);
      } else {
        setTimeout(checkModelLoaded, 500);
      }
    };

    checkModelLoaded();
  } else {
    setIsTracking(false); // ✅ Disable tracking if no satellite is restored
  }
}, [satellites]);




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

  const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.5, 9000);
  camera.position.set(0, 5, 15);
  cameraRef.current = camera;

  const renderer = new THREE.WebGLRenderer({ antialias: true });
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

  // 🌫 **Atmosphere Glow**
  const atmosphere = new THREE.Mesh(
    new THREE.SphereGeometry(5.1, 64, 64),
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
      emissive: 0xffff00,
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

  // 🔄 **Animation Loop**
  const animate = () => {
    requestAnimationFrame(animate);

    if (globeRef.current) globeRef.current.rotation.y += 0.0000727;
    if (cloudRef.current) cloudRef.current.rotation.y += 0.00009;

    const time = Date.now() / 1000;
    const timeFactor = 30;

    Object.values(satelliteObjectsRef.current).forEach((satelliteModel) => {
      if (satelliteModel.userData) {
        const newPos = computeSatellitePosition(satelliteModel.userData, time * timeFactor);
        if (newPos) satelliteModel.position.lerp(newPos, 0.02);
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
    if (mountRef.current.contains(renderer.domElement)) {
      mountRef.current.removeChild(renderer.domElement);
    }
  };
}, []);


// ✅ Ensure Satellites Load Correctly Before Tracking
useEffect(() => {
  if (!satellites.length) {
    console.warn("⚠️ No satellites to load, waiting for fetch...");
    return;
  }

  console.log("🚀 Loading satellite models...");

  const newSatelliteIds = new Set(satellites.map((s) => s.norad_number));
  Object.keys(satelliteObjectsRef.current).forEach((norad_number) => {
    if (!newSatelliteIds.has(Number(norad_number))) {
      console.log(`🗑️ Removing old satellite: ${norad_number}`);
      if (sceneRef.current) sceneRef.current.remove(satelliteObjectsRef.current[norad_number]);
      delete satelliteObjectsRef.current[norad_number];
    }
  });

  resetMarker();

  setTimeout(() => {
    satellites.forEach((sat) => {
      if (!satelliteObjectsRef.current[sat.norad_number]) {
        loadSatelliteModel(sat);
      }
    });

    addOrbitPaths();
  }, 500);
}, [satellites]);






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





// ✅ Load Satellites (Does NOT interfere with tracking)
useEffect(() => {
  const getSatellites = async () => {
    setLoading(true);
    setSatellites([]); // ✅ Clear previous satellites before fetching new ones
    setSelectedSatellite(null); // ✅ Reset selection on page change
    localStorage.removeItem("selectedSatellite"); // ✅ Remove from localStorage

    try {
      console.log(`📡 Fetching satellites (page: ${page}, limit: ${limit})...`);
      const data = await fetchSatellites(page, limit);
      if (data?.satellites?.length) {
        setSatellites(data.satellites);
      } else {
        console.warn("⚠️ No satellites returned from API.");
      }
    } catch (error) {
      console.error("❌ Error fetching satellites:", error);
    } finally {
      setLoading(false);
    }
  };

  getSatellites();
}, [page, limit]); // ✅ Runs when page or limit changes







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












return (
  <div className="flex flex-col min-h-screen w-screen overflow-hidden">
    {/* 📌 Navbar */}
    <Navbar />

    {/* 🌍 Main Layout: Sidebar + 3D UI + Info Box */}
    <div className="relative flex flex-1">
      
      {/* 📌 Sidebar */}
      <div className="relative flex flex-col h-[89vh]">
      <div
  className={`absolute top-0 left-0 h-full bg-gray-900 text-white p-2 overflow-y-auto shadow-lg transition-transform duration-300 ease-in-out w-48 md:w-1/10 z-40 ${
    sidebarOpen ? "translate-x-0" : "-translate-x-full"
  }`}
>

          <h2 className="text-lg font-bold mb-2 text-center">Satellite List</h2>

          {/* 🔍 Search Input */}
          <input
            type="text"
            placeholder="Search satellites..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full p-2 mb-2 text-black rounded-md"
          />

          {/* 🚀 Satellite List */}
          {loading ? (
            <p className="text-center text-gray-400">Loading...</p>
          ) : satellites.length === 0 ? (
            <p className="text-center text-yellow-400 font-semibold">⚠️ No satellites available</p>
          ) : (
            <ul className="space-y-2">
              {satellites.map((sat) => (
                <li
                  key={sat.norad_number}
                  className={`cursor-pointer p-3 rounded-md text-center border border-gray-700 ${
                    selectedSatellite?.norad_number === sat.norad_number
                      ? "bg-blue-500 text-white border-blue-600"
                      : "bg-gray-700 hover:bg-gray-600"
                  }`}
                  onClick={() => {
                    console.log(`📡 Selecting satellite: ${sat.name} (NORAD: ${sat.norad_number})`);
                    focusOnSatellite(sat);
                    enableInteraction(); // ✅ Unlocks controls when satellite selected
                  }}
                >
                  <span className="block w-full">{sat.name}</span>
                </li>
              ))}
            </ul>
          )}

          {/* 🌍 Pagination Controls */}
          <div className="flex justify-between items-center mt-4">
            <button
              onClick={() => changePage(page - 1)}
              disabled={page === 1 || loading}
              className={`px-3 py-2 bg-gray-700 text-white rounded-md shadow-md hover:bg-gray-600 transition-all ${
                page === 1 || loading ? "opacity-50 cursor-not-allowed" : ""
              }`}
            >

              ← Prev
            </button>

            <span className="text-sm text-gray-300">Page {page}</span>

            <button
              onClick={() => changePage(page + 1)}
              disabled={loading || satellites.length < limit}
              className={`px-3 py-2 bg-gray-700 text-white rounded-md shadow-md hover:bg-gray-600 transition-all ${
                loading || satellites.length < limit ? "opacity-50 cursor-not-allowed" : ""
              }`}
            >
              Next →
            </button>
          </div>
        </div>

        {/* 📌 Sidebar Toggle */}
        <button
          onClick={() => setSidebarOpen((prev) => !prev)}
          className={`absolute top-1/2 transform -translate-y-1/2 bg-gray-800 text-white px-3 py-2 rounded-r-md shadow-md hover:bg-gray-700 transition-all duration-300 z-50 ${
            sidebarOpen ? "left-[12rem] md:left-1/10" : "left-0"
          }`}
        >
          {sidebarOpen ? "←" : "→"}
        </button>
      </div>

      {/* 🌍 3D UI + Sidebar + Info Box Sticking Together */}
      <div className="relative flex-1 flex flex-col">
        
        {/* 🛰️ 3D UI - Stays Fixed with Sidebar & Info Box */}
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

        {/* 🛰️ Satellite Info Box */}
        <div
          className="absolute bottom-0 bg-gray-900 text-yellow-300 p-3 shadow-lg text-xs border-t border-gray-700 flex flex-col items-center h-24 w-full z-[60] transition-all duration-300 ease-in-out"
        >
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
              <div className="flex flex-col items-center w-full text-center pb-1">
                <span className="font-bold text-yellow-400 text-sm">{selectedSatellite.name}</span>
                <span className="text-yellow-500 text-xs">
                  <strong>Last Update:</strong> {new Date(selectedSatellite.epoch).toLocaleString()}
                </span>
              </div>

              <div className="flex flex-wrap justify-center items-center space-x-4 overflow-x-auto whitespace-nowrap w-full px-4 text-center">
                <span><strong>NORAD:</strong> {selectedSatellite.norad_number}</span>
                <span><strong>Orbit:</strong> {selectedSatellite.orbit_type}</span>
                <span><strong>Velocity:</strong> {selectedSatellite.velocity} km/s</span>
                <span><strong>Inclination:</strong> {selectedSatellite.inclination}°</span>
                <span><strong>Latitude:</strong> {selectedSatellite.latitude?.toFixed(4)}°</span>
                <span><strong>Longitude:</strong> {selectedSatellite.longitude?.toFixed(4)}°</span>
                <span><strong>Apogee:</strong> {selectedSatellite.apogee} km</span>
                <span><strong>Perigee:</strong> {selectedSatellite.perigee} km</span>
              </div>
            </>
          )}
        </div>

      </div>
    </div>



    {/* 📜 Scrollable Content Below Everything (Responsive for Mobile & Desktop) */}
<div className="overflow-y-auto min-h-[200vh] bg-gray-800 text-white px-4 sm:px-6 lg:px-12 py-6 z-60">
  
  {/* 🛰️ About the Satellite Tracker */}
  <div className="max-w-full md:max-w-3xl mx-auto">
    <h2 className="text-xl sm:text-2xl font-bold">About the Satellite Tracker</h2>
    <p className="mt-4 text-sm sm:text-base">
      This satellite tracker allows you to visualize real-time satellite movements and orbital paths. 
      It provides a dynamic 3D visualization of Earth and its orbiting satellites, updating in real-time
      using precise orbital mechanics calculations.
    </p>
  </div>

  {/* 🛰️ How It Works */}
  <div className="max-w-full md:max-w-3xl mx-auto mt-8">
    <h2 className="text-xl sm:text-2xl font-bold">How It Works</h2>
    <p className="mt-4 text-sm sm:text-base">
      The satellites update dynamically based on real-time orbital calculations, and the 3D visualization keeps
      track of their motion using <strong>Three.js</strong> and <strong>TLE (Two-Line Element) propagation</strong>. 
      Each satellite's trajectory is calculated using **Keplerian orbital mechanics** to ensure accuracy.
    </p>
  </div>

  {/* 🌎 Real-World Applications */}
  <div className="max-w-full md:max-w-3xl mx-auto mt-8">
    <h2 className="text-xl sm:text-2xl font-bold">Real-World Applications</h2>
    <ul className="mt-4 list-disc pl-6 space-y-2 text-sm sm:text-base">
      <li><strong>Space Situational Awareness:</strong> Monitors space debris and ensures safe satellite operations.</li>
      <li><strong>Weather Monitoring:</strong> Tracks satellites like NOAA and GOES that provide weather updates.</li>
      <li><strong>GPS Navigation:</strong> Keeps track of positioning satellites like those in the GPS, Galileo, and GLONASS systems.</li>
      <li><strong>Telecommunications:</strong> Monitors satellites providing internet, TV, and radio signals.</li>
      <li><strong>Defense & Security:</strong> Tracks classified and military satellites for national security.</li>
    </ul>
  </div>

  {/* 📡 Technical Features */}
  <div className="max-w-full md:max-w-3xl mx-auto mt-8">
    <h2 className="text-xl sm:text-2xl font-bold">Technical Features</h2>
    <ul className="mt-4 list-disc pl-6 space-y-2 text-sm sm:text-base">
      <li><strong>Real-time Data Updates:</strong> Fetches and updates satellite positions every few seconds.</li>
      <li><strong>Interactive 3D Visualization:</strong> Uses <strong>Three.js</strong> for rendering Earth and satellites.</li>
      <li><strong>Orbit Path Calculation:</strong> Draws satellite orbits using **Keplerian elements**.</li>
      <li><strong>Click & Track:</strong> Select a satellite to focus the camera and display its live data.</li>
      <li><strong>Sidebar Filtering:</strong> Allows searching and filtering satellites by category.</li>
    </ul>
  </div>

  {/* 🚀 Future Enhancements */}
  <div className="max-w-full md:max-w-3xl mx-auto mt-8">
    <h2 className="text-xl sm:text-2xl font-bold">Future Enhancements</h2>
    <ul className="mt-4 list-disc pl-6 space-y-2 text-sm sm:text-base">
      <li><strong>AI-Powered Anomaly Detection:</strong> Identifies unexpected orbital changes.</li>
      <li><strong>Space Weather Integration:</strong> Shows solar activity that may affect satellites.</li>
      <li><strong>Historical Data Replay:</strong> Allows users to replay satellite movements over time.</li>
      <li><strong>Enhanced UI Controls:</strong> Improved filtering and data visualization for different satellite categories.</li>
    </ul>
  </div>

  {/* 🌌 Space Exploration & New Missions */}
  <div className="max-w-full md:max-w-3xl mx-auto mt-8">
    <h2 className="text-xl sm:text-2xl font-bold">Exploring the Future of Space</h2>
    <p className="mt-4 text-sm sm:text-base">
      The rise of **mega-constellations** like Starlink and OneWeb, as well as missions to the Moon and Mars, 
      highlights the growing importance of satellite tracking. This platform could be expanded to support 
      real-time tracking of **deep space probes**, **lunar gateways**, and **interplanetary missions**.
    </p>
  </div>

  {/* 📜 Additional Resources */}
  <div className="max-w-full md:max-w-3xl mx-auto mt-8">
    <h2 className="text-xl sm:text-2xl font-bold">Additional Resources</h2>
    <ul className="mt-4 list-disc pl-6 space-y-2 text-sm sm:text-base">
      <li><a href="https://www.celestrak.com/" className="text-blue-400 hover:underline" target="_blank">CelesTrak - Satellite Data & TLE</a></li>
      <li><a href="https://www.n2yo.com/" className="text-blue-400 hover:underline" target="_blank">N2YO - Live Satellite Tracking</a></li>
      <li><a href="https://spaceweather.com/" className="text-blue-400 hover:underline" target="_blank">Space Weather Updates</a></li>
      <li><a href="https://www.nasa.gov/" className="text-blue-400 hover:underline" target="_blank">NASA Official Website</a></li>
    </ul>
  </div>

</div>


  </div>
);
}