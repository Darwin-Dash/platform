import { defineConfig } from 'vitest/config';
import path from 'path';
import { config } from 'dotenv';

// Load .env file at config time
config();

export default defineConfig({
  test: {
    // Test environment - use jsdom for browser-like tests
    environment: 'node',

    // Test file patterns - include both unit and integration tests
    // NOTE: When running specific tests with --run, also use path to limit file collection
    include: [
      'tests/unit/**/*.spec.ts',
      'tests/integration/**/*.spec.ts',
    ],

    // Isolate test files to prevent WASM conflicts
    isolate: true,
    exclude: ['node_modules', 'dist'],

    // Timeout configuration
    testTimeout: 120000,
    hookTimeout: 60000,

    // Run tests with threads pool - forks have async behavior issues with WASM
    // The forks pool creates child processes that don't properly handle WASM async operations,
    // causing "already locked to a reader" errors from wasm-streams
    pool: 'threads',
    poolOptions: {
      threads: {
        singleThread: true, // Single thread to prevent WASM conflicts
        maxThreads: 1, // Limit to 1 worker thread to prevent parallel file execution
        minThreads: 1, // Don't spawn extra threads
      },
    },

    // Coverage configuration
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/types/**', 'tests/**'],
    },

    // Globals - provides describe, it, expect, vi, etc.
    globals: true,

    // Setup files
    setupFiles: ['tests/setup.ts'],

    // Stop on first failure — integration tests are sequential and dependent
    bail: 1,

    // Reporter
    reporter: 'verbose',

    // Mock reset
    mockReset: true,
    restoreMocks: true,
  },

  // Resolve aliases
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      // Use non-compressed WASM SDK in tests to avoid dynamic import issues
      // The compressed version uses `new Function('return import("node:zlib")')`
      // which Vitest's VM doesn't support
      // Map to the explicit dist path for correct resolution
      '@dashevo/wasm-sdk/compressed': path.resolve(__dirname, '../wasm-sdk/dist/sdk.js'),
    },
  },
});
