/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,jsx,ts,tsx}",
    "./components/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // ahoi "Coastal Fresh" palette
        primary: {
          50: '#EEF8FB',
          100: '#D4EEF4',
          200: '#A8DDE9',
          300: '#7DCBDE',
          400: '#4BAFC8',
          500: '#1A7A94', // Deep petrol
          600: '#156276',
          700: '#104A59',
          800: '#0A313B',
          900: '#05191E',
        },
        // Category colors - soft pastels
        category: {
          theater: '#A78BCA',
          outdoor: '#5EBD8A',
          museum: '#E8A465',
          music: '#E87BA0',
          sport: '#6DB3E8',
          market: '#E8D06A',
          kreativ: '#F09090',
          lesen: '#6EC5DC',
        },
      },
      fontFamily: {
        nunito: ['Nunito_400Regular'],
        'nunito-semibold': ['Nunito_600SemiBold'],
        'nunito-bold': ['Nunito_700Bold'],
      },
    },
  },
  plugins: [],
};
