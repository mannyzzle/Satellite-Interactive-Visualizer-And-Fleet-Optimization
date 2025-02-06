// src/pages/Home.jsx

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import Navbar from "../components/Navbar";  // ✅ Ensure correct path

import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader";
import { fetchSatellites } from "../api/satelliteService";

const dayTexture = "/assets/earth_day.jpg";
const nightTexture = "/assets/earth_night.jpg";
const satelliteModelPath = "/assets/satellite.glb";
const cloudTexture = "/assets/clouds.png";

export default function Home() {
  const orbitPathsRef = useRef([]); // 🛰 Track all orbit paths
  const sceneRef = useRef(null);  // ✅ Store scene reference
  const selectedPointerRef = useRef(null); // 🔼 Arrow Pointer
  const cameraRef = useRef(null);  // Stores camera
  const cameraTargetRef = useRef(null);  // Stores smooth transition target
  const mountRef = useRef(null);
  const [satellites, setSatellites] = useState([]);
  const satelliteObjectsRef = useRef({}); // ✅ Use a ref for real-time updates
  const [selectedSatellite, setSelectedSatellite] = useState(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1); // 🚀 Current page of satellites
  const [searchQuery, setSearchQuery] = useState("");  // 🔍 For filtering satellites
  const [sidebarOpen, setSidebarOpen] = useState(true); // 📌 Sidebar toggle state
  useEffect(() => {
    console.log("📌 Sidebar State Updated:", sidebarOpen);
  }, [sidebarOpen]);
  

  const filteredSatellites = satellites.filter((sat) =>
  sat.name.toLowerCase().includes(searchQuery.toLowerCase())
);




  function computeSatellitePosition(satellite, time) {
    const { inclination, raan, arg_perigee, semi_major_axis, eccentricity, mean_motion, epoch } = satellite;
  
    const mu = 398600.4418; // Earth's gravitational parameter (km^3/s^2)
    const a = semi_major_axis; // Semi-major axis in km
    const n = (2 * Math.PI) / (satellite.period * 60); // Mean motion in rad/s
    const M = n * (time - new Date(epoch).getTime() / 1000); // Mean anomaly
  
    // Solve Kepler's equation for eccentric anomaly E (approximation)
    let E = M;
    for (let i = 0; i < 10; i++) {
      E = M + eccentricity * Math.sin(E);
    }
  
    // Compute true anomaly
    const nu = 2 * Math.atan2(
      Math.sqrt(1 + eccentricity) * Math.sin(E / 2),
      Math.sqrt(1 - eccentricity) * Math.cos(E / 2)
    );
  
    // Compute satellite position in orbital plane
    const r = a * (1 - eccentricity * Math.cos(E));
    const x_orb = r * Math.cos(nu);
    const y_orb = r * Math.sin(nu);
  
    // Convert to 3D coordinates using rotation matrices
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

  

  function smoothCameraTransition(targetPosition) {
    if (!cameraRef.current) return;
  
    const startPos = cameraRef.current.position.clone();
    const targetPos = targetPosition.clone().multiplyScalar(1.8); // Maintain zoom distance
  
    let t = 0;
    function moveCamera() {
      t += 2; // Speed factor
  
      // 🚀 Adjust speed dynamically based on distance
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
  
  
  
  




  function focusOnSatellite(sat) {
    if (!sat) return;
  
    console.log('🚀 Focusing on satellite: ${sat.name} (NORAD: ${sat.norad_number})');
  
    setSelectedSatellite(sat);
    localStorage.setItem("selectedSatellite", JSON.stringify(sat));
  
    const scene = sceneRef.current;
    if (!scene) {
      console.error("⚠️ Scene is not available!");
      return;
    }
  
    const satModel = satelliteObjectsRef.current[sat.norad_number];
  
    if (!satModel) {
      console.warn('⚠️ Satellite model ${sat.name} not found, retrying...');
      setTimeout(() => focusOnSatellite(sat), 500); // Retry after a short delay
      return;
    }
  
    // ✅ Remove previous marker properly
    resetMarker();
  
    // ✅ Create a new marker for the selected satellite
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
  
    // ✅ Store reference to marker & satellite
    scene.add(marker);
    selectedPointerRef.current = marker;
    selectedPointerRef.current.userData.followingSatellite = sat.norad_number;
  
    console.log("📍 New marker added at:", selectedPointerRef.current.position);
  
    // ✅ Move Camera Immediately After Satellite is Found
    smoothCameraTransition(satModel.position);
  }
  
  
  
  
  
  
  
  
  

  function createStarField(scene, numStars = 140000) {
    const starGeometry = new THREE.BufferGeometry();
    const starMaterial = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 0.02,  // Size of stars
    });
  
    const starVertices = [];
    for (let i = 0; i < numStars; i++) {
      const x = (Math.random() - 0.5) * 500; // Random position in space
      const y = (Math.random() - 0.5) * 500;
      const z = (Math.random() - 0.5) * 500;
      starVertices.push(x, y, z);
    }
  
    starGeometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(starVertices, 3)
    );
  
    const starField = new THREE.Points(starGeometry, starMaterial);
    scene.add(starField);
  }
  



  function createSun(scene, light) {
    const textureLoader = new THREE.TextureLoader();
    const sunTexture = textureLoader.load("/assets/sun_texture.jpg"); // 🔥 Use a Sun texture
  
    const sunGeometry = new THREE.SphereGeometry(20, 64, 64); // 🔥 Increase size
    const sunMaterial = new THREE.MeshStandardMaterial({
      map: sunTexture, // 🌞 Apply Sun texture
      emissive: 0xffff00,  
      emissiveIntensity: 2, 
      emissiveMap: sunTexture,  // Make it glow
    });
  
    const sun = new THREE.Mesh(sunGeometry, sunMaterial);
    sun.position.set(600, 50, 0); // Move it far away from Earth
  
    light.position.copy(sun.position); // Ensure light source comes from the Sun
    scene.add(sun);
  }
  
  

// 🛰 Function to Generate Orbit Path
const createOrbitPath = (satellite) => {
  if (!satellite || !satellite.period) return null;

  const numPoints = 100;
  const orbitPoints = [];

  for (let i = 0; i <= numPoints; i++) {
    const timeOffset = (i / numPoints) * satellite.period * 60;
    const position = computeSatellitePosition(satellite, Date.now() / 1000 + timeOffset);
    
    if (!position) continue; // Avoid errors with undefined positions

    orbitPoints.push(new THREE.Vector3(position.x, position.y, position.z));
  }

  if (orbitPoints.length === 0) return null;

  const orbitGeometry = new THREE.BufferGeometry().setFromPoints(orbitPoints);
  const orbitMaterial = new THREE.LineBasicMaterial({ color: 0x89CFF0, opacity: 0.5, transparent: true });

  const orbitLine = new THREE.Line(orbitGeometry, orbitMaterial);

  // ✅ Mark orbits as non-pickable
  orbitLine.userData.ignoreRaycast = true;

  return orbitLine;
};


  




// 🛰 Function to Load Satellite Models
const loadSatelliteModel = (satellite) => {
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

      console.log('📡 Satellite model added: ${satellite.name} (${satellite.norad_number})');
    },
    undefined,
    (error) => {
      console.error("❌ Error loading satellite model:", error);
    }
  );
};




