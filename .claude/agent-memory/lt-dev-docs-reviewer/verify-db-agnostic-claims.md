---
name: verify-db-agnostic-claims
description: Where to verify starter docs about nest-server 12.1+ SQL data sources (NSC__DATABASE__*, owner role, gridfs, lt_migrations) and the version rule shared with nest-server's consumer gate
metadata:
  type: reference
---

Since nest-server 12.1.0 the starter documents opt-in SQL sources in `.env.example`, `src/config.env.ts`,
`docker-entrypoint.sh` and `migrations-utils/migrate.js`. These framework files settle the claims
(npm mode: under `node_modules/@lenne.tech/nest-server/`):

- Env var name -> config path: `getEnvironmentObject()` in `src/core/common/helpers/config.helper.ts`
  (`__` = nesting, `_` = camelCase boundary). Target shape: `IDatabaseConfig` in `server-options.interface.ts`.
- "MongoDB stays the extra source `mongoose`": `core.module.ts`, `explicitMongoose: !!options?.mongoose`.
  The starter's `deployedConfig()` sets no `mongoose` key, so only `NSC__MONGOOSE__URI` makes it explicit.
- `ownerUrl` without `url` refused, URL redaction: `src/core/common/persistence/data-source.config.ts`.
- Derived file driver on SQL metadata (filesystem, or s3 when a bucket is configured): `resolveFileStorage()`
  in `src/core/modules/file/file-storage.helper.ts`.
- `lt_migrations` / SQL state store: `createMigrationStore()` in `src/core/modules/migrate/migration.helper.ts`.
  The `--sql` template reads `NSC__DATABASE__OWNER_URL`: `migrate/cli/migrate-cli.ts`.
- The role limits (PG: superuser/BYPASSRLS/owner/TRUNCATE; MySQL: alter/drop/index/trigger/grant) are in the
  migration guide 12.0.x-to-12.1.x §3/§7 and the "Data Sources" row of `.claude/rules/configurable-features.md`.

`extras/align-package-versions.mjs` claims to match nest-server's `alignConsumerPins()` in the SIBLING repo
`nest-server/scripts/check-consumer.mjs` (it does not ship in node_modules). When a diff changes the starter rule,
grep that file before accepting a "keep the two identical" sentence.

Related: [[cli-consumers-of-starter-config]], [[template-doc-leverage]].
