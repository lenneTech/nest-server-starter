import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Vite 8 switched the default TS/JS transformer from esbuild to Oxc. unplugin-swc
  // disables esbuild internally — without `oxc: false`, Oxc would still run in parallel.
  oxc: false,
  plugins: [swc.vite()],
  test: {
    // NOTE: `disableConsoleIntercept` is deliberately NOT set here, unlike in vitest-e2e.config.ts.
    //
    // The flag closes a vitest race: console writes are forwarded to the main thread as
    // `onUserConsoleLog` RPCs, and at worker teardown `execute()` REJECTS whatever is still in
    // flight instead of awaiting it — failing the run with `EnvironmentTeardownError` while every
    // test passes. The full mechanism is documented in vitest-e2e.config.ts, where the flag IS set.
    //
    // This suite does not need it, because its writes were removed at the source rather than
    // hidden: `src/config.env.spec.ts` re-imports config.env per test via `vi.resetModules()`,
    // which produced 114 `console.info` writes per run — every other spec emits zero. A scoped
    // `vi.spyOn(console, 'info')` in that one file took it to 0 without costing any other spec its
    // diagnostics. Silencing at the source beats both alternatives: the flag would have surfaced
    // all 114 lines as noise, a global console mock in a setup file would have blinded every spec.
    //
    // If console writes ever return here, reach for that same fix first, and only then for the
    // flag. When measuring, do NOT count reporter lines (`grep -cE '^(stdout|stderr) \| '`) — the
    // default reporter swallows passing tests' output in a piped run, so it reported 0 while all
    // 114 writes were going over the RPC. Diff two runs with the flag flipped in the CONFIG FILE.
    globals: true,
    environment: 'node',
    include: ['src/**/*.spec.ts', 'tests/unit/**/*.spec.ts'],
    root: './',
    // The first dynamic `import('./config.env')` cold-compiles the whole config
    // graph, which exceeds the 5s default on cold CI runners (config.env.spec.ts
    // then times out). Give unit tests headroom — they are otherwise sub-second.
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
