---
name: vitest-vite-stack-crash-probe
description: How to prove which vitest/vite pairs hit vitest-dev/vitest#11682 (code.charCodeAt crash) in seconds, and the measured matrix behind tests/unit/toolchain-compat.spec.ts
metadata:
  type: reference
---

Measured in the 2026-10-25 review of `tests/unit/toolchain-compat.spec.ts`. The starter narrowed
nest-server's guard from "vitest <= 5.0.5" to "vitest 5.0.0-5.0.5"; the probe below settled that the
narrowing is correct.

- **Deterministic probe, no MongoDB needed:** a scratch dir with `gs.ts` (globalSetup that does
  `new Error('x').stack` in setup and in the returned teardown, inside try/catch), a one-line
  `a.test.ts`, and an import-free `vitest.config.mjs` (`{ test: { globalSetup: ['./gs.ts'] } }`).
  Run `node <vitest-dir>/vitest.mjs run --config vitest.config.mjs`. The crash shows as
  `code.charCodeAt is not a function` on EVERY `.stack` read, not 1 in 3. The 1-in-3 in nest-server
  is how often the MongoDB monitor error happens, not how often the bug fires.
- **Matrix (2026-10-25):** vitest 5.0.5 + vite 8.3.5 crashes. vitest 4.1.12 + vite 8.3.5 does not.
  vitest 4.1.12 + vite 8.3.4 does not. Cause: vite 8.3.5's `extractInlineSourceMap` calls
  `code.charCodeAt` on `mod.meta.code`, and only vitest 5 hands it a Buffer.
- **Ready-made copies:** `nuxt-extensions/node_modules/.pnpm/` holds vitest 5.0.5 next to vite
  8.3.5. To pair vitest 4 with a different vite, `cp -R` the vitest dir into a scratch
  `node_modules`, symlink its pnpm siblings, point `vite` at the other copy, and copy
  `@vitest/mocker` too, because it otherwise loads its own vite.
- **Prove the loaded copy:** a `module.register` resolve hook (`node --import register.mjs ...`)
  that logs `vite@8.3.x/.../dist/node/(index|module-runner).js` with `ctx.parentURL`. Without it you
  cannot tell which vite the main process really used.

Related: [[vitest-config-not-typechecked]], [[audit-suppression-review-proofs]]
