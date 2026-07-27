import { expect } from 'vitest';
import * as matchers from '@testing-library/jest-dom/matchers';

// Extend vitest's expect with jest-dom matchers (toBeInTheDocument, etc.)
expect.extend(matchers);

// Only run DOM-specific setup when running in jsdom/browser environment.
// The setup file is shared across all tests (including node-only .ts tests).
if (typeof window !== 'undefined') {
  // Mock ResizeObserver (used by lightweight-charts and other chart components)
  global.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };

  // Mock matchMedia (needed for responsive components)
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}

// Suppress specific console warnings during tests
const originalWarn = console.warn;
console.warn = (...args: unknown[]) => {
  const msg = typeof args[0] === 'string' ? args[0] : '';
  if (msg.includes('ReactServerComponents') || msg.includes('useRouter')) return;
  originalWarn.call(console, ...args);
};
