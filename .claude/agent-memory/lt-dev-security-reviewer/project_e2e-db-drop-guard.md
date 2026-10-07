---
name: e2e-db-drop-guard
description: Which live DB names can reach tests/global-setup.ts's external-URI dropDatabase, derived from the lt CLI's naming (ticket ids are numeric-only), and what the slot-dir hardening does and does not cover
metadata:
  type: project
---

`tests/global-setup.ts` drops whatever an externally set `NSC__MONGOOSE__URI` names, gated only by a
name heuristic (`isExternallyDroppableTestDb`, since 2026-10). The env var reaches a dev shell through
the lt CLI's dotenv bridge `.lt-dev/.env` (cli `src/lib/dev-env-bridge.ts`, documented workflow:
`lt dev up` in shell A, `pnpm test:e2e` in shell B).

**Why:** the guard is a name heuristic, so judge it against the names the CLI actually produces,
which live in another repo (`cli/src/lib/dev-project.ts`, `dev-ticket.ts`, `dev-test-session.ts`):
- dev `<base>-local`; `lt dev test` `<base>-test`, `<base>-test-<shard>`
- ticket dev DB `<base>-<id>` and ticket test DB `<base>-<id>-test`. `deriveTicketId('DEV-3403')`
  returns `3403`, numeric only, so ticket DBs NEVER carry a `dev`/`local` marker.
- Residual hole (as of 2026-10-07, old and new guard alike): a base that itself has a delimited
  `ci`/`e2e`/`acctest` segment (`ci-portal`, the slug the code comments cite as real) passes for
  `ci-portal-test` AND for the ticket dev DB `ci-portal-3403`. It's a data-safety issue, not a
  security one, and existed before the 2026-10 narrowing.

**How to apply:** when this guard changes again, re-run the candidate names above through old and
new regex (a strict-subset check is quick in node). For the slot dir (`tests/e2e-run-slots.ts`):
`unlink` + `wx` + `0600` was verified to refuse a planted file-level symlink (also a dangling one).
A symlinked slot DIRECTORY is still followed, but only creates a fresh `<pid>.slot` with fixed
JSON content. That has no payoff, so don't re-flag it.
