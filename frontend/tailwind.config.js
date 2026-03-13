/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {

        bg:      '#0d1117',
        surface: '#161b22',
        border:  '#21262d',
        muted:   '#8b949e',
        bull:    '#26a69a',
        bear:    '#ef5350',
        gold:    '#f0b429',
      },
    },
  },
  plugins: [],
}
