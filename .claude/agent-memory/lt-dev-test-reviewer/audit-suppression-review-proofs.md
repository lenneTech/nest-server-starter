---
name: audit-suppression-review-proofs
description: How to prove an ignoreGhsas change without touching the tree (scratch-copy mutation run), and why pnpm audit --json metadata still counts suppressed advisories
metadata:
  type: reference
---

Learned in the 2026-10-11 review that retired GHSA-ch52-4w7c-c8xp.

- **Mutation run without editing the repo:** `tests/unit/audit-suppression-scope.spec.ts` reads `ROOT/pnpm-workspace.yaml` and runs `pnpm why`. A scratch copy only needs `package.json`, `pnpm-lock.yaml`, `vitest.config.ts`, `tsconfig.json`, `tests/unit/support/` (the signal-guard setup file), the spec itself, a mutated `pnpm-workspace.yaml`, and a symlink to the real `node_modules`. Run `node <root>/node_modules/vitest/vitest.mjs run --config vitest.config.ts <spec> -t "suppresses only"`. It finishes in about 1 s. Deleting the workspace file in that copy also proves the monorepo skip (the file is skipped, exit 0).
- **`pnpm audit --json` metadata is misleading:** with one active suppression, `advisories` is `{}` and there is no `muted` key, yet `metadata.vulnerabilities.high` is still 1. The suppressed advisory is counted in metadata. Judge by `advisories` and the exit code, not by the metadata counts.
- The spec regex `/^\s*-\s*(GHSA-[\w-]+)\s*$/gm` only sees plain `- GHSA-x` lines. A quoted entry or one with a trailing `# comment` is invisible to it. `scripts/check-overrides.mjs` (`workspaceBlock` + `scalar`) and nuxt-base-template's `check-suppressions.mjs` (`listSuppressions`) both see those forms. Only report this when a diff introduces such a form.

Related: [[vitest-config-not-typechecked]]
