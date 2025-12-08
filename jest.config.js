module.exports = {
  testEnvironment: 'node',
  globalSetup: '<rootDir>/globalTestSetup.js',
  globalTeardown: '<rootDir>/globalTestTeardown.js',
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
  testMatch: [
    '**/tests/unit/**/*.test.js',
    '**/tests/integration/**/*.test.js',
    '**/tests/e2e/**/*.test.js',
    '**/routes/*.test.js',
    '**/middlewares/*.test.js'
  ],
  coverageDirectory: 'coverage',
  collectCoverageFrom: [
    'components/**/*.js',
    'routes/**/*.js',
    'services/**/*.js',
    'middlewares/**/*.js',
    'db/**/*.js',
    'utils.js',
    'utils-eth.js',
    '!**/*.test.js',
    '!**/node_modules/**'
  ],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80
    }
  },
  testTimeout: 30000,
  verbose: true
};

