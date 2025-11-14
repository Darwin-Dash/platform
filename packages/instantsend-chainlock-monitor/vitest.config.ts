import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.d.ts',
        'src/types.ts',  // Type definitions only
        'src/index.ts',  // Re-exports only
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 75,
        statements: 80,
      },
    },
    testTimeout: 30000,  // 30s for unit tests
    hookTimeout: 10000,
    include: ['tests/**/*.spec.ts', 'tests/**/*.spec.js'],
    exclude: [
      'node_modules',
      'dist',
      'tests/quick-validation.js',  // Manual validation script
      'tests/integration/instantsend-chainlock-monitor.spec.js',  // Manual integration test
      'tests/integration/automated-instantsend-chainlock.spec.js',  // Manual automated test
    ],
    reporters: ['verbose'],
    pool: 'forks',  // Separate process per test file for isolation
  },
});
