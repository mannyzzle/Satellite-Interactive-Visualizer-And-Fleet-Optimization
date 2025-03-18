import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: process.env.NODE_ENV === 'production' 
    ? '/Satellite-Interactive-Visualizer-And-Fleet-Optimization/'  // ✅ GitHub Pages base path
    : '/',  // ✅ Local dev path
  build: {
    outDir: 'dist',
  },
  server: {
    historyApiFallback: true, // ✅ Fixes deep linking for local dev
  },
});
