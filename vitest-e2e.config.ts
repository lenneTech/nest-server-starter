import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [swc.vite()],
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.ts'],
    exclude: ['tests/vitest-reporter.ts', 'tests/helpers/**/*'],
    root: './',
    reporters: ['default'],
    testTimeout: 30000,
    hookTimeout: 60000,
    teardownTimeout: 30000,
    // Use forks instead of threads for better NestJS performance
    pool: 'forks',
    // PARALLEL CONFIGURATION: Fast execution with retry mechanism
    // Files run in parallel for maximum speed
    // Flaky tests are automatically retried up to 3 times
    // Isolate each test file in its own process for stability
    isolate: true,
    // Enable parallel file execution for speed
    fileParallelism: true,
    // Allow multiple files to run concurrently
    maxConcurrency: 4,
    // Retry flaky tests up to 3 times before failing
    // This handles intermittent MongoDB race conditions
    retry: 3,
    // Optimize file watching (not needed in CI)
    watch: false,
  },
});
