// src/pages/Home.jsx
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";
import dayTexture from "../assets/earth_day.jpg";
import nightTexture from "../assets/earth_night.jpg";
import { fetchSatellites } from "../api/satelliteService";

export default function Home() {
  const mountRef = useRef(null);
  const [satellites, setSatellites] = useState([]);

  useEffect(() => {
    if (!mountRef.current) return;

    // 🔹 Scene Setup
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    mountRef.current.appendChild(renderer.domElement);

    // 🌍 Load Earth Textures
    const textureLoader = new THREE.TextureLoader();
    const dayMap = textureLoader.load(dayTexture);
    const nightMap = textureLoader.load(nightTexture);

    // 🛰 Create Earth with blended texture
    const geometry = new THREE.SphereGeometry(2, 64, 64);
    const material = new THREE.MeshStandardMaterial({
      map: dayMap,
      emissiveMap: nightMap, 
      emissiveIntensity: 1.2,
      emissive: new THREE.Color(0xffffff),
    });
    const globe = new THREE.Mesh(geometry, material);
    scene.add(globe);

    // 🌞 Lighting
    const light = new THREE.DirectionalLight(0xffffff, 1.5);
    light.position.set(5, 3, 5);
    scene.add(light);

    // 🖱 Orbit Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableZoom = true;
    controls.enablePan = false;
    controls.rotateSpeed = 0.5;
    controls.zoomSpeed = 0.8;
    controls.minDistance = 3;
    controls.maxDistance = 10;

    // Camera Position
    camera.position.set(0, 3, 5);

    // 🎯 Convert Lat/Lon to 3D coordinates
    function latLonToVector3(lat, lon, radius = 2) {
      const phi = (90 - lat) * (Math.PI / 180);
      const theta = (lon + 180) * (Math.PI / 180);
      return new THREE.Vector3(
        -radius * Math.sin(phi) * Math.cos(theta),
        radius * Math.cos(phi),
        radius * Math.sin(phi) * Math.sin(theta)
      );
    }

    // 🛰 Fetch & Plot Satellites
    fetchSatellites(1, 100).then((data) => {
      if (data && data.satellites) {
        setSatellites(data.satellites);
        data.satellites.forEach((sat) => {
          const { latitude, longitude, name, norad_number } = sat;
          console.log(`🛰 Placing satellite: ${name} at (${latitude}, ${longitude})`);

          const pos = latLonToVector3(latitude, longitude);
          const satGeometry = new THREE.SphereGeometry(0.1, 16, 16); // 🔴 Increased Size
          const satMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000 });
          const satMesh = new THREE.Mesh(satGeometry, satMaterial);
          satMesh.position.copy(pos);
          satMesh.userData = { name, norad_number };
          globe.add(satMesh);
        });
      }
    });

    // 🎯 Click Detection
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    window.addEventListener("click", (event) => {
      mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
      mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObjects(globe.children);

      if (intersects.length > 0) {
        const clickedSatellite = intersects[0].object.userData;
        alert(`🛰 Satellite: ${clickedSatellite.name}\nNORAD: ${clickedSatellite.norad_number}`);
      }
    });

    // 🔄 Adjust Earth Day/Night Blend Based on Rotation
    const animate = () => {
      requestAnimationFrame(animate);
      globe.rotation.y += 0.002;
      
      // Adjust emission intensity based on rotation (simulating day/night)
      const rotationFactor = Math.abs(Math.sin(globe.rotation.y)); 
      material.emissiveIntensity = rotationFactor * 1.5;

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

  return (
    <div className="flex flex-col items-center p-10">
      <h1 className="text-3xl font-bold">Satellite Interactive Visualizer</h1>
      <div ref={mountRef} className="w-full h-96" />
    </div>
  );
}
