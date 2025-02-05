/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",         
    "./src/**/*.{js,jsx,ts,tsx,html}",  // ✅ Includes TS, TSX, HTML for safety
  ],
  theme: {
    extend: {},
  },
  plugins: [],
};
