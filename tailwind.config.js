/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{js,ts,jsx,tsx}','./components/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        bg:      '#0a0c10',
        surface: '#111318',
        surface2:'#181c24',
        border:  '#232836',
        border2: '#2e3548',
        muted:   '#5a6178',
        blue:    '#4f8fff',
        green:   '#2dd4a0',
        amber:   '#f5a623',
        red:     '#ff5c5c',
        purple:  '#a78bfa',
      },
      fontFamily: {
        sans:  ['var(--font-manrope)', 'sans-serif'],
        mono:  ['var(--font-dm-mono)', 'monospace'],
        display:['var(--font-syne)', 'sans-serif'],
      }
    }
  },
  plugins: []
}
