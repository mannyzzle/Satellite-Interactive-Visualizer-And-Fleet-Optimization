// src/pages/Home.jsx

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader";
import { fetchSatellites } from "../api/satelliteService";

const dayTexture = "/assets/earth_day.jpg";
const nightTexture = "/assets/earth_night.jpg";
const satelliteModelPath = "/assets/satellite.glb";

export default function Home() {
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
  const satellitesPerPage = 50; // 🌍 Number of satellites per page



  

  // ✅ Add the missing state here
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

  function focusOnSatellite(sat) {
    if (!sat) return;
  
    console.log('🚀 Focusing on satellite: ${sat.name} (NORAD: ${sat.norad_number})');
  
    setSelectedSatellite(sat); // ✅ Store new selected satellite
    localStorage.setItem("selectedSatellite", JSON.stringify(sat)); // ✅ Persist selection across refresh
  
    const scene = sceneRef.current;
    if (!scene) {
      console.error("⚠️ Scene is not available!");
      return;
    }
  
    const satModel = satelliteObjectsRef.current[sat.norad_number];
    if (!satModel) {
      console.warn("⚠️ Satellite model not found:", sat.name);
      return;
    }
  
    // ✅ Remove previous marker properly
    if (selectedPointerRef.current) {
      console.log("🗑️ Removing old marker from scene...");
      scene.remove(selectedPointerRef.current);
      selectedPointerRef.current.geometry.dispose();
      selectedPointerRef.current.material.dispose();
      selectedPointerRef.current = null;
    }
  
    // ✅ Create a new marker for the selected satellite
    const markerGeometry = new THREE.RingGeometry(0.2, 0.4, 32);
    const markerMaterial = new THREE.MeshBasicMaterial({
      color: 0xff0000, // 🔴 Red selection ring
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.8,
    });
  
    const marker = new THREE.Mesh(markerGeometry, markerMaterial);
    marker.position.copy(satModel.position);
    marker.lookAt(new THREE.Vector3(0, 0, 0));
  
    // ✅ Add the marker to the scene (not as a child of the satellite)
    scene.add(marker);
    selectedPointerRef.current = marker;
  
    console.log("📍 New marker added at:", selectedPointerRef.current.position);
    console.log("🛰️ Marker Parent Object:", selectedPointerRef.current.parent);
  
    // ✅ Smooth Camera Centering
    const targetPosition = satModel.position.clone();
    cameraTargetRef.current = targetPosition.clone().multiplyScalar(1.2);
  
    function animateCamera() {
      if (!cameraTargetRef.current) return;
  
      cameraRef.current.position.lerp(cameraTargetRef.current, 0.08);
      cameraRef.current.lookAt(targetPosition);
  
      if (cameraRef.current.position.distanceTo(cameraTargetRef.current) > 0.1) {
        requestAnimationFrame(animateCamera);
      } else {
        cameraTargetRef.current = null;
      }
    }
  
    animateCamera();
  }
  
  
  
  
  
  

  function createStarField(scene, numStars = 2000) {
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

      // ✅ Store satellite model
      satelliteObjectsRef.current[satellite.norad_number] = satelliteModel;
      
      // ✅ Add to scene (Make sure scene exists)
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

// ✅ 1️⃣ Fetch & Load Satellite Data (Reset Satellites & Marker)
useEffect(() => {
  setLoading(true);
  setSatellites([]); // 🚀 Reset satellites before fetching new batch
  setSelectedSatellite(null); // 🔴 Reset selected satellite
  resetMarker(); // 🔄 Reset marker

  fetchSatellites(page, 50).then((data) => {
    if (data && data.satellites) {
      console.log("🛰️ Satellites loaded:", data.satellites.length);
      setSatellites(data.satellites);
    }
    setLoading(false);
  });
}, [page]); // ✅ Runs when page changes


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
}, [satellites]); // ✅ Runs when satellites update



