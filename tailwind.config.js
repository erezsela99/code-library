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
        'cl-accent-dim': 'rgba(108, 92, 231, 0.15)',
        'cl-green': '#00d2a0',
        'cl-green-dim': 'rgba(0, 210, 160, 0.15)',
        'cl-red': '#ff4757',
        'cl-red-dim': 'rgba(255, 71, 87, 0.15)',
        'cl-orange': '#ff9f43',
        'cl-text': '#e8e8f0',
        'cl-text-dim': '#8888a0',
        'cl-glass': 'rgba(18, 18, 26, 0.7)',
        'cl-glass-light': 'rgba(26, 26, 37, 0.5)',
      },
      fontFamily: {
        'display': ['Inter', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        'glow': '0 0 20px rgba(108, 92, 231, 0.3)',
        'glow-lg': '0 0 40px rgba(108, 92, 231, 0.4)',
        'glow-green': '0 0 20px rgba(0, 210, 160, 0.3)',
        'glass': '0 8px 32px rgba(0, 0, 0, 0.4)',
        'glass-lg': '0 16px 64px rgba(0, 0, 0, 0.6)',
      },
      backdropBlur: {
        'glass': '16px',
      },
      animation: {
        'shimmer': 'shimmer 2s infinite',
        'fade-in': 'fade-in 0.3s ease-out',
        'slide-up': 'slide-up 0.3s ease-out',
        'slide-down': 'slide-down 0.3s ease-out',
        'scale-in': 'scale-in 0.2s ease-out',
        'pulse-glow': 'pulse-glow 2s ease-in-out infinite',
        'gradient-shift': 'gradient-shift 3s ease infinite',
      },
      keyframes: {
        'shimmer': {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'slide-up': {
          '0%': { opacity: '0', transform: 'translateY(20px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'slide-down': {
          '0%': { opacity: '0', transform: 'translateY(-10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'scale-in': {
          '0%': { opacity: '0', transform: 'scale(0.95)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        'pulse-glow': {
          '0%, 100%': { opacity: '0.5' },
          '50%': { opacity: '1' },
        },
        'gradient-shift': {
          '0%, 100%': { backgroundPosition: '0% 50%' },
          '50%': { backgroundPosition: '100% 50%' },
        },
      },
    },
  },
  plugins: [],
}
