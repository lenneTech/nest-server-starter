---
name: vitest-config-not-typechecked
description: A type-check never guards vitest config keys here — under module commonjs vitest's config type collapses to any. The runtime spec tests/unit/vitest-e2e-config.spec.ts is the guard.
metadata:
  type: reference
---

A claim that "TypeScript catches a removed or misspelled vitest option" is false in this repo. Found during the 2026-10-07 review of the maxWorkers fix.

- `vitest-e2e.config.ts` sits at the repo root, outside `tsconfig.tests.json`'s include. Since 2026-10-07 `tests/unit/vitest-e2e-config.spec.ts` imports it, so `typecheck:tests` does load it now — and it still catches nothing.
- The reason is resolution, not an overload: `tsconfig.json` has `module: commonjs` (node10 resolution), which cannot resolve vitest's ESM-only type imports (`vite`, `vite/module-runner`, `@vitest/utils/display`). `skipLibCheck: true` hides those TS2307s, the config type collapses to `any`, and `test: { poolOptions: ..., totallyBogusOption: 1 }` type-checks clean. With `module: nodenext` the same file is rejected (TS2769, excess property). Reproduce with `--skipLibCheck false` to see the unresolved imports.
- The working guard is that unit spec: it imports the config under env (`CHECK_LOW_RESOURCE=1`, `CHECK_LOW_RESOURCE_FORKS=3`, a temp `LT_E2E_SLOT_DIR`) and asserts the resolved `maxWorkers`. Removed vitest options only print a `DEPRECATED` line at runtime.

**How to apply:** when a diff relies on "the type-check would catch it" for vitest config, verify it against THIS repo's tsconfig, not a scratch default. Related: `mkdtempSync` already creates dirs 0700, so a mode assertion on a mkdtemp dir is vacuous. Point it at a not-yet-existing subdir instead.