useEffect(() => {
  // ✅ Immediately clear the selected satellite & show loading state
  setSelectedSatellite(null);
  localStorage.removeItem("selectedSatellite"); // ❌ Remove saved selection to prevent restoring old data
  setLoading(true);
  setSatellites([]); // 🚀 Clear satellite list before fetching

  fetchSatellites(page, 100)
    .then((data) => {
      if (data && data.satellites) {
        console.log("🛰️ Satellites loaded:", data.satellites.length);
        setSatellites(data.satellites);
      } else {
        console.warn("⚠️ No satellites found!");
      }
      setLoading(false);
    })
    .catch((error) => {
      console.error("❌ Error fetching satellites:", error);
      setLoading(false);
    });
}, [page]); // ✅ Runs when the page changes




  



// ✅ Remove all orbit paths before adding new ones
const resetOrbits = () => {
  if (orbitPathsRef.current.length > 0) {
    orbitPathsRef.current.forEach((orbit) => {
      if (sceneRef.current) {
        sceneRef.current.remove(orbit);
      }
    });
    orbitPathsRef.current = []; // Clear the reference
    console.log("🗑️ Cleared previous orbits!");
  }
};



useEffect(() => {
  const savedSatellite = localStorage.getItem("selectedSatellite");

  // 🚀 Only restore if no satellite is currently selected AND it's NOT a new page load
  if (!selectedSatellite && savedSatellite && page === 1) {
    const parsedSat = JSON.parse(savedSatellite);
    console.log("🔄 Restoring selected satellite from storage:", parsedSat.name);

    setSelectedSatellite(parsedSat);
    
    // ✅ Only move camera if satellite model is available
    setTimeout(() => {
      if (satelliteObjectsRef.current[parsedSat.norad_number]) {
        focusOnSatellite(parsedSat);
      }
    }, 500);
  }
}, [satellites, page]); // ✅ Runs when satellites or page updates


