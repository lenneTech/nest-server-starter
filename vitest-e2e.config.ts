import os from 'node:os';

import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

import { countOtherActiveRuns } from './tests/e2e-run-slots';

// Low-resource mode — caps parallel forks and raises timeouts so many e2e suites can share one
// machine's CPU and mongod without starving each other (e.g. several parallel `lt dev` /
// `lt ticket` environments). The failure mode it prevents: when 2+ full e2e runs overlap,
// requests queue past the 30s testTimeout and auth queries fail as spurious 401s.
//
// AUTO-ENABLES on either of two signals. Explicit settings still win, in both directions:
//
//   CHECK_LOW_RESOURCE=1 / true  -> force on   (CI, or a machine you know is busy)
//   CHECK_LOW_RESOURCE=0 / false -> force off  (benchmarking; never auto-throttle)
//   unset                        -> auto       (on iff another e2e run is active OR load is high)
//
// Signal 1 — another e2e run is ACTIVE right now (slot files of tests/e2e-run-slots.ts, checked
// by PID-liveness). This is the deterministic signal: a single full-speed run only drives the
// 1-minute load average up near its END, so a second run starting a few seconds in still sees a
// "calm" machine — the load heuristic alone structurally cannot catch overlapping starts.
//
// Signal 2 — the 1-minute load average normalised per core is already high (>= LOAD_THRESHOLD).
// This catches machine pressure from anything that is NOT an e2e run (builds, dev servers, other
// tools). Load average is unavailable on Windows (os.loadavg() returns zeros), where this signal
// simply stays off — the slot signal and the explicit flag remain available.
//
// Optionally pin the fork cap with CHECK_LOW_RESOURCE_FORKS=<n>.
const LOAD_THRESHOLD = 0.7;

const CORES = os.availableParallelism?.() ?? os.cpus()?.length ?? 4;
const NORMALISED_LOAD = (os.loadavg()?.[0] ?? 0) / CORES;
const ACTIVE_E2E_RUNS = countOtherActiveRuns();

const LOW_RESOURCE_RAW = process.env.CHECK_LOW_RESOURCE;
const LOW_RESOURCE_FORCED_OFF = LOW_RESOURCE_RAW === '0' || LOW_RESOURCE_RAW === 'false';
const LOW_RESOURCE_FORCED_ON = !!LOW_RESOURCE_RAW && !LOW_RESOURCE_FORCED_OFF;
const LOW_RESOURCE_AUTO =
  LOW_RESOURCE_RAW === undefined && (ACTIVE_E2E_RUNS > 0 || NORMALISED_LOAD >= LOAD_THRESHOLD);
const LOW_RESOURCE = LOW_RESOURCE_FORCED_ON || LOW_RESOURCE_AUTO;
const LOW_RESOURCE_FORKS = (() => {
  if (!LOW_RESOURCE) return undefined;
  const explicit = Number(process.env.CHECK_LOW_RESOURCE_FORKS);
  if (Number.isInteger(explicit) && explicit > 0) return explicit;
  return Math.max(2, Math.floor(CORES / 3));
})();
if (LOW_RESOURCE) {
  const why = LOW_RESOURCE_FORCED_ON
    ? 'CHECK_LOW_RESOURCE set'
    : ACTIVE_E2E_RUNS > 0
      ? `${ACTIVE_E2E_RUNS} other e2e run(s) active on this machine`
      : `machine is busy (load ${NORMALISED_LOAD.toFixed(2)}/core >= ${LOAD_THRESHOLD})`;
  process.stderr.write(`[e2e] low-resource mode: ${why} -> maxForks=${LOW_RESOURCE_FORKS}, timeouts raised\n`);
}

export default defineConfig({
  // Vite 8 switched the default TS/JS transformer from esbuild to Oxc. unplugin-swc
  // disables esbuild internally — without `oxc: false`, Oxc would still run in parallel.
  oxc: false,
  plugins: [swc.vite()],
  test: {
    globals: true,
    environment: 'node',
    globalSetup: ['tests/global-setup.ts'],
    // Per-worker database isolation: appends the vitest pool id to NSC__MONGOOSE__URI in each fork
    // so parallel spec files never share one database (prevents the shared-DB 401 flake).
    setupFiles: ['tests/setup.ts'],
    // Suites that need the mongod + globalSetup this config provides: e2e specs (see the
    // `*.e2e-spec.ts` convention in CLAUDE.md) and story tests, which TDD workflows create
    // under tests/stories/. Naming the patterns explicitly (instead of `tests/**/*.ts`)
    // keeps helpers, global-setup and reporters out without an exclude list — and, crucially,
    // keeps `tests/unit/**` out: those run via vitest.config.ts and would otherwise execute
    // twice, here against a database they neither need nor use.
    include: ['tests/**/*.e2e-spec.ts', 'tests/stories/**/*.story.test.ts'],
    root: './',
    // db-lifecycle: drops this run's unique DB on success (+ collects stale
    // run DBs), keeps it for debugging on failure — see tests/db-lifecycle.reporter.ts
    reporters: ['default', './tests/db-lifecycle.reporter.ts'],
    testTimeout: LOW_RESOURCE ? 60000 : 30000,
    // Hooks are NOT covered by `retry` (tests only) — a beforeAll that boots a
    // full Nest app can exceed 60s under load (parallel transform/import),
    // which failed whole files without any retry. Be generous here.
    hookTimeout: LOW_RESOURCE ? 240000 : 120000,
    teardownTimeout: 30000,
    // Use forks instead of threads for better NestJS performance
    pool: 'forks',
    // Cap parallel fork workers ONLY in low-resource mode (see CHECK_LOW_RESOURCE
    // above); default = vitest's own (~CPU count) for full-speed solo runs.
    ...(LOW_RESOURCE ? { poolOptions: { forks: { maxForks: LOW_RESOURCE_FORKS, minForks: 1 } } } : {}),
    // PARALLEL CONFIGURATION: Fast execution with retry mechanism
    // Files run in parallel for maximum speed
    // Flaky tests are automatically retried up to 3 times
    // Isolate each test file in its own process for stability
    isolate: true,
    // Enable parallel file execution for speed
    fileParallelism: true,
    // Allow multiple files to run concurrently
    maxConcurrency: 4,
    // Retry flaky tests before failing (intermittent MongoDB race conditions).
    // Deliberately LOW: retry multiplies worst-case runtime per test — a spec file
    // whose app/socket state broke under resource pressure grinds through
    // (1+retry) attempts × testTimeout × tests, which looks like a deadlock. The
    // e2e-run governor removes the pressure trigger; retry: 2 caps the multiplier.
    retry: 2,
    // Optimize file watching (not needed in CI)
    watch: false,
  },
});
