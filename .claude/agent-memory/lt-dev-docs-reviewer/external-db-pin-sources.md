---
name: external-db-pin-sources
description: Where to verify which database names reach the externally-pinned NSC__MONGOOSE__URI drop guard in tests/global-setup.ts — the pinning happens in sibling repos, not here
metadata:
  type: reference
---

This repo's own CI (`.github/workflows/test.yml`) does NOT set `NSC__MONGOOSE__URI`; it runs the
non-external branch against localhost. The names that actually hit the external-pin guard come from
sibling repos:

- `lt-monorepo/.github/workflows/test.yml` and `lt-monorepo/.gitlab-ci.yml` — pin `api-ci` (API job)
  and `app-ci-<shard>` (App/Playwright job).
- `nuxt-base-starter` CI templates — pin `app-ci`.
- `cli` `src/commands/dev/test.ts` — `lt dev test --api` forwards only the caller's `process.env`;
  the `<slug>-test` / `<slug>-test-<n>` / `<slug>-<ticket>-test` names (`deriveTestDbName` in
  `src/lib/dev-project.ts`) go to the isolated stack's API SERVER, never into vitest global-setup.
  Its bridge file for that stack is `.lt-dev/.env.test`; `config.env.ts` only loads the api's `.env`.

Review lesson from the 2026-10 guard narrowing: when a diff changes what a guard accepts, grep the
UNCHANGED comments, spec comments and thrown error strings in the same function for statements about
the old behaviour (the pathless-URI block above the guard said "a name the guard below accepts").

Related: [[verify-docker-monorepo-claims]], [[template-doc-leverage]].
