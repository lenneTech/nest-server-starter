---
name: no-server-boot-during-review
description: During /lt-dev:review in this repo, never boot the API or run k6 — the orchestrator runs `pnpm run check` in parallel, which boots the server itself
metadata:
  type: feedback
---

When invoked from `/lt-dev:review` in `nest-server-starter`, do **not** start the API server
and do **not** run k6 load tests. Restrict to static analysis, lockfile/dependency-graph
inspection, and read-only commands.

**Why:** the review orchestrator runs `pnpm run check` in parallel, and `scripts/check.mjs`
boots the server itself (via `scripts/check-server-start.sh`). A second server instance
collides on the listen port and on the shared local MongoDB, which both corrupts the
parallel check run and produces meaningless load-test numbers.

**How to apply:** in the k6 phase, report "Skipped — server boot forbidden during parallel
`pnpm run check`" rather than "k6 not available". Prefer read-only introspection over
anything that mutates state: `pnpm why` / `pnpm list` instead of `pnpm install`, parsing
`pnpm-lock.yaml` directly instead of `--lockfile-only` (which would rewrite the user's
working-tree lockfile). To verify `--frozen-lockfile` satisfiability without mutating,
compare the `overrides:` block recorded in `pnpm-lock.yaml` against the one in
`pnpm-workspace.yaml` — pnpm fails the frozen install exactly when those diverge.
