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
        // Steep design system — serif analytics on warm paper (light theme).
        // Semantic tokens remapped so existing components adopt the new
        // palette without per-file edits. See DESIGN.md for the source spec.
        bg: {
          base: '#ffffff',      // Paper White — page canvas
          card: '#f2f2f3',      // Mist Gray — card surfaces, nested content
          hover: '#fafafb',     // Fog White — hover surfaces, alt sections
          input: '#ffffff',     // Paper White — input fills (border carries definition)
          border: '#ececec',    // Hairline border
        },
        accent: {
          green: '#17191c',     // Ink Black — primary action (filled pill buttons)
          greenDim: '#2a2d33',  // dimmed ink for hover/secondary
          blue: '#5d2a1a',      // Sienna Brown — secondary accent (on peach surfaces)
          blueDim: '#4a2115',   // dimmed sienna
          purple: '#5d2a1a',    // Sienna Brown — graduation/special → warm accent
          red: '#9b2c2c',       // muted brick red — sell / danger (functional)
          orange: '#b45309',    // muted amber — warning / near migration
          yellow: '#a16207',    // muted gold — caution
          peach: '#fbe1d1',     // Blush Peach — editorial accent card surface
          sienna: '#5d2a1a',    // Sienna Brown — text/stroke on peach
        },
        text: {
          primary: '#17191c',   // Ink Black — main text
          secondary: '#777b86', // Slate Gray — secondary text, links
          muted: '#979799',     // Ash Gray — tertiary labels, category tags
        },
      },
      fontFamily: {
        sans: ['var(--font-sohne)', 'var(--font-inter)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        serif: ['var(--font-signifier)', 'ui-serif', 'Georgia', 'Cambria', 'serif'],
        mono: ['var(--font-jetbrains)', 'ui-monospace', 'monospace'],
      },
      // All border radii set to 0px (per design spec — sharp corners site-wide)
      borderRadius: {
        none: '0',
        sm: '0',
        DEFAULT: '0',
        md: '0',
        lg: '0',
        xl: '0',
        '2xl': '0',
        '3xl': '0',
        full: '0',
      },
      boxShadow: {
        subtle: '0 0 0 1px rgba(4, 23, 43, 0.05), 0 4px 24px 0 rgba(0, 0, 0, 0.08)',
        'subtle-2': '0 0 0 1px rgba(4, 23, 43, 0.05), 0 8px 40px 0 rgba(0, 0, 0, 0.1)',
        'subtle-3': '0 0 0 1px rgba(4, 23, 43, 0.05), 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
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
          '0%, 100%': { boxShadow: '0 0 0 0 rgba(23, 25, 28, 0.25)' },
          '50%': { boxShadow: '0 0 0 8px rgba(23, 25, 28, 0)' },
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