const addOrbitPaths = () => {
  resetOrbits(); // 🚀 Clear old orbits first

  Object.values(satelliteObjectsRef.current).forEach((satelliteModel) => {
    if (!satelliteModel.userData) return;

    const orbitLine = createOrbitPath(satelliteModel.userData);
    if (orbitLine) {
      if (sceneRef.current) {
        sceneRef.current.add(orbitLine);
      }
      orbitPathsRef.current.push(orbitLine); // ✅ Track this orbit
    }
  });

  console.log('🛰️ Added ${orbitPathsRef.current.length} orbit paths.');
};



// ✅ 2️⃣ Function to Reset Marker
function resetMarker() {
  if (selectedPointerRef.current) {
    console.log("🗑️ Removing previous marker...");
    sceneRef.current.remove(selectedPointerRef.current);
    selectedPointerRef.current.geometry.dispose();
    selectedPointerRef.current.material.dispose();
    selectedPointerRef.current = null;
  }
}

// ✅ 3️⃣ Load Satellite Models (Remove Old Models & Reset Marker)

useEffect(() => {
  if (satellites.length === 0) return;

  console.log("🚀 Loading satellite models...");
  
  // 🗑️ Remove old satellites before adding new ones
  Object.values(satelliteObjectsRef.current).forEach((satModel) => {
    if (sceneRef.current) {
      sceneRef.current.remove(satModel);
    }
  });

  satelliteObjectsRef.current = {}; // Reset reference
  resetMarker(); // 🔄 Ensure marker is removed

  satellites.forEach((sat) => loadSatelliteModel(sat));

  // 🔄 Wait for models to load, then add orbits
  setTimeout(() => {
    addOrbitPaths();
  }, 500);
}, [satellites]); // ✅ Runs when satellites update




