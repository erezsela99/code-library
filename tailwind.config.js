/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'cl-dark': '#0a0a0f',
        'cl-darker': '#050508',
        'cl-card': '#12121a',
        'cl-card-hover': '#1a1a25',
        'cl-border': '#2a2a3a',
        'cl-accent': '#6c5ce7',
        'cl-accent-hover': '#7d6ff0',
        'cl-green': '#00d2a0',
        'cl-red': '#ff4757',
        'cl-text': '#e8e8f0',
        'cl-text-dim': '#8888a0',
      },
      fontFamily: {
        'display': ['Inter', 'system-ui', 'sans-serif'],
      }
    },
  },
  plugins: [],
}
