/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{js,jsx,ts,tsx}', './src/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        brand: {
          lime:    '#B3E5FC',
          green:   '#81D4FA',
          dark:    '#0A0A0A',
          surface: '#141414',
          border:  '#1F1F1F',
          muted:   '#404040',
          text: {
            primary:   '#F5F5F5',
            secondary: '#808080',
          },
        },
      },
    },
  },
  plugins: [],
};
