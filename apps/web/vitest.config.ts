import { defineConfig } from 'vitest/config';
import path from 'path';

// Use esbuild's built-in JSX support for tests instead of @vitejs/plugin-react.
// The React plugin is designed for dev/production builds and may not activate
// correctly in vitest's test pipeline. esbuild handles the automatic JSX
// runtime natively and works reliably with vitest.
export default defineConfig({
  esbuild: {
    jsx: 'automatic',
    jsxImportSource: 'react',
  },
  test: {
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    exclude: ['node_modules', '.next', 'dist'],
    clearMocks: true,
    setupFiles: ['./src/components/__tests__/setup.ts'],
    environmentMatch: {
      'src/**/__tests__/*.test.tsx': 'jsdom',
    },
    environment: 'node',
    css: false,
    server: {
      deps: {
        inline: ['react', 'react-dom', 'react/jsx-runtime'],
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@orbafun/shared': path.resolve(__dirname, '../../packages/shared/src'),
      'next/link': path.resolve(__dirname, './src/components/__tests__/mocks/next-link.tsx'),
    },
  },
});
