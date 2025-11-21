import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    testTimeout: 600000, // 10 minutes for blockchain operations
    hookTimeout: 60000, // 1 minute for setup/teardown
    teardownTimeout: 30000, // 30 seconds for cleanup
    isolate: true, // Isolate test contexts
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/**',
        'dist/**',
        'tests/**',
        '**/*.spec.ts',
        '**/*.test.ts',
        '**/*.spec.mjs',
      ],
      thresholds: {
        lines: 70,
        functions: 70,
        branches: 70,
        statements: 70,
      },
    },
    include: [
      'tests/**/*.spec.ts',
      'tests/**/*.test.ts',
      'tests/**/*.spec.mjs',
    ],
    exclude: [
      'node_modules/**',
      'dist/**',
      'tests/fixtures/**',
      'tests/helpers/**',
    ],
  },
});
