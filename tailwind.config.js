/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Cosmic & Matrix color palette
        'deep-space': '#000208',
        'matrix-green': '#00ff66',
        'cyber-cyan': '#00ffff',
        'alert-red': '#ff4d4d',
        'accent-purple': '#8b5cf6',
        'quantum-blue': '#0066ff',
        'plasma-yellow': '#ffcc00',
        'void-black': '#010101',
        'singularity': {
          50: '#f0f9ff',
          100: '#e0f2fe',
          200: '#b9e5fe',
          300: '#7cd2fd',
          400: '#00ffff',
          500: '#00e6e6',
          600: '#00cccc',
          700: '#00b3b3',
          800: '#009999',
          900: '#007a7a',
        },
        'matrix': {
          50: '#f0fdf4',
          100: '#dcfce7',
          200: '#bbf7d0',
          300: '#86efac',
          400: '#00ff66',
          500: '#00e65a',
          600: '#00cc50',
          700: '#00b346',
          800: '#00993d',
          900: '#008033',
        },
      },
      fontFamily: {
        'display': ['Space Grotesk', 'system-ui', 'sans-serif'],
        'body': ['Inter', 'system-ui', 'sans-serif'],
        'mono': ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      fontSize: {
        'display-xl': ['5rem', { lineHeight: '1', letterSpacing: '0.3em' }],
        'display-lg': ['3.5rem', { lineHeight: '1.1', letterSpacing: '0.2em' }],
        'display-md': ['2.5rem', { lineHeight: '1.2', letterSpacing: '0.1em' }],
        'hud': ['0.875rem', { lineHeight: '1.5', letterSpacing: '0.05em' }],
      },
      animation: {
        'scan': 'scan 8s linear infinite',
        'glitch': 'glitch 5s steps(2, end) infinite',
        'glitch-alt': 'glitch 1.5s infinite reverse',
        'flicker': 'flicker 3s infinite',
        'pulse-glow': 'pulseGlow 2s ease-in-out infinite',
        'float': 'float 6s ease-in-out infinite',
        'matrix-rain': 'matrixRain 1s linear infinite',
        'warp': 'warp 10s ease-in-out infinite',
        'quantum-pulse': 'quantumPulse 4s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
      keyframes: {
        scan: {
          '0%': { transform: 'translateY(-100%)' },
          '100%': { transform: 'translateY(100%)' },
        },
        glitch: {
          '0%, 90%, 100%': { transform: 'translateX(0)' },
          '92%': { transform: 'translateX(-2px)' },
          '94%': { transform: 'translateX(2px)' },
          '96%': { transform: 'translateX(-1px)' },
        },
        flicker: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.8' },
        },
        pulseGlow: {
          '0%, 100%': { 
            opacity: '1',
            filter: 'drop-shadow(0 0 20px currentColor)'
          },
          '50%': { 
            opacity: '0.6',
            filter: 'drop-shadow(0 0 40px currentColor)'
          },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-10px)' },
        },
        matrixRain: {
          '0%': { transform: 'translateY(-100%)' },
          '100%': { transform: 'translateY(100vh)' },
        },
        warp: {
          '0%, 100%': { transform: 'scale(1) rotate(0deg)' },
          '25%': { transform: 'scale(1.05) rotate(1deg)' },
          '50%': { transform: 'scale(1.1) rotate(-1deg)' },
          '75%': { transform: 'scale(1.05) rotate(0.5deg)' },
        },
        quantumPulse: {
          '0%, 100%': { 
            transform: 'scale(1)',
            opacity: '0.8'
          },
          '25%': {
            transform: 'scale(1.05)',
            opacity: '0.9'
          },
          '50%': { 
            transform: 'scale(1.1)',
            opacity: '1'
          },
          '75%': {
            transform: 'scale(1.05)',
            opacity: '0.9'
          },
        },
      },
      backdropBlur: {
        xs: '2px',
        '2xl': '40px',
      },
      boxShadow: {
        'glow-sm': '0 0 10px rgba(0, 255, 255, 0.5)',
        'glow-md': '0 0 20px rgba(0, 255, 255, 0.6)',
        'glow-lg': '0 0 40px rgba(0, 255, 255, 0.8)',
        'glow-green': '0 0 30px rgba(0, 255, 102, 0.7)',
        'glow-red': '0 0 30px rgba(255, 77, 77, 0.7)',
        'inner-glow': 'inset 0 0 20px rgba(0, 255, 255, 0.3)',
        'matrix': '0 0 50px rgba(0, 255, 102, 0.3)',
      },
      dropShadow: {
        'glow-cyan': '0 0 20px rgba(0, 255, 255, 0.8)',
        'glow-green': '0 0 20px rgba(0, 255, 102, 0.8)',
        'glow-purple': '0 0 20px rgba(139, 92, 246, 0.8)',
      },
      transitionTimingFunction: {
        'bounce-in': 'cubic-bezier(0.68, -0.55, 0.265, 1.55)',
        'smooth-out': 'cubic-bezier(0.25, 0.46, 0.45, 0.94)',
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'gradient-conic': 'conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))',
        'matrix-grid': 'linear-gradient(0deg, transparent 48%, rgba(0, 255, 102, 0.1) 50%, transparent 52%), linear-gradient(90deg, transparent 48%, rgba(0, 255, 102, 0.1) 50%, transparent 52%)',
        'cyber-lines': 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0, 255, 255, 0.03) 2px, rgba(0, 255, 255, 0.03) 4px)',
      },
    },
  },
  plugins: [],
}
