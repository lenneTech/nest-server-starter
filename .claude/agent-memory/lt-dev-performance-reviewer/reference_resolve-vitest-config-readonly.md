---
name: resolve-vitest-config-readonly
description: How to prove what the e2e vitest config resolves to (maxWorkers, pool options) without running the suite, which is forbidden during /lt-dev:review
metadata:
  type: reference
---

To check what `vitest-e2e.config.ts` actually resolves to, without running the e2e suite, use
vitest's Node API from a scratchpad script: `parseCLI('vitest run --config vitest-e2e.config.ts <flags>')`,
then `createVitest('test', {...parsed.options, watch: false})`, read `v.config.<opt>` and
`v.projects[0].config.<opt>`, then `await v.close()`. `createVitest` does not run `globalSetup`,
so it does not touch MongoDB or claim an e2e slot.

Two things to get right:
- Import vitest by its absolute path (`<vitest pkg dir>/dist/node.js`). A bare `'vitest/node'`
  does not resolve from the scratchpad.
- Set `LT_E2E_SLOT_DIR` to a scratch directory. Loading the config calls `countOtherActiveRuns()`,
  which deletes stale slot files in the shared machine-wide slot directory.

Run it under each relevant env (`CHECK_LOW_RESOURCE=0/1`) and CLI flag (`--max-workers=N`) to
cover the branches. Applies the rule in [[no-server-boot-during-review]].
