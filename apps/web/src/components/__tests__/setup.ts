import { expect } from 'vitest';
import * as matchers from '@testing-library/jest-dom/matchers';

process.env.NEXT_PUBLIC_TOKEN_FACTORY_ADDRESS ??= '0xF09FC443D4f0F217F1B65d112b5fB8928a4ff09E';
process.env.NEXT_PUBLIC_TREASURY_ADDRESS ??= '0xDC9471561269845249614cfB4e42cFdd73F2E828';
process.env.NEXT_PUBLIC_MIGRATOR_ADDRESS ??= '0x0667b432ac7beB7C4039b01C8bC979e34474313f';
process.env.NEXT_PUBLIC_AMM_FACTORY_ADDRESS ??= '0xf2FDf9ea4efEFb49910A96e959642112d1A00B8b';

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
