/** @type {import('tailwindcss').Config} */
// brand-* 색은 app/_layout.tsx가 루트에서 주입하는 CSS 변수(Frost 팔레트, 다크·라이트)를 따른다.
const themed = (name) => `rgb(var(--color-${name}) / <alpha-value>)`;

module.exports = {
  content: ['./app/**/*.{js,jsx,ts,tsx}', './src/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        brand: {
          lime:    themed('value'),
          green:   themed('value'),
          dark:    themed('bg'),
          surface: themed('surface'),
          border:  themed('border'),
          muted:   themed('muted'),
          text: {
            primary:   themed('text'),
            secondary: themed('text2'),
          },
        },
      },
    },
  },
  plugins: [],
};
