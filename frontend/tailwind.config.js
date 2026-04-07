/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {

        bg:      '#080b10',
        surface: '#0e1118',
        border:  '#1a1714',
        muted:   '#554d3d',
        bull:    '#26a69a',
        bear:    '#ef5350',
        gold:    '#f0b429',
      },
    },
  },
  plugins: [],
}
