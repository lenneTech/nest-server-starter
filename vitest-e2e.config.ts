import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Vite 8 switched the default TS/JS transformer from esbuild to Oxc. unplugin-swc
  // disables esbuild internally — without `oxc: false`, Oxc would still run in parallel.
  oxc: false,
  plugins: [swc.vite()],
  test: {
    globals: true,
    environment: 'node',
    globalSetup: ['tests/global-setup.ts'],
    include: ['tests/**/*.ts'],
    exclude: ['tests/vitest-reporter.ts', 'tests/helpers/**/*', 'tests/global-setup.ts', 'tests/db-lifecycle.reporter.ts'],
    root: './',
    // db-lifecycle: drops this run's unique DB on success (+ collects stale
    // run DBs), keeps it for debugging on failure — see tests/db-lifecycle.reporter.ts
    reporters: ['default', './tests/db-lifecycle.reporter.ts'],
    testTimeout: 30000,
    // Hooks are NOT covered by `retry` (tests only) — a beforeAll that boots a
    // full Nest app can exceed 60s under load (parallel transform/import),
    // which failed whole files without any retry. Be generous here.
    hookTimeout: 120000,
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
