import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Vite 8 switched the default TS/JS transformer from esbuild to Oxc. unplugin-swc
  // disables esbuild internally — without `oxc: false`, Oxc would still run in parallel.
  oxc: false,
  plugins: [swc.vite()],
  test: {
    // NOTE: `disableConsoleIntercept` is deliberately NOT set here, unlike in vitest-e2e.config.ts.
    // It was set briefly and removed once both sides were measured.
    //
    // The flag exists to close a vitest race: console writes are forwarded to the main thread as
    // `onUserConsoleLog` RPCs, and at worker teardown `execute()` REJECTS whatever is still in
    // flight instead of awaiting it, failing the run with `EnvironmentTeardownError` while every
    // test passes. See vitest-e2e.config.ts for the full mechanism.
    //
    // Measured for THIS suite, and the numbers point opposite ways:
    //
    //   RPC traffic       114 console.info writes per run (`Configured for: …` and two siblings,
    //                     because src/config.env.spec.ts re-imports config.env per test via
    //                     `vi.resetModules()`; the source is console.info in config.helper.js)
    //   Observed flakes   0 in 15 runs
    //   Cost of the flag  0 -> 114 visible lines in every green `check`
    //
    // So this suite is NOT free of exposure — an earlier version of this comment claimed "ZERO
    // console lines", which was a measurement artefact: `grep -cE '^(stdout|stderr) \| '` counts
    // what the REPORTER PRINTS, and the default reporter swallows passing-test output in a piped
    // run. The writes were there all along, just invisible.
    //
    // The flag is still left off, because write COUNT does not predict the race — write TIMING
    // relative to the end of a file does, and these fire mid-test with the file's remaining work
    // still to come. 114 lines of noise in every green run against a race that did not appear in
    // 15 is the worse trade.
    //
    // THE BETTER FIX, if this ever does flake: silence the writes at the source rather than
    // choosing between noise and a race. nuxt-base-starter measures 0 writes AND 0 noise because
    // its `tests/unit/setup.ts` mocks `console.debug`/`console.info` globally. A `setupFiles`
    // entry here would do the same. Reach for that before reaching for the flag.
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