// ✅ 4 Main Scene Setup
useEffect(() => {
  

  if (!mountRef.current) {
    console.error("⚠️ mountRef is null! Three.js won't render.");
    return;
  }

  // 🌍 Scene Setup
  const scene = new THREE.Scene();
  sceneRef.current = scene;

  const camera = new THREE.PerspectiveCamera(
    50,
    window.innerWidth / window.innerHeight,
    .5,
    9000
  );
  cameraRef.current = camera;

  createStarField(scene);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(mountRef.current.clientWidth, mountRef.current.clientHeight);
  renderer.setPixelRatio(window.devicePixelRatio);
  mountRef.current.appendChild(renderer.domElement);


// ✅ Resize Renderer on Window Resize
const resizeRenderer = () => {
  const width = window.innerWidth;
  const height = window.innerHeight;

  // ✅ Update Camera Aspect Ratio
  camera.aspect = width / height;
  camera.updateProjectionMatrix();

  // ✅ Resize Renderer
  renderer.setSize(width, height);
  renderer.setPixelRatio(window.devicePixelRatio);
};

// 🛠️ Add Resize Event Listener
window.addEventListener("resize", resizeRenderer);

  
  // 🌍 Load Earth Textures
  const textureLoader = new THREE.TextureLoader();
  const dayMap = textureLoader.load(dayTexture);
  const nightMap = textureLoader.load(nightTexture);
  const clouds = textureLoader.load(cloudTexture);
  

  // 🛰 Create Earth
const globe = new THREE.Mesh(
  new THREE.SphereGeometry(5, 64, 64), // Increased segments for smoother surface
  new THREE.MeshStandardMaterial({
    map: dayMap, // 🌞 Day texture
    emissiveMap: nightMap, // 🌒 Night texture for city lights
    emissiveIntensity: .1, // Glow effect for night-side
    emissive: new THREE.Color(0xffffff), // White glow for night-side
    bumpScale: 0.5, // Adjusted for a more natural relief
    roughness: 1.5, // Less rough for smoother land areas
    metalness: .7, // Slight reflectivity for oceans
  })
);

// ☁️ Simulated Cloud Layer (Soft White Noise Effect)
const cloudMaterial = new THREE.MeshStandardMaterial({
  map: clouds,
  transparent: true,  // Ensures the black background is removed
  opacity: 0.8,       // Adjust for realism (0.4 - 0.7 works best)
  depthWrite: false,  // Prevents z-fighting with the Earth sphere
  side: THREE.DoubleSide, // Visible from both sides
});

// 🌫 Add a Subtle Atmosphere Glow Effect
const atmosphere = new THREE.Mesh(
  new THREE.SphereGeometry(5.03, 64, 64), // Slightly larger than Earth
  new THREE.MeshBasicMaterial({
    color: 0x3399ff, // Soft blue atmosphere
    transparent: true,
    opacity: .5, // Very light glow
    side: THREE.BackSide, // Makes it appear like an aura
  })
);

// 🌫️ Use a Sphere with Noise for Clouds
const cloudGeometry = new THREE.SphereGeometry(5.025, 64, 64); // Slightly larger than Earth
const cloudMesh = new THREE.Mesh(cloudGeometry, cloudMaterial);


scene.add(cloudMesh);
scene.add(globe);
scene.add(atmosphere);

  // 🌞 Lighting
  const light = new THREE.DirectionalLight(0xffffff, 4.5);
  light.position.set(200, 50, 0);
  scene.add(light);

  createSun(scene, light);

  // 🖱 Orbit Controls
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableZoom = true;
  controls.enablePan = false;
  controls.enableDamping = true;
  controls.dampingFactor = 0.1;
  controls.rotateSpeed = 0.8;
  controls.minDistance = 7;
  controls.maxDistance = 100;
  camera.position.set(0, 3, 5);

  // 🎯 Click Detection for Satellites (Fix: Prevent Null Selection)
window.addEventListener("click", (event) => {
  mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera(mouse, cameraRef.current);

  const intersects = raycaster.intersectObjects(sceneRef.current.children, true);

  const clickedSatellite = intersects.find((obj) => {
    return obj.object.userData && !obj.object.userData.ignoreRaycast;
  })?.object.userData;

  if (clickedSatellite) {
    console.log('🛰 Satellite clicked: ${clickedSatellite.name} (NORAD: ${clickedSatellite.norad_number})');
    setSelectedSatellite(clickedSatellite);
  } else {
    console.warn("⚠️ Clicked empty space - Keeping previous satellite selection.");
  }
});

  

  // ANIMATION ZONE

  const animate = () => {
    requestAnimationFrame(animate);
  
    // 🌍 Realistic Earth Rotation
    globe.rotation.y += 0.0000727;
    cloudMesh.rotation.y += 0.00009;
  
    const timeFactor = 30;
    const time = Date.now() / 1000;
  
    // 🔄 Update Satellite Positions
    Object.values(satelliteObjectsRef.current).forEach((satelliteModel) => {
      if (satelliteModel.userData) {
        const newPos = computeSatellitePosition(satelliteModel.userData, time * timeFactor);
        if (newPos) {
          satelliteModel.position.lerp(newPos, 0.2);
          satelliteModel.userData.latestPosition = newPos;
        }
      }
    });
  
    // ✅ Keep Marker Following the Satellite
    if (selectedPointerRef.current && selectedPointerRef.current.userData.followingSatellite) {
      const followedSat = satelliteObjectsRef.current[selectedPointerRef.current.userData.followingSatellite];
  
      if (followedSat) {
        selectedPointerRef.current.position.copy(followedSat.position);
        selectedPointerRef.current.lookAt(new THREE.Vector3(0, 0, 0));
      }
    }
  
    // ✅ Keep Camera Focused on Last Selected Satellite (Even After Refresh)
    if (selectedSatellite && satelliteObjectsRef.current[selectedSatellite.norad_number]) {
      const satPosition = satelliteObjectsRef.current[selectedSatellite.norad_number].position;
      cameraRef.current.position.lerp(satPosition.clone().multiplyScalar(1.5), 0.05);
      cameraRef.current.lookAt(satPosition);
    }
  
    controls.update();
    renderer.render(scene, cameraRef.current);
  };
  
  
  animate();
  

  return () => {
    window.removeEventListener("resize", resizeRenderer);
    if (mountRef.current && mountRef.current.contains(renderer.domElement)) {
      mountRef.current.removeChild(renderer.domElement);
    }
  };

}, []);


