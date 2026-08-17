import nextVitals from 'eslint-config-next/core-web-vitals';

export default [
  ...nextVitals,
  {
    ignores: ['.next/**', 'node_modules/**', 'public/static/charting_library/**'],
  },
  {
    rules: {
      // These rules require a React Compiler migration across existing routes.
      // Keep the release gate focused on errors the current runtime can enforce.
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/purity': 'off',
      'react-hooks/exhaustive-deps': 'off',
      'react-hooks/refs': 'off',
      'react/no-unescaped-entities': 'off',
      '@next/next/no-page-custom-font': 'off',
    },
  },
];
