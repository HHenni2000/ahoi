/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,jsx,ts,tsx}",
    "./components/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // ahoi brand colors - family-friendly, Hamburg-inspired
        primary: {
          50: '#E6F3F7',
          100: '#CCE7EF',
          200: '#99CFE0',
          300: '#66B7D0',
          400: '#339FC1',
          500: '#0087B1', // Main brand color (Hamburg harbor blue)
          600: '#006C8E',
          700: '#00516A',
          800: '#003647',
          900: '#001B23',
        },
        secondary: {
          50: '#FFF5E6',
          100: '#FFEBCC',
          200: '#FFD699',
          300: '#FFC266',
          400: '#FFAD33',
          500: '#FF9900', // Accent color (warm, welcoming)
          600: '#CC7A00',
          700: '#995C00',
          800: '#663D00',
          900: '#331F00',
        },
        // Category colors
        category: {
          theater: '#9B59B6',    // Purple
          outdoor: '#27AE60',    // Green
          museum: '#E67E22',     // Orange
          music: '#E91E63',      // Pink
          sport: '#3498DB',      // Blue
          market: '#F1C40F',     // Yellow
          kreativ: '#FF6B6B',    // Coral
          lesen: '#45B7D1',      // Teal
        },
      },
    },
  },
  plugins: [],
};
