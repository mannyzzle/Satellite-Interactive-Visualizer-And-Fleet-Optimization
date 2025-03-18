import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "/Satellite-Interactive-Visualizer-And-Fleet-Optimization/", // ✅ Ensure correct GitHub Pages path
  build: {
    rollupOptions: {
      output: {
        manualChunks: undefined, // ✅ Prevent unnecessary chunking issues
      },
    },
  },
  server: {
    historyApiFallback: true, // ✅ Fallback to `index.html` for local dev
  },
});
