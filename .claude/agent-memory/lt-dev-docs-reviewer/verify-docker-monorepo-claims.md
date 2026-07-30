---
name: verify-docker-monorepo-claims
description: Where to verify claims this repo's Dockerfile/.dockerignore comments make about monorepo behaviour — the authority is the lt-monorepo repo, not this one
metadata:
  type: reference
---

Comments in this repo's `Dockerfile` and `.dockerignore` routinely assert things about how the
image builds *inside an lt-monorepo*. None of that is verifiable from this repo alone. The
authoritative sources live in a sibling repo:

- `/Users/kaihaase/code/lenneTech/lt-monorepo/.dockerignore` — the ignore file that is actually
  consulted in monorepo builds (uses `**/` prefixed patterns).
- `/Users/kaihaase/code/lenneTech/lt-monorepo/docker-compose.yml` — shows `context: .` (monorepo
  root) plus `API_DIR: projects/api` for the api service, which is what makes this repo's own
  `.dockerignore` inert in monorepo mode.
- `/Users/kaihaase/code/lenneTech/lt-monorepo/.gitlab-ci.yml` — CI build context.

Useful local checks in this repo:
- `pnpm why <pkg>` is authoritative for "which paths remain vulnerable"; `node_modules/.pnpm/`
  directory listings are NOT — they retain stale versions from earlier installs and will make you
  report versions that are no longer linked.
- `pnpm audit --json` hides advisories suppressed via `auditConfig.ignoreGhsas`, so it cannot be
  used to count the paths a suppression comment claims.
- CJS export shape claims (`typeof require('x')`) are cheap to verify directly against
  `node_modules/.pnpm/<pkg>@<version>/node_modules/<pkg>`.

Related: [[template-doc-leverage]].
