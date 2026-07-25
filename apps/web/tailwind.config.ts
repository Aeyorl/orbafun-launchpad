import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Orba brand palette — dark theme with USDC blue + green accents
        // Inspired by pump.fun's energy + orba.app's clean USDC-native aesthetic
        bg: {
          base: '#0a0a0b',      // near-black background
          card: '#131316',      // card background
          hover: '#1a1a1f',     // hover state
          input: '#1e1e24',     // input fields
          border: '#26262e',    // borders
        },
        accent: {
          green: '#00ff9d',     // primary accent (pump.fun-style neon green)
          greenDim: '#00cc7e',  // dimmed green for secondary elements
          blue: '#3b82f6',      // USDC blue (secondary accent)
          blueDim: '#2563eb',   // dimmed blue
          purple: '#a855f7',    // tertiary accent (graduation, special)
          red: '#ef4444',       // sell / danger
          orange: '#f97316',    // warning / near migration
          yellow: '#eab308',    // caution
        },
        text: {
          primary: '#f4f4f5',   // main text (zinc-100)
          secondary: '#a1a1aa', // secondary text (zinc-400)
          muted: '#8b8b94',     // muted text — bumped from #71717a for WCAG AA contrast on dark bg
        },
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-jetbrains)', 'monospace'],
      },
      animation: {
        'fade-in': 'fadeIn 0.3s ease-out',
        'slide-up': 'slideUp 0.3s ease-out',
        'pulse-green': 'pulseGreen 2s ease-in-out infinite',
        'ticker': 'ticker 30s linear infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        pulseGreen: {
          '0%, 100%': { boxShadow: '0 0 0 0 rgba(0, 255, 157, 0.4)' },
          '50%': { boxShadow: '0 0 0 8px rgba(0, 255, 157, 0)' },
        },
        ticker: {
          '0%': { transform: 'translateX(0)' },
          '100%': { transform: 'translateX(-50%)' },
        },
      },
    },
  },
  plugins: [],
};

export default config;
