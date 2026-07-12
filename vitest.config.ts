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
    include: ['src/**/*.spec.ts', 'tests/unit/**/*.spec.ts'],
    root: './',
    // The first dynamic `import('./config.env')` cold-compiles the whole config
    // graph, which exceeds the 5s default on cold CI runners (config.env.spec.ts
    // then times out). Give unit tests headroom — they are otherwise sub-second.
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
