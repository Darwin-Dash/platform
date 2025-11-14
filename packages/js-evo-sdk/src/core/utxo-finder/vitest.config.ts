import { defineConfig } from 'vitest/config';
import { config } from 'dotenv';

// Load .env file for environment variables
config();

export default defineConfig({
  test: {
    // Use node environment for backend testing
    environment: 'node',

    // Test file discovery
    include: ['**/__tests__/**/*.test.ts'],

    // Coverage configuration
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: ['src/index.ts', 'src/types.ts'],
      lines: 80,
      functions: 80,
      branches: 75,
      statements: 80,
    },

    // Test reporter
    reporters: ['verbose'],

    // Globals - use describe, it, expect without imports
    globals: true,

    // Setup files
    setupFiles: [],

    // Timeout for integration tests
    // Increased to 120s for public testnet infrastructure which has higher latency
    // Individual tests that scan large block ranges may override with higher values
    testTimeout: 120000,

    // Hook timeout for beforeAll/afterAll
    // Increased to 30s for testnet setup which requires DAPI connection
    hookTimeout: 30000,
  },
});