// ✅ 4 Main Scene Setup
useEffect(() => {
  const savedSatellite = localStorage.getItem("selectedSatellite");
  if (savedSatellite) {
    const parsedSat = JSON.parse(savedSatellite);
    setSelectedSatellite(parsedSat);
    console.log("🔄 Restoring selected satellite from storage:", parsedSat.name);
  }

  if (!mountRef.current) {
    console.error("⚠️ mountRef is null! Three.js won't render.");
    return;
  }

  // 🌍 Scene Setup
  const scene = new THREE.Scene();
  sceneRef.current = scene;

  const camera = new THREE.PerspectiveCamera(
    60,
    window.innerWidth / window.innerHeight,
    0.1,
    2000
  );
  cameraRef.current = camera;

  createStarField(scene);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(mountRef.current.clientWidth, mountRef.current.clientHeight);
  renderer.setPixelRatio(window.devicePixelRatio);
  mountRef.current.appendChild(renderer.domElement);

  // 🌍 Load Earth Textures
  const textureLoader = new THREE.TextureLoader();
  const dayMap = textureLoader.load(dayTexture);
  const nightMap = textureLoader.load(nightTexture);

  // 🛰 Create Earth
  const globe = new THREE.Mesh(
    new THREE.SphereGeometry(2, 64, 64),
    new THREE.MeshStandardMaterial({
      map: dayMap,
      emissiveMap: nightMap,
      emissiveIntensity: 1.2,
      emissive: new THREE.Color(0xffffff),
    })
  );
  scene.add(globe);

  // 🌞 Lighting
  const light = new THREE.DirectionalLight(0xffffff, 1.5);
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
  controls.minDistance = 3;
  controls.maxDistance = 1200;
  camera.position.set(0, 3, 5);

  // 🎯 Click Detection for Satellites
  const raycaster = new THREE.Raycaster();
  const mouse = new THREE.Vector2();

  window.addEventListener("click", (event) => {
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);

    const intersects = raycaster.intersectObjects(scene.children, true);
    const clickedSatellite = intersects.find((obj) => obj.object.userData)?.object.userData;

    if (clickedSatellite) {
      setSelectedSatellite(clickedSatellite);
    }
  });

  // 🔄 Animate Earth Rotation
  const animate = () => {
    requestAnimationFrame(animate);
    globe.rotation.y += 0.0002;

    const time = Date.now() / 1000;

    // 🔄 Update satellite positions
    Object.values(satelliteObjectsRef.current).forEach((satelliteModel) => {
      if (satelliteModel.userData) {
        const newPos = computeSatellitePosition(satelliteModel.userData, time);
        if (newPos) {
          satelliteModel.position.lerp(newPos, 0.05);
          satelliteModel.userData.latestPosition = newPos;
        }
      }
    });

    // ✅ Ensure the camera always looks at the selected satellite
    if (selectedSatellite && satelliteObjectsRef.current[selectedSatellite.norad_number]) {
      cameraRef.current.lookAt(satelliteObjectsRef.current[selectedSatellite.norad_number].position);
    }

    controls.update();
    renderer.render(scene, cameraRef.current);
  };

  animate();

  return () => {
    if (mountRef.current && mountRef.current.contains(renderer.domElement)) {
      mountRef.current.removeChild(renderer.domElement);
    }
  };
}, []); // ✅ Runs only once when component mounts


return (
  <div className="flex h-screen w-screen">
    
    {/* 🌍 Sidebar Container */}
    <div className="relative">
      {/* 📌 Sidebar Panel */}
      <div
        className={`fixed top-0 left-0 h-full bg-gray-900 text-white p-4 overflow-y-auto shadow-lg transition-transform duration-300 ease-in-out w-64 md:w-1/4 z-50 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* 📌 Sidebar Header */}
        <h2 className="text-lg font-bold mb-2 text-center">Satellite List</h2>

        {/* 🔍 Search Input */}
        <input
          type="text"
          placeholder="Search satellite..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full p-2 mb-2 text-black rounded-md"
        />

        {/* 🛰️ Satellite List */}
        {loading ? (
          <p className="text-center text-gray-400">Loading...</p>
        ) : filteredSatellites.length > 0 ? (
          <ul className="space-y-2">
            {filteredSatellites.map((sat) => (
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
        ) : (
          <p className="text-center text-gray-400">No satellites found.</p>
        )}

        {/* 🚀 Satellite Navigation */}
        <div className="flex justify-between items-center mt-4">
          {/* ⬅️ Previous Page */}
          <button
            onClick={() => setPage((prev) => Math.max(prev - 1, 1))}
            disabled={page === 1}
            className={`px-3 py-2 bg-gray-700 text-white rounded-md shadow-md hover:bg-gray-600 transition-all ${
              page === 1 ? "opacity-50 cursor-not-allowed" : ""
            }`}
          >
            ← Prev
          </button>

          {/* 📄 Page Info */}
          <span className="text-sm text-gray-300">Page {page}</span>

          {/* ➡️ Next Page */}
          <button
            onClick={() => setPage((prev) => prev + 1)}
            className="px-3 py-2 bg-gray-700 text-white rounded-md shadow-md hover:bg-gray-600 transition-all"
          >
            Next →
          </button>
        </div>
      </div>

      {/* 📌 Toggle Button - Stays Attached to Sidebar */}
      <button
        onClick={() => {
          console.log("🛠️ Toggling Sidebar...");
          setSidebarOpen((prev) => !prev);
        }}
        className={`absolute top-1/2 transform -translate-y-1/2 bg-gray-800 text-white px-3 py-2 rounded-r-md shadow-md hover:bg-gray-700 transition-all duration-300 z-[70] ${
          sidebarOpen ? "left-[16rem] md:left-1/4" : "left-0"
        }`}
      >
        {sidebarOpen ? "←" : "→"}
      </button>
    </div>

    {/* 🌍 3D Scene */}
    <div className="relative flex-1">
      <div ref={mountRef} className="absolute top-0 left-0 w-full h-full z-10" />

      {/* 🛰️ Satellite Details Box */}
      {selectedSatellite && (
        <div
          className={`absolute bottom-0 bg-gray-900 text-yellow-300 p-3 shadow-lg text-xs border-t border-gray-700 flex flex-col items-center h-24 z-[60] transition-all duration-300 ease-in-out ${
            sidebarOpen ? "left-64 md:left-1/4 w-[calc(100%-16rem)]" : "left-0 w-full"
          }`}
        >
          {/* 🚀 Name & Epoch */}
          <div className="flex flex-col items-center w-full text-center pb-1">
            <span className="font-bold text-yellow-400 text-sm">{selectedSatellite.name}</span>
            <span className="text-yellow-500 text-xs">
              <strong>Epoch:</strong> {new Date(selectedSatellite.epoch).toLocaleString()}
            </span>
          </div>

          {/* 📊 Satellite Info */}
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
        </div>
      )}
    </div>
  </div>
);}