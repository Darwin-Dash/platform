import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    // Test environment - use jsdom for browser-like tests
    environment: 'node',

    // Test file patterns - include both unit and integration tests
    include: [
      'tests/unit/**/*.spec.ts',
      'tests/integration/**/*.spec.ts',
    ],
    exclude: ['node_modules', 'dist'],

    // Timeout configuration
    testTimeout: 120000,
    hookTimeout: 60000,

    // Run tests sequentially to avoid WASM concurrency issues
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true, // Single process to prevent WASM conflicts
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
      '@dashevo/wasm-sdk/compressed': '@dashevo/wasm-sdk',
    },
  },
});
