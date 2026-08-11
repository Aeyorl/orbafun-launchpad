import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Theme-aware semantic tokens — values are space-separated RGB
        // channels defined in globals.css (:root for light, .dark for dark).
        // Using rgb(var(--...) / <alpha-value>) so Tailwind's /opacity
        // modifier (e.g. bg-accent-blue/10) works correctly. Switching the
        // `dark` class on <html> swaps all colors instantly. Arc/USDC blue
        // (#2775CA) is the primary accent in both modes. Dark mode is the
        // default (degens prefer it); light mode is opt-in via the toggle.
        bg: {
          base: 'rgb(var(--color-bg-base) / <alpha-value>)',
          card: 'rgb(var(--color-bg-card) / <alpha-value>)',
          hover: 'rgb(var(--color-bg-hover) / <alpha-value>)',
          input: 'rgb(var(--color-bg-input) / <alpha-value>)',
          border: 'rgb(var(--color-bg-border) / <alpha-value>)',
        },
        accent: {
          green: 'rgb(var(--color-accent-primary) / <alpha-value>)',
          greenDim: 'rgb(var(--color-accent-primary-dim) / <alpha-value>)',
          blue: 'rgb(var(--color-accent-blue) / <alpha-value>)',
          blueDim: 'rgb(var(--color-accent-blue-dim) / <alpha-value>)',
          purple: 'rgb(var(--color-accent-grad) / <alpha-value>)',
          red: 'rgb(var(--color-accent-red) / <alpha-value>)',
          orange: 'rgb(var(--color-accent-orange) / <alpha-value>)',
          yellow: 'rgb(var(--color-accent-yellow) / <alpha-value>)',
          peach: 'rgb(var(--color-accent-surface) / <alpha-value>)',
          sienna: 'rgb(var(--color-accent-on-surface) / <alpha-value>)',
        },
        text: {
          primary: 'rgb(var(--color-text-primary) / <alpha-value>)',
          secondary: 'rgb(var(--color-text-secondary) / <alpha-value>)',
          muted: 'rgb(var(--color-text-muted) / <alpha-value>)',
        },
      },
      fontFamily: {
        sans: ['var(--font-sohne)', 'var(--font-inter)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        serif: ['var(--font-signifier)', 'ui-serif', 'Georgia', 'Cambria', 'serif'],
        mono: ['var(--font-jetbrains)', 'ui-monospace', 'monospace'],
      },
      // Daybreak radii: warm and tactile, never hard 0px corners.
      borderRadius: {
        none: '4px',
        sm: '8px',
        DEFAULT: '12px',
        md: '14px',
        lg: '16px',
        xl: '20px',
        '2xl': '24px',
        '3xl': '28px',
        full: '9999px',
      },
      boxShadow: {
        subtle: 'var(--shadow-subtle)',
        'subtle-2': 'var(--shadow-subtle-2)',
        'subtle-3': 'var(--shadow-subtle-3)',
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
          '0%, 100%': { boxShadow: '0 0 0 0 var(--accent-glow)' },
          '50%': { boxShadow: '0 0 0 8px transparent' },
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
