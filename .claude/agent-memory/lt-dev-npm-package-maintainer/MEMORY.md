# npm-package-maintainer Memory - nest-server-starter

## Key Findings (last updated 2026-04-11, session 5)

### Packages that MUST stay despite appearing unused in grep
- `supertest` + `@types/supertest`: Required by `@lenne.tech/nest-server/dist/test/test.helper.js` at runtime even though no direct test import. REMOVING BREAKS TESTS.

### Package Categorization Changes
- `mongodb` moved to devDependencies on 2026-04-03: Only used in tests/ (MongoClient, ObjectId, Db imports). Not used in src/.
- `@types/passport` REMOVED on 2026-04-11: Not used anywhere in src/ or tests/, `tsconfig.json` has explicit `"types": ["vitest/globals"]` so global @types are not needed.
- `@types/lodash` REMOVED on 2026-04-11: lodash not imported in src/, tsconfig explicit types.
- `@types/ejs` REMOVED on 2026-04-11: ejs only referenced as string value in config.env.ts, not imported.

### Blocked Updates (Architecture)
- `cpy-cli` 6→7: v7 throws error when source dir doesn't exist (e.g. ./migrations). `copy:migrations` script fails.
- `graphql-upload` 15→17: v17 changed all exports from `.js` to `.mjs` only. Breaks `require('graphql-upload/GraphQLUpload.js')` in `src/server/modules/file/file.resolver.ts`.
- `typescript` 5.x→6.0.2: TypeScript 6.0 stricter type checking breaks 26 errors in 5 files (user.model.ts, meta.model.ts, find-and-count-users-result.output.ts, user.service.ts, config.env.ts). Issues: TS2564 (strict property initialization), TS2322 (null assignments in securityCheck). Also: `baseUrl` is deprecated in TS6 (but was restored for tsconfig-paths compatibility).
- `vite-plugin-node` 7→8: v8 requires `vite@^8.0.0`, but vitest@4.x needs `vite@7.x`. Incompatible.

### @nestjs/common + @nestjs/core Overrides (removed 2026-04-04 session 2)
When upgrading @nestjs/common + @nestjs/core to a version NEWER than what @lenne.tech/nest-server depends on, pnpm creates two instances of @nestjs/schedule (one per @nestjs/core version). This causes TS2415 build error: "Types have separate declarations of a private property 'logger'". Fix: add `@nestjs/common` AND `@nestjs/core` to pnpm.overrides to force single versions. These overrides were REMOVED in session 2 because nest-server 11.22.1 now uses 11.1.18 (same as starter). Add them back if starter is ever upgraded ahead of nest-server again.

### Overrides (pnpm.overrides) - as of 2026-04-11 session 5
- `@apollo/server`: Needed for peerDep conflict (@apollo/server-plugin-landing-page-graphql-playground@4.0.1) + security CVE <5.5.0. Currently 5.5.0.
- `axios`: Security fix (SSRF via NO_PROXY bypass GHSA-3p68-rc4w-qgx5, Cloud Metadata Exfiltration GHSA-fvcv-3m26-pcqx), pinned to 1.15.0. Via @lenne.tech/nest-server>@getbrevo/brevo and >node-mailjet. Added in session 5 on 2026-04-11.
- `qs`: Security fix for CVE arrayLimit bypass DoS. Updated to 6.15.1 (was 6.15.0).
- `hono`: Security fix (Prototype Pollution + CVEs), keep at latest (currently 4.12.12).
- `@hono/node-server`: Security fix, keep at latest (currently 1.19.13).
- `lodash`: Security fix (Code Injection + Prototype Pollution in <=4.17.23), updated to 4.18.1.
- `ajv`: Security fix (ReDoS), keep at latest (currently 8.18.0). NOTE: @angular-devkit/core@19.x in one chain uses 8.18.0 directly, but @compodoc/compodoc>@angular-devkit/schematics chain still needs override.
- `file-type`: Security fix (infinite loop in ASF parser), pinned to 21.3.4. Note: @xhmikosr/downloader@16.1.1 requires '^21.3.0' so cannot go to 22.x yet. Stay in 21.x series.
- `handlebars`: Security fix (JS Injection/DoS CVEs <=4.7.8), pinned to 4.7.9. Via @compodoc/compodoc and standard-version.
- `kysely`: Security fix (SQL Injection <=0.28.13), updated to 0.28.16 (was 0.28.15). Via @lenne.tech/nest-server>@better-auth chain.
- `flatted`: Security fix (Prototype Pollution <=3.4.1), pinned to 3.4.2. Via file-entry-cache>flat-cache chain (flat-cache@3.2.0 requires '^3.2.9').
- `srvx`: Security fix (CVE <0.11.13), pinned to 0.11.15. Via @lenne.tech/nest-server>@tus/server. Note: @tus/server@2.3.0 still pins srvx to ~0.8.2 so override is needed.
- `picomatch`: Security fix (ReDoS >=4.0.0 <4.0.4), pinned to 4.0.4. Via @compodoc/compodoc>@angular-devkit/schematics>@angular-devkit/core chain. NOTE: @angular-devkit/core for @nestjs/cli also uses 4.0.4 directly, but @compodoc chain needs override.
- `brace-expansion@1`: Security fix (<1.1.13), updated to 1.1.14 (was 1.1.13). Via fork-ts-checker-webpack-plugin>minimatch@3.
- `brace-expansion@2`: Security fix (>=2.0.0 <2.0.3), updated to 2.1.0 (was 2.0.3). Via @swc/cli>minimatch@9.
- `brace-expansion@5`: Security fix (>=4.0.0 <5.0.5), pinned to 5.0.5. Via @compodoc/compodoc>glob>minimatch@10.
- `effect`: Security fix (AsyncLocalStorage contamination <3.20.0), pinned to 3.21.0. Via @lenne.tech/nest-server>prisma@7.4.2>@prisma/config@7.4.2 (uses exact version 3.18.4).
- `defu`: Security fix (Prototype pollution via __proto__ key <=6.1.4), pinned to 6.1.7. Via @lenne.tech/nest-server>@nestjs/terminus>prisma>@prisma/config>c12@3.1.0 (uses '^6.1.4'). Note: Previous override `"defu@<=6.1.4": ">=6.1.5"` syntax did NOT work in pnpm - must use exact `"defu": "6.1.7"`.
- `vite`: Security fix (arbitrary file read via WebSocket, fs.deny bypass, path traversal in .map handling >=7.0.0 <=7.3.1), pinned to 7.3.2. Via vite-plugin-node. Added in session 3 on 2026-04-07.
- `drizzle-orm`: Security fix (SQL injection via improperly escaped SQL identifiers in <0.45.2, GHSA-gpj5-g38j-94v9), pinned to 0.45.2. Via @lenne.tech/nest-server>better-auth. Added in session 4 on 2026-04-08.

### Overrides removed in session 5 (2026-04-11)
- `path-to-regexp`: REMOVED - @nestjs/core@11.1.18 now directly requires `path-to-regexp: '8.4.2'` (exact), so the override is no longer needed.

### Overrides tested & kept in session 5 (2026-04-11)
- `ajv`: Tested removal - @compodoc/compodoc>@angular-devkit/schematics chain still installs old ajv. Must keep.
- `picomatch`: Tested removal - @compodoc/compodoc>@angular-devkit/schematics chain still installs vulnerable picomatch. Must keep.

### Pre-existing Test Failures (Baseline)
- As of 2026-04-11, all 99 tests pass. No pre-existing failures.

### Deprecated Packages
- No deprecated packages found as of 2026-04-11.

See [blocked-updates.md](blocked-updates.md) for detailed notes.
