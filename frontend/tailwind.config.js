/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        // 金融暗色主题色板
        bg:      '#0d1117',
        surface: '#161b22',
        border:  '#21262d',
        muted:   '#8b949e',
        bull:    '#26a69a',   // 阳线/多单绿
        bear:    '#ef5350',   // 阴线/空单红
        gold:    '#f0b429',   // 黄金主题色
      },
    },
  },
  plugins: [],
}
