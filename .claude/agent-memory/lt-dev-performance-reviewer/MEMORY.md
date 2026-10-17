# lt-dev-performance-reviewer memory

- [No server boot during review](feedback_no-server-boot-during-review.md) — `/lt-dev:review` runs `pnpm run check` in parallel (which boots the server); skip k6, stay read-only.
- [Resolve vitest config read-only](reference_resolve-vitest-config-readonly.md) — prove resolved maxWorkers etc. via createVitest without running e2e.
- [Diff dep versions via virtual store](reference_diff-dep-versions-via-virtual-store.md) — old versions stay in node_modules/.pnpm; diff them read-only, but prove dedupe from lockfile.
