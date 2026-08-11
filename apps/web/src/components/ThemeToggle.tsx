'use client';

import { MoonStars, Sun } from '@phosphor-icons/react';
import { useEffect, useState } from 'react';

type Theme = 'light' | 'dark';

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>('light');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setTheme(document.documentElement.classList.contains('dark') ? 'dark' : 'light');
    setMounted(true);
  }, []);

  const toggleTheme = () => {
    const nextTheme: Theme = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.classList.toggle('dark', nextTheme === 'dark');
    document.documentElement.style.colorScheme = nextTheme;
    setTheme(nextTheme);
    document.cookie = `orba-theme=${nextTheme}; path=/; max-age=31536000; SameSite=Lax`;
    try {
      localStorage.setItem('orba-theme', nextTheme);
    } catch {
      // Cookies keep the preference persistent when storage is unavailable.
    }
  };

  return (
    <button
      type="button"
      className="icon-button"
      onClick={toggleTheme}
      aria-label={mounted && theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
      title={mounted && theme === 'dark' ? 'Light mode' : 'Dark mode'}
    >
      {mounted && theme === 'dark' ? <Sun size={18} weight="bold" /> : <MoonStars size={18} weight="bold" />}
    </button>
  );
}
