import type { Config } from 'jest';

const config: Config = {
  rootDir: '.',
  testEnvironment: 'node',
  testRegex: '.spec.ts$',
  transform: {
    '^.+\\.ts$': 'ts-jest',
  },
  moduleNameMapper: {
    '^@orbafun/shared$': '<rootDir>/../../packages/shared/src',
  },
  moduleFileExtensions: ['ts', 'js', 'json'],
  // Exclude e2e tests and compiled output
  testPathIgnorePatterns: ['/node_modules/', '/dist/', '/e2e/'],
  // Verbose output for CI readability
  verbose: true,
  // Clear mocks between tests
  clearMocks: true,
};

export default config;