return (
  <div className="flex flex-col min-h-screen w-screen overflow-hidden">
    {/* 📌 Navbar - Stays Fixed at the Top */}
    <Navbar />

    {/* 🌍 Main Layout - Sidebar + 3D UI + Bottom Info Box (Fixed Together) */}
    <div className="relative flex flex-1">
      
      {/* 📌 Sidebar - Stays Fixed with 3D UI */}
      <div className="relative flex flex-col h-[89vh]">
        <div
          className={`absolute top-0 left-0 h-full bg-gray-900 text-white p-4 overflow-y-auto shadow-lg transition-transform duration-300 ease-in-out w-64 md:w-1/8 z-40 ${
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

          {/* Sidebar Satellite List */}
{loading ? (
  <p className="text-center text-gray-400">Loading...</p>
) : satellites.length === 0 ? (  // ✅ Show "No satellites found" when list is empty
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
        }}
      >
        <span className="block w-full">{sat.name}</span>
      </li>
    ))}
  </ul>
)}

          {/* 🚀 Satellite Navigation */}
<div className="flex justify-between items-center mt-4">
  <button
    onClick={() => setPage((prev) => Math.max(prev - 1, 1))}
    disabled={page === 1 || loading} // ✅ Disable if loading or at first page
    className={`px-3 py-2 bg-gray-700 text-white rounded-md shadow-md hover:bg-gray-600 transition-all ${
      page === 1 || loading ? "opacity-50 cursor-not-allowed" : ""
    }`}
  >
    ← Prev
  </button>

  <span className="text-sm text-gray-300">Page {page}</span>

  <button
    onClick={() => setPage((prev) => prev + 1)}
    disabled={loading} // ✅ Disable if loading
    className={`px-3 py-2 bg-gray-700 text-white rounded-md shadow-md hover:bg-gray-600 transition-all ${
      loading ? "opacity-50 cursor-not-allowed" : ""
    }`}
  >
    Next →
  </button>
</div>

        </div>

        {/* 📌 Sidebar Toggle Button - Moves with Sidebar */}
        <button
          onClick={() => setSidebarOpen((prev) => !prev)}
          className={`absolute top-1/2 transform -translate-y-1/2 bg-gray-800 text-white px-3 py-2 rounded-r-md shadow-md hover:bg-gray-700 transition-all duration-300 z-50 ${
            sidebarOpen ? "left-[16rem] md:left-1/8" : "left-0"
          }`}
        >
          {sidebarOpen ? "←" : "→"}
        </button>
      </div>

      {/* 🌍 3D UI + Sidebar + Bottom Info Box Sticking Together */}
      <div className="relative flex-1 flex flex-col">
        
        {/* 🛰️ 3D UI - Stays Fixed with Sidebar & Info Box */}
        <div className="relative w-full h-[100vh]">
          <div ref={mountRef} className="absolute top-0 left-0 w-full h-full" />
        </div>

        {/* 🛰️ Satellite Info Box - STAYS WITH THE 3D UI */}
<div
  className={`absolute bottom-0 bg-gray-900 text-yellow-300 p-3 shadow-lg text-xs border-t border-gray-700 flex flex-col items-center h-24 w-full z-[60] transition-all duration-300 ease-in-out`}
>
  {loading ? (
    // 🌀 Show Loading Animation
    <div className="flex items-center justify-center h-full">
      <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-yellow-300 border-opacity-75"></div>
    </div>
  ) : !selectedSatellite ? (
    // ✨ Show "Make a Selection" Message
    <div className="flex items-center justify-center h-full text-yellow-400 font-semibold">
      <p>🔍 Make a selection to view details</p>
    </div>
  ) : (
    // ✅ Show Satellite Info Once Selected
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