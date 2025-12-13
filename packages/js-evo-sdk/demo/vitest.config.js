import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    // Test environment - use node for service tests (no DOM needed)
    environment: 'node',

    // Global setup
    globals: true,

    // Coverage configuration
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: [
        'services/**/*.js',
        'components/**/*.js',
        'utils/**/*.js'
      ],
      exclude: [
        'node_modules/**',
        'dist/**',
        'tests/**',
        '**/*.config.js',
        '**/mock-data.js' // Exclude mock data from coverage
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 75,
        statements: 80
      }
    },

    // Test file patterns - support both .test.js and .spec.js
    // Note: testnet tests are excluded by default (run with npm run test:testnet)
    include: [
      'tests/unit/**/*.test.js',
      'tests/unit/**/*.spec.js',
      'tests/integration/**/*.test.js',
      'tests/integration/**/*.spec.js',
      'tests/testnet/**/*.spec.js'
    ],

    // Setup files
    setupFiles: ['./tests/setup/vitest-setup.js'],

    // Timeouts (increased for network operations)
    testTimeout: 300000,  // 5 minutes for real testnet tests
    hookTimeout: 60000    // 1 minute for connection setup
  },

  resolve: {
    alias: {
      '@': path.resolve(__dirname, './'),
      '@utils': path.resolve(__dirname, './utils'),
      '@components': path.resolve(__dirname, './components')
    }
  }
});