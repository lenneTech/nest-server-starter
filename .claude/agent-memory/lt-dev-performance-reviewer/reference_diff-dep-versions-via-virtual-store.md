---
name: diff-dep-versions-via-virtual-store
description: For dependency-bump reviews, node_modules/.pnpm keeps the previous versions unpruned — diff old vs new dist read-only there; but never count .pnpm dirs as proof of duplicate copies
metadata:
  type: reference
---

`node_modules/.pnpm/` in this repo is not pruned after an update: previous versions of bumped packages
(e.g. `@lenne.tech+nest-server@11.42.15_*`, `@graphql-tools+utils@12.0.4_*`, `vitest@4.1.11_*`) stay
next to the new ones.

**Use it:** to see what a version bump changes at runtime without installing or fetching anything,
`diff -rq <old>/dist <new>/dist` (or `cjs/`) between the two virtual-store dirs, then `diff` the
changed files. Then grep the consumers' `dist` (`--include='*.js'` quoted — zsh globs it otherwise) to
see whether a changed function is actually called per request or only at schema build/startup.

**Do not misuse it:** the presence of several `@x+y@<ver>` dirs is NOT evidence of duplicate copies
in the tree. Prove (de)duplication from `pnpm-lock.yaml` (`grep -nE "^  '?<pkg>@[0-9]"` in the
packages/snapshots sections) and by `readlink -f` on each consumer's `node_modules/<pkg>` symlink.
Applies the read-only rule in [[no-server-boot-during-review]].
