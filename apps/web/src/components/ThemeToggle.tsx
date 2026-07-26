'use client';

import { useState, useEffect } from 'react';

type Theme = 'dark' | 'light';

/**
 * ThemeToggle — dark/light mode switcher.
 * Persists choice to localStorage; defaults to dark (degens prefer it).
 * Reads the current theme from the <html> class (set by the no-flash
 * inline script in layout.tsx before hydration).
 */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>('dark');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const isDark = document.documentElement.classList.contains('dark');
    setTheme(isDark ? 'dark' : 'light');
  }, []);

  const toggle = () => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    const root = document.documentElement;
    if (next === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    try {
      localStorage.setItem('orba-theme', next);
    } catch {
      // ignore (private mode, etc.)
    }
  };

  // Render a stable placeholder until mounted to avoid hydration mismatch
  if (!mounted) {
    return (
      <button
        className="btn-secondary text-sm px-2.5 py-2"
        aria-label="Toggle theme"
        disabled
      >
        ◑
      </button>
    );
  }

  return (
    <button
      onClick={toggle}
      className="btn-secondary text-sm px-2.5 py-2"
      aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
      title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
    >
      {theme === 'dark' ? '☀' : '☾'}
    </button>
  );
}
