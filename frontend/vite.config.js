import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "/",
  build: {
    rollupOptions: {
      output: {
        // Pull Three.js + satellite.js into one vendor chunk so Home and
        // Tracking share it across route navigations instead of duplicating it
        // in each lazy chunk.
        manualChunks(id) {
          if (id.includes("node_modules")) {
            if (
              id.includes("/three/") ||
              id.includes("@react-three/") ||
              id.includes("/satellite.js/")
            ) {
              return "vendor-three";
            }
          }
        },
      },
    },
  },
  server: {
    historyApiFallback: true, // ✅ Fallback to `index.html` for local dev
  },
});
