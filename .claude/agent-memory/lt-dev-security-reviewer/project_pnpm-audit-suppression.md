---
name: pnpm-audit-suppression
description: How to audit pnpm-workspace.yaml security config in this repo — machine-written vs hand-written entries, the ts-morph production-path trap, and pnpm 11 defaults
metadata:
  type: project
---

`pnpm-workspace.yaml` in this repo mixes **hand-written security policy** (long justification
comments above each `overrides:` entry) with **machine-written entries** produced by
`pnpm audit --fix`, which `pnpm run check:fix` / `cf` invokes. pnpm auto-appends the minimum
patched version to `minimumReleaseAgeExclude` in `name@version` form and can rewrite `overrides:`.

**Why:** the file's own comment block forbids exactly what the tool writes — it says use the
*bare package name* in `minimumReleaseAgeExclude` and never keep a standing third-party exemption.
Machine-added entries therefore look hand-authored but contradict the stated policy, and the
justification comments can drift out of sync with the entries they sit above.

**How to apply:** when reviewing a change to this file, first ask whether each new entry was typed
or generated. Cross-check every factual claim in a justification comment (path counts,
"not a runtime dependency", "same export shape") against `pnpm why <pkg>`, `pnpm audit --json`,
and the real `node_modules` — several such claims have been partially wrong.

Traps verified 2026-07-30 (re-verify, these move):

- **`ts-morph` is a production dependency**, not a dev tool: `@lenne.tech/nest-server`
  declares `"ts-morph": "28.0.0"` in `dependencies`. So `ts-morph > @ts-morph/common > minimatch >
  brace-expansion` **is in the production image**. Any "this advisory only affects devDependencies"
  claim about minimatch/brace-expansion must be checked against `pnpm list --prod --depth Infinity`,
  not just `pnpm why`.
- **`auditConfig.ignoreGhsas` is matched by GHSA id alone** — pnpm normalizes it into a Set with no
  package, version, or path scoping. An ignore justified for a devDependency path also silences the
  same advisory if it later lands on a runtime path.
- **pnpm 11 defaults `minimumReleaseAge` to 1440 minutes (1 day)** — it is a built-in default, not
  set anywhere in this repo, so grepping for the key finds nothing and the gate still applies.
  Default mode is "loose": it auto-adds immature picks to `minimumReleaseAgeExclude` and proceeds.
- **Version-pinned `minimumReleaseAgeExclude` entries**: the file's comment says they were not
  honored on pnpm 11.1.3 (pnpm issue #10361). pnpm 11.13.1 (the pinned `packageManager`) shipped
  fixes #12463 / fbdc0eb that make them work, so that comment is now outdated.
- **`format` / `format:check` now cover `src/` AND `tests/`** (changed in 11.32.4; they were `src/`
  only, so reformatting under `tests/` used to slip past CI even when `oxfmt --check` would reject
  it). Project formatter is `singleQuote: true` (`.oxfmtrc.jsonc`). Note `.claude/` is outside both
  paths, so agent-memory Markdown is NOT formatter-checked here.

Verification traps seen 2026-10-17 (override/bump reviews):

- **`node_modules/.pnpm` keeps orphaned directories from earlier installs.** Old vulnerable copies
  (e.g. `@graphql-tools+utils@12.0.4`, `@vitest+mocker@4.1.11`) and the orphaned parents that
  symlink to them stay on disk after a bump. Listing the virtual store or scanning its symlinks is
  NOT evidence of a reachable copy; check `pnpm why <pkg>` and the lockfile, then confirm the
  symlinks of the packages the lockfile actually lists.
- **Brand-new repo advisories return 404 from `gh api /advisories/<GHSA>`** for the first days
  (e.g. the vitest `@vitest/mocker` ones). Query
  `gh api /repos/<owner>/<repo>/security-advisories/<GHSA>` to get the range and the patched version.

Retiring an `ignoreGhsas` entry by commenting it out (`# - GHSA-…`) is safe, verified 2026-10-11:
every parser skips `#` lines (pnpm's YAML, this repo's and lt-monorepo's `check-overrides.mjs`
via `/^\s*#/`, nuxt-base-starter's `check-suppressions.mjs`, the scope spec's
`/^\s*-\s*(GHSA-…)\s*$/m`), and the lt CLI hoist (`cli/src/lib/hoist-workspace-pnpm-config.ts`)
re-dumps via js-yaml and only carries comments sitting above FIRST-level keys of `auditConfig`,
so no comment under `ignoreGhsas` items reaches a generated monorepo root. In a monorepo, a
hoisted entry with no vulnerable version in the lockfile fails `pnpm run check` ("NOT IN TREE").

State since 2026-10-24: `ignoreGhsas: []` (flow style, empty). The retired assessments now sit
ABOVE that first-level key, so the CLI hoist does carry them into a monorepo root (harmless text).
Trap for the NEXT suppression: if someone edits in place to `ignoreGhsas: [GHSA-…]`, the scope
spec's block-style regex sees zero entries and passes, and `check-overrides.mjs` only WARNs
("parsed 0 entries", it does not fail). Re-adding must use the indented `- GHSA-…` form; flag a
flow-style non-empty list as an unguarded suppression.

better-auth / @better-auth/core / passkey are PEER ranges of nest-server (`>=1.7.7 <1.8.0` on
11.43.3), not exact deps, so a starter bump ahead of the framework yields ONE shared copy. Confirm
via the `@lenne.tech/nest-server@…(better-auth@X…)` snapshot key in the lockfile, not `require()`
(better-auth's `exports` blocks `better-auth/package.json`).
