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
  const selectedMarkerRef = useRef(null);
  const cameraRef = useRef(null);  // Stores camera
  const cameraTargetRef = useRef(null);  // Stores smooth transition target
  const mountRef = useRef(null);
  const [satellites, setSatellites] = useState([]);
  const satelliteObjectsRef = useRef({}); // ✅ Use a ref for real-time updates
  const [selectedSatellite, setSelectedSatellite] = useState(null);
  const [loading, setLoading] = useState(true);

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
    setSelectedSatellite(sat);
  
    const satModel = satelliteObjectsRef.current[sat.norad_number]; // ✅ Get model from ref
    if (!satModel) {
      console.warn("⚠️ Satellite model not found:", sat.name);
      return;
    }
  
    // ✅ Set the new camera target
    cameraTargetRef.current = new THREE.Vector3(
      satModel.position.x * 1.1,
      satModel.position.y * 1.1,
      satModel.position.z * 1.1
    );
  
    // 🔥 Animate Camera Movement Smoothly
    function animateCamera() {
      cameraRef.current.position.lerp(cameraTargetRef.current, 0.1);
      cameraRef.current.lookAt(satModel.position);
  
      if (cameraRef.current.position.distanceTo(cameraTargetRef.current) > 0.05) {
        requestAnimationFrame(animateCamera);
      }
    }
  
    animateCamera();
  }
  
  
  


  // MAIN FOR ACTIONS

  useEffect(() => {
    if (!mountRef.current) {
      console.error("⚠️ mountRef is null! Three.js won't render.");
      return;
    }

    // 🌍 Scene Setup
  const scene = new THREE.Scene();
  cameraRef.current = new THREE.PerspectiveCamera(
    60,
    window.innerWidth / window.innerHeight,
    0.1,
    2000
  );
  const camera = cameraRef.current;
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(mountRef.current.clientWidth, mountRef.current.clientHeight);
  renderer.setPixelRatio(window.devicePixelRatio);
  mountRef.current.appendChild(renderer.domElement);


// 🛰 Load Satellite Model
  const loader = new GLTFLoader();

  function loadSatelliteModel(satellite) {
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
  
        scene.add(satelliteModel);
  
        // ✅ Store satellite in `useRef`
        satelliteObjectsRef.current[satellite.norad_number] = satelliteModel;
      },
      undefined,
      (error) => {
        console.error("❌ Error loading satellite model:", error);
      }
    );
  }
  


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
    light.position.set(5, 3, 5);
    scene.add(light);

    // 🖱 Orbit Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableZoom = true;
    controls.enablePan = false;
    controls.enableDamping = true;  // ✅ Smooth camera movement
    controls.dampingFactor = 0.1;  // ✅ Reduce jarring movements
    controls.rotateSpeed = 0.8;  // ✅ Slightly increase rotation speed
    controls.minDistance = 3;
    controls.maxDistance = 1200;
    camera.position.set(0, 3, 5);



    // 📍 Convert Lat/Lon to 3D coordinates
    function latLonToVector3(lat, lon, radius = 2.8) {
      const phi = (90 - lat) * (Math.PI / 180);
      const theta = (lon + 180) * (Math.PI / 180);
      return new THREE.Vector3(
        -radius * Math.sin(phi) * Math.cos(theta),
        radius * Math.cos(phi),
        radius * Math.sin(phi) * Math.sin(theta)
      );
    }
    


    // 🛰 Fetch & Plot Satellites
    fetchSatellites(1, 50).then((data) => {
      if (data && data.satellites) {
        setSatellites(data.satellites);
        data.satellites.forEach(loadSatelliteModel);
      }
      setLoading(false);
    });




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
      globe.rotation.y += 0.002; // Keep the Earth rotating
    
      const time = Date.now() / 1000; // Get current time in seconds
    
      Object.values(satelliteObjectsRef.current).forEach((satelliteModel) => {
        if (satelliteModel.userData) {
          const newPos = computeSatellitePosition(satelliteModel.userData, time);
          if (newPos) {
            // ✅ Smoothly update satellite position
            satelliteModel.position.lerp(newPos, 0.05); // Adjust speed
            satelliteModel.userData.latestPosition = newPos;
          }
        }
      });
    
      // ✅ Smoothly move camera to the target satellite
      if (cameraTargetRef.current) {
        cameraRef.current.position.lerp(cameraTargetRef.current, 0.1); // Adjust for smooth movement
        if (cameraRef.current.position.distanceTo(cameraTargetRef.current) < 0.5) {
          cameraTargetRef.current = null; // Stop moving when close
        }
      }
    
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
  }, []);

  return (
    <div className="flex flex-col md:flex-row h-screen w-screen">

      {/* 📌 Sidebar */}
      <div className="w-full md:w-1/4 bg-gray-900 text-white p-4 overflow-y-auto">
        <h2 className="text-lg font-bold mb-2 text-center">Satellite List</h2>
        {loading ? (
          <p className="text-center text-gray-400">Loading...</p>
        ) : (
          <ul className="space-y-2">
  {satellites.map((sat, index) => (
    <li
      key={index}
      className={`cursor-pointer p-3 rounded-md text-center border border-gray-700 ${
        selectedSatellite?.norad_number === sat.norad_number
          ? "bg-blue-500 text-white border-blue-600"
          : "bg-gray-700 hover:bg-gray-600"
      }`}
      onClick={() => focusOnSatellite(sat)} // 🔥 Make sure this always triggers properly
    >
      <span className="block w-full">{sat.name}</span>
    </li>
  ))}
</ul>

        )}
      </div>

      {/* 🌍 3D Scene */}
      <div className="relative flex-1">
        <div ref={mountRef} className="absolute top-0 left-0 w-full h-full" />
        {selectedSatellite && (
  <div className="absolute bottom-0 left-0 w-full bg-gray-900 text-yellow-300 p-3 shadow-lg text-xs border-t border-gray-700 flex flex-col items-center h-24">



    {/* 🚀 Name & Epoch (Top Row) */}
    <div className="flex flex-col items-center w-full text-center pb-1">
      <span className="font-bold text-yellow-400 text-sm">{selectedSatellite.name}</span>
      <span className="text-yellow-500 text-xs">
        <strong>Epoch:</strong> {new Date(selectedSatellite.epoch).toLocaleString()}
      </span>
    </div>




    {/* 🔹 Additional Details (Below) */}
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
  );
}
