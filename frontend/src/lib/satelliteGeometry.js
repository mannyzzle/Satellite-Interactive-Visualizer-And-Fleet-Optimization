// Shared Three.js geometry + materials for the satellite mesh layer.
//
// Why: Home.jsx used to allocate a new SphereGeometry + MeshBasicMaterial
// for every one of the 500 rendered satellites. That's 500 GPU buffers and
// 500 distinct materials → 500 WebGL state changes per frame. By sharing
// one geometry and a tiny set of pre-built materials, we keep the same
// number of draw calls but eliminate per-frame material/program churn,
// and the GC stops scanning hundreds of disposable objects.
//
// Visually: the new geometry is a small "satellite icon" (cube body +
// two flat solar panels) instead of a sphere — gives it a recognizable
// silhouette without going overboard on triangle count.
import * as THREE from "three";

/* ---------- Satellite mesh geometry ---------- */
// Three boxes merged via a single BufferGeometry: a tiny cube body in the
// middle and two thin "solar panels" extending left/right. Total ~36
// triangles vs ~80 for the previous SphereGeometry(0.1, 8, 8) — and now
// the satellite actually looks like a satellite instead of a dot.
//
// All sizes are in scene units. Earth radius is ~6371; we want a sat
// silhouette around 0.18 units so it reads against the globe.
function buildSatelliteGeometry() {
  const body = new THREE.BoxGeometry(0.12, 0.1, 0.1);
  const panelL = new THREE.BoxGeometry(0.18, 0.005, 0.18);
  panelL.translate(-0.18, 0, 0);
  const panelR = new THREE.BoxGeometry(0.18, 0.005, 0.18);
  panelR.translate(0.18, 0, 0);

  // Manually concat positions/normals/indices to avoid pulling in
  // BufferGeometryUtils. Three small boxes is trivial to merge.
  const merged = new THREE.BufferGeometry();
  const groups = [body, panelL, panelR];
  let posLen = 0;
  let normLen = 0;
  let idxLen = 0;
  for (const g of groups) {
    posLen += g.attributes.position.count;
    if (g.index) idxLen += g.index.count;
  }
  const positions = new Float32Array(posLen * 3);
  const normals = new Float32Array(posLen * 3);
  const indices = new Uint16Array(idxLen);
  let pOff = 0;
  let iOff = 0;
  let baseVertex = 0;
  for (const g of groups) {
    positions.set(g.attributes.position.array, pOff);
    normals.set(g.attributes.normal.array, pOff);
    if (g.index) {
      const src = g.index.array;
      for (let i = 0; i < src.length; i++) indices[iOff + i] = src[i] + baseVertex;
      iOff += src.length;
    }
    pOff += g.attributes.position.count * 3;
    baseVertex += g.attributes.position.count;
    g.dispose();
  }
  merged.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  merged.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
  merged.setIndex(new THREE.BufferAttribute(indices, 1));
  merged.computeBoundingSphere();
  return merged;
}

export const SAT_GEOMETRY = buildSatelliteGeometry();

/* ---------- Shared materials by orbit type ----------
   Five flyweight materials, one per orbit class. Reusing a single
   MeshBasicMaterial across hundreds of meshes lets WebGL skip program
   switches every frame. Colors mirror the catalog page's ORBIT_DOT.   */
const COLORS = {
  LEO: 0x22d3ee,   // cyan-400
  MEO: 0x2dd4bf,   // teal-400
  GEO: 0xa78bfa,   // violet-400
  HEO: 0xfbbf24,   // amber-400
  DEFAULT: 0x9ca3af, // gray-400
};

export const SAT_MATERIALS = {
  LEO: new THREE.MeshBasicMaterial({ color: COLORS.LEO }),
  MEO: new THREE.MeshBasicMaterial({ color: COLORS.MEO }),
  GEO: new THREE.MeshBasicMaterial({ color: COLORS.GEO }),
  HEO: new THREE.MeshBasicMaterial({ color: COLORS.HEO }),
  DEFAULT: new THREE.MeshBasicMaterial({ color: COLORS.DEFAULT }),
};

export function materialForOrbit(orbitType) {
  return SAT_MATERIALS[orbitType] || SAT_MATERIALS.DEFAULT;
}

export const ORBIT_COLOR_HEX = COLORS;

/* ---------- Earth atmosphere Fresnel shader ----------
   A slightly larger sphere rendered with backside + fresnel so the
   silhouette glows when viewed against the dark starfield. Replaces the
   old flat blue back-side sphere. Single draw call, no perf cost. */
export function makeAtmosphereMaterial(tint = 0x5eead4) {
  // Render the atmosphere on the FRONT side of a slightly-larger sphere.
  // Standard fresnel: bright at the silhouette (where the surface normal
  // is perpendicular to the view direction) and dark at face-center
  // (where the normal points straight at the camera). Combined with
  // additive blending + depthWrite off, the result is a clean halo
  // that only kisses Earth's silhouette — not the green-disc-over-half-
  // the-globe look the BackSide version produced.
  return new THREE.ShaderMaterial({
    uniforms: {
      tint: { value: new THREE.Color(tint) },
      power: { value: 4.0 },      // higher = thinner rim
      intensity: { value: 0.85 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vNormal;
      varying vec3 vViewDir;
      void main() {
        vNormal = normalize(normalMatrix * normal);
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        vViewDir = normalize(-mvPosition.xyz);
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 tint;
      uniform float power;
      uniform float intensity;
      varying vec3 vNormal;
      varying vec3 vViewDir;
      void main() {
        // FrontSide: dot is ~1 at face-center, ~0 at silhouette.
        // 1 - dot is therefore ~0 at face-center, ~1 at silhouette.
        float ndotv = max(dot(normalize(vNormal), normalize(vViewDir)), 0.0);
        float fresnel = pow(1.0 - ndotv, power);
        gl_FragColor = vec4(tint * intensity * fresnel, fresnel);
      }
    `,
    side: THREE.FrontSide,
    blending: THREE.AdditiveBlending,
    transparent: true,
    depthWrite: false,
  });
}

/* ---------- Pulsing selection marker ----------
   Big ring (relative to the satellite icon, ~0.18) so it reads at
   close-up framing. Animation loop scales it between 1.0–1.35 each
   frame for a "lock-on" pulse + opacity throb. */
export function makePulseMarker() {
  const geo = new THREE.RingGeometry(1.6, 2.2, 48);
  const mat = new THREE.MeshBasicMaterial({
    color: 0xfbbf24,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.7,
    depthWrite: false,
  });
  return new THREE.Mesh(geo, mat);
}
