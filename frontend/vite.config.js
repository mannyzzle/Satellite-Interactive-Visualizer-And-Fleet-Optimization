import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// ✅ Set correct base path for GitHub Pages
export default defineConfig({
  plugins: [react()],
  base: '/Satellite-Interactive-Visualizer-And-Fleet-Optimization/' // Replace with your repo name
});

