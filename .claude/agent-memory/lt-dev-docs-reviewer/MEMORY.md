# Documentation Reviewer Memory — nest-server-starter

- [Template doc leverage](template-doc-leverage.md) — this repo is cloned into every lt project; grade comment ACCURACY over presence, flag frozen counts and language drift.
- [Verifying Docker/monorepo claims](verify-docker-monorepo-claims.md) — lt-monorepo is the authority for monorepo build-context claims; `pnpm why` beats `node_modules/.pnpm` listings.
- [External DB pin sources](external-db-pin-sources.md) — which repos pin NSC__MONGOOSE__URI names the global-setup drop guard sees; `lt dev test --api` never injects `-test`.
- [CLI consumers of starter config](cli-consumers-of-starter-config.md) — cli code that rewrites tsconfig/pnpm-workspace (text regex, js-yaml union); check before "caller broke".
- [Verifying DB-agnostic claims](verify-db-agnostic-claims.md) — framework files that settle NSC__DATABASE__*, owner role, gridfs, lt_migrations; consumer-gate parity lives in sibling nest-server.
