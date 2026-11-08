'use client';

import { useEffect, useState } from 'react';

export function ThemeToggle() {
  const [dark, setDark] = useState(false);
  useEffect(() => setDark(document.documentElement.classList.contains('dark')), []);

  return <button type="button" className="text-text-secondary hover:text-text-primary"
    aria-pressed={dark} onClick={() => {
      const next = !dark;
      document.documentElement.classList.toggle('dark', next);
      document.documentElement.style.colorScheme = next ? 'dark' : 'light';
      try { localStorage.setItem('orba-theme', next ? 'dark' : 'light'); } catch {}
      setDark(next);
    }}>Dark mode</button>;
}
