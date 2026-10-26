---
name: cli-consumers-of-starter-config
description: Which lt CLI code reads/rewrites this starter's tsconfig.json and pnpm-workspace.yaml — check these before calling a format change a "caller this diff broke"
metadata:
  type: reference
---

When a diff changes the FORMAT of a starter config file (adds a JSONC comment, writes an inline
`[]`, adds/removes a key), the untouched callers that could break live in the sibling `cli` repo
(github.com/lenneTech/cli), not here. Checked 2026-10-25 (nest-server 12.0.0 prep):

- `tsconfig.json` / `tsconfig.build.json`: `cli/src/extensions/server.ts` (`widenTsconfigTypes`,
  `widenTsconfigExcludes`, vendor->npm "Restore tsconfig excludes") and
  `cli/src/lib/align-framework-pins.ts` (`withExplicitStrictForTs6`) all patch TEXT by regex,
  never `JSON.parse` — comments are safe; an explicit `"strict"` of either value is left alone.
- `pnpm-workspace.yaml` hoisted into a monorepo root: `cli/src/lib/hoist-workspace-pnpm-config.ts`
  parses with js-yaml and merges `auditConfig.*` / `peerDependencyRules.*` by UNION
  (`mergePnpmFieldValue`), so an empty sub-project list never wipes a sibling's entries.
- In-repo parsers of `ignoreGhsas`: `scripts/check-overrides.mjs` (`declaredEmpty` accepts
  `ignoreGhsas: []` without warning) and `tests/unit/audit-suppression-scope.spec.ts` (regex
  `^\s*-\s*GHSA-…$`, which ignores `# - GHSA-…` comment lines).
- Upstream claims ("migration guide 11.43.x -> 12.0.x §N") are verifiable in the sibling
  `nest-server/migration-guides/` even before the release is installed in node_modules.

Related: [[verify-docker-monorepo-claims]], [[template-doc-leverage]].
