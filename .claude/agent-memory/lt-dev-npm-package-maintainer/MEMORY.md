# npm-package-maintainer Memory - nest-server-starter

## Key Findings (last updated 2026-05-24, session 9)

### Session 9 Notes (2026-05-24) - MAJOR: pnpm 11 overrides migration
- **CRITICAL ROOT CAUSE**: Project now runs pnpm 11.1.3. pnpm 11 NO LONGER reads `pnpm.overrides` or `pnpm.onlyBuiltDependencies` from package.json (emits "The pnpm field in package.json is no longer read" warning). ALL security overrides were silently INACTIVE. Audit showed 8 vulns (7 moderate, 1 high) - several were exactly the ones the dead overrides should have fixed (picomatch, ajv, uuid, brace-expansion).
- **FIX**: Migrated everything to `pnpm-workspace.yaml` (top-level `overrides:` map, `allowBuilds:` map of pkg→true replacing `onlyBuiltDependencies`, kept `minimumReleaseAgeExclude`). The pre-existing `pnpm-workspace.yaml` (untracked, from the lt dev Caddy commit) had INVALID placeholder string values `"set this to true or false"` for allowBuilds, which caused `ERR_PNPM_IGNORED_BUILDS` hard-failing every `pnpm install`/build. Set them to real `true` booleans + added `esbuild: true`.
- Removed the now-dead `pnpm:` block AND the `//overrides` doc block from package.json. Override documentation now lives as YAML comments in pnpm-workspace.yaml.
- After migration: `pnpm install` clean (build scripts ran: bcrypt/swc/nestjs/scarf), overrides present in lockfile `settings.overrides`, audit = **0 vulnerabilities**.
- NEW CVE overrides ADDED (were not covered before): `qs: 6.15.2` (DoS GHSA-q8mj-m7cp-5q26), `ws@>=8.0.0 <8.20.1: 8.21.0` (uninitialized memory; scoped left-range so ws@7.x untouched), `@protobufjs/utf8: 1.1.1` (overlong UTF-8), `brace-expansion@>=5.0.0 <5.0.6: 5.0.6` (DoS, bumped from 5.0.5).
- Override bumps: `@apollo/server` 5.5.0→5.5.1 (nest-server@11.25.6 now deps exactly 5.5.1; playground plugin STILL peers @apollo/server@^4 so override STILL needed), `hono` 4.12.18→4.12.22 (latest 4.x; @prisma/dev needs ^4.12.8).
- **@nestjs/schedule duplicate-instance bug RETURNED**: nest-server@11.25.6 deps @nestjs/common+core EXACTLY 11.1.23, but starter pinned 11.1.19 → two @nestjs/schedule instances → TS2415 "separate declarations of private property logger". FIX: bumped starter's @nestjs/common, @nestjs/core, @nestjs/platform-express, @nestjs/testing 11.1.19→11.1.23 to match nest-server (NOT via override this time - direct dep alignment is cleaner). Also @nestjs/graphql 13.4.0→13.4.2, @nestjs/swagger 11.4.2→11.4.4.
- SAFE batch: @types/node 25.6.2→25.9.1, @vitest/coverage-v8+ui+vitest 4.1.5→4.1.7, oxlint 1.63.0→1.66.0, oxfmt 0.48.0→0.51.0, semver 7.8.0→7.8.1.
- Priority 1 (unused): NONE - every dep verified used in src/tests/config/script-binary. Priority 2 (categorization): NO changes - already optimal.
- BLOCKERS revalidated (still blocked): cpy-cli 6→7 (errors on missing ./migrations dir - re-tested, still fails), graphql-upload 15→17 (.mjs-only exports), typescript 5→6 (now 21 errors not 26, but model null-assignment errors remain - see blocked-updates.md).
- Deprecated packages: none.

## Key Findings (session 8, 2026-05-10)

### Session 8 Notes (2026-05-10)
- 8 vulnerabilities at start (1 low, 4 moderate, 3 high) - all in transitive deps via @compodoc/compodoc + prisma chain.
- `hono` override bumped 4.12.15 → 4.12.18 (latest patch, fixes 5 NEW CVEs: bodyLimit bypass, JSX tag injection, CSS Declaration Injection, Vary header bypass, JWT NumericDate validation).
- `axios` override bumped 1.15.2 → 1.16.0 (latest, no functional impact).
- `fast-uri` override ADDED at 3.1.2: NEW CVEs GHSA-q3j6-qgpj-74h6 (path traversal) + GHSA-v39h-62p7-jpjc (host confusion) in <=3.1.1. Via @compodoc/compodoc>@angular-devkit/schematics>@angular-devkit/core>ajv>fast-uri. ajv@8.x uses fast-uri@^3 so 3.1.2 works.
- `@babel/plugin-transform-modules-systemjs` override ADDED at 7.29.4: NEW CVE GHSA-fv7c-fp4j-7gwp (arbitrary code generation) in >=7.12.0 <=7.29.3. Via @compodoc/compodoc>@babel/preset-env. 7.29.4 is latest 7.x.
- `srvx` override REMOVED: @tus/server@2.4.1 (was 2.3.0 in session 6 memory) now directly requires `srvx: ~0.11.15`, override is redundant. Verified: srvx@0.11.15 still installed.
- `effect` override RE-VERIFIED: Cannot be removed - @prisma/config@7.4.2 still pins effect to exact 3.18.4 (vulnerable to GHSA-38f7-945m-qr2g). Memory comment was correct.
- SAFE update: `semver` 7.7.4 → 7.8.0.
- BLOCKERS unchanged: cpy-cli 6→7, graphql-upload 15→17, typescript 5→6 (all documented).
- No deprecated packages, no unused packages, no categorization changes needed.
- Final state: 100/100 tests pass, build OK, audit clean (0 vulnerabilities), `pnpm run check` (incl. local-start) successful.

### Session 7 Notes (2026-04-28)
- vite-plugin-node 7→8 BLOCKER REMOVED: vitest@4.1.5 supports `vite ^6 || ^7 || ^8`, so vite-plugin-node@8 + vite@8.0.10 now works together. Previous block (vitest needs vite@7.x) was outdated.
- `vite` override updated 7.3.2 → 8.0.10. This also resolved the postcss CVE GHSA-qx2v-qp2m-jg93 (XSS in postcss <8.5.10) since vite@8 requires postcss@^8.5.10.
- `file-type` override REMOVED: @nestjs/common@11.1.19 now directly pins file-type to exact '21.3.4', so override is redundant. Verified: file-type@21.3.4 still installed after removal.
- `hono` override bumped 4.12.14 → 4.12.15 (latest patch).
- `ajv` override bumped 8.18.0 → 8.20.0 (latest minor in 8.x).
- SAFE batch updates: @nestjs/swagger 11.4.1→11.4.2, @swc/core 1.15.30→1.15.32, oxfmt 0.46.0→0.47.0, oxlint 1.61.0→1.62.0.
- Final state: 100/100 tests pass, build OK, audit clean (0 vulnerabilities).

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
- `typescript` 5.x→6.0.3: TypeScript 6.0 stricter type checking breaks 26 errors in 5 files (user.model.ts, meta.model.ts, find-and-count-users-result.output.ts, user.service.ts, config.env.ts). Issues: TS2564 (strict property initialization), TS2322 (null assignments in securityCheck). Also: `baseUrl` is deprecated in TS6 (but was restored for tsconfig-paths compatibility).
- `vite-plugin-node` 7→8: RESOLVED in session 7 (2026-04-28). vitest@4.1.5 now declares `vite: '^6.0.0 || ^7.0.0 || ^8.0.0'` peer, so vite-plugin-node@8 + vite@8.0.10 works.

### @nestjs/common + @nestjs/core Overrides (removed 2026-04-04 session 2)
When upgrading @nestjs/common + @nestjs/core to a version NEWER than what @lenne.tech/nest-server depends on, pnpm creates two instances of @nestjs/schedule (one per @nestjs/core version). This causes TS2415 build error: "Types have separate declarations of a private property 'logger'". Fix: add `@nestjs/common` AND `@nestjs/core` to pnpm.overrides to force single versions. These overrides were REMOVED in session 2 because nest-server 11.22.1 now uses 11.1.18 (same as starter). Add them back if starter is ever upgraded ahead of nest-server again.

### Overrides LOCATION (session 9, 2026-05-24)
As of pnpm 11, overrides live in `pnpm-workspace.yaml` (top-level `overrides:`), NOT package.json `pnpm.overrides` (ignored). Build approvals are `allowBuilds:` (map pkg→true), NOT `onlyBuiltDependencies` (removed in pnpm 11). Each override is documented with a YAML comment block above it. Current active overrides (18): @apollo/server 5.5.1, axios 1.16.0, hono 4.12.22, @hono/node-server 1.19.14, lodash 4.18.1, ajv 8.20.0, effect 3.21.2, picomatch 4.0.4, vite 8.0.10, uuid 14.0.0, fast-uri 3.1.2, @babel/plugin-transform-modules-systemjs 7.29.4, qs 6.15.2, ws@>=8.0.0 <8.20.1→8.21.0, @protobufjs/utf8 1.1.1, brace-expansion@>=5.0.0 <5.0.6→5.0.6, brace-expansion@<1.1.13→1.1.14, brace-expansion@>=2.0.0 <2.0.3→2.1.0.

### Overrides (pnpm.overrides) - as of 2026-05-10 session 8 (HISTORICAL - now in pnpm-workspace.yaml)
- `@apollo/server`: Needed for peerDep conflict (@apollo/server-plugin-landing-page-graphql-playground@4.0.1) + security CVE <5.5.0. Currently 5.5.0.
- `axios`: Security fix (SSRF via NO_PROXY bypass GHSA-3p68-rc4w-qgx5, Cloud Metadata Exfiltration GHSA-fvcv-3m26-pcqx), pinned to 1.15.0. Via @lenne.tech/nest-server>@getbrevo/brevo and >node-mailjet. Added in session 5 on 2026-04-11.
- `qs`: Security fix for CVE arrayLimit bypass DoS. Updated to 6.15.1 (was 6.15.0).
- `hono`: Security fix (Prototype Pollution + CVEs), keep at latest (currently 4.12.14). @prisma/dev@0.24.x still requires hono@4.11.4.
- `@hono/node-server`: Security fix, keep at latest (currently 1.19.13). @prisma/dev@0.24.x still requires @hono/node-server@1.19.9.
- `lodash`: Security fix (Code Injection + Prototype Pollution in <=4.17.23), updated to 4.18.1.
- `ajv`: Security fix (ReDoS), keep at latest (currently 8.18.0). @compodoc/compodoc>@angular-devkit/schematics chain still needs override.
- `file-type`: Security fix (infinite loop in ASF parser), pinned to 21.3.4. Note: @xhmikosr/downloader@16.1.1 requires '^21.3.0' so cannot go to 22.x yet. Stay in 21.x series.
- `handlebars`: Security fix (JS Injection/DoS CVEs <=4.7.8), pinned to 4.7.9. Via @compodoc/compodoc and standard-version.
- `kysely`: Security fix (SQL Injection <=0.28.13), updated to 0.28.16. Via @lenne.tech/nest-server>@better-auth chain. 0.28.16 is latest in 0.28.x.
- `flatted`: Security fix (Prototype Pollution <=3.4.1), pinned to 3.4.2. Via file-entry-cache>flat-cache chain.
- `srvx`: Security fix (CVE <0.11.13), pinned to 0.11.15. Via @lenne.tech/nest-server>@tus/server. Note: @tus/server@2.3.0 still pins srvx to ~0.8.2 so override is needed.
- `picomatch`: Security fix (ReDoS >=4.0.0 <4.0.4), pinned to 4.0.4. Via @compodoc/compodoc>@angular-devkit/schematics>@angular-devkit/core chain.
- `brace-expansion@1`: Security fix (<1.1.13), updated to 1.1.14. Via fork-ts-checker-webpack-plugin>minimatch@3.
- `brace-expansion@2`: Security fix (>=2.0.0 <2.0.3), updated to 2.1.0. Via @swc/cli>minimatch@9.
- `brace-expansion@5`: Security fix (>=4.0.0 <5.0.5), pinned to 5.0.5. Via @compodoc/compodoc>glob>minimatch@10 and @ts-morph/common>minimatch@10. minimatch@10 requires ^5.0.2 so without override could install 5.0.2-5.0.4 (all vulnerable).
- `effect`: Security fix (AsyncLocalStorage contamination <3.20.0), pinned to 3.21.0. Via @lenne.tech/nest-server>prisma@7.4.2>@prisma/config@7.4.2 (uses exact version 3.18.4).
- `defu`: Security fix (Prototype pollution via __proto__ key <=6.1.4), pinned to 6.1.7. Via c12@3.1.0 (uses '^6.1.4'). Note: Previous override `"defu@<=6.1.4": ">=6.1.5"` syntax did NOT work in pnpm - must use exact `"defu": "6.1.7"`.
- `vite`: Security fix (arbitrary file read via WebSocket, fs.deny bypass, path traversal in .map handling >=7.0.0 <=7.3.1), pinned to 7.3.2. Via vite-plugin-node. Added in session 3 on 2026-04-07.
- `drizzle-orm`: Security fix (SQL injection via improperly escaped SQL identifiers in <0.45.2, GHSA-gpj5-g38j-94v9), pinned to 0.45.2. Via @lenne.tech/nest-server>better-auth. Added in session 4 on 2026-04-08. 0.45.2 is latest stable.

### Overrides removed in session 6 (2026-04-17)
- `follow-redirects`: REMOVED - axios@1.15.0 already requires `follow-redirects: ^1.15.11` which resolves to 1.16.0 (the latest) naturally. The override was undocumented and redundant. Verified: pnpm still installs 1.16.0 after removal.

### Overrides removed in session 5 (2026-04-11)
- `path-to-regexp`: REMOVED - @nestjs/core@11.1.18+ now directly requires `path-to-regexp: '8.4.2'` (exact), so the override is no longer needed.

### Overrides tested & kept
- `ajv`: Tested removal in session 5 - @compodoc/compodoc>@angular-devkit/schematics chain still installs old ajv. Must keep.
- `picomatch`: Tested removal in session 5 - @compodoc/compodoc>@angular-devkit/schematics chain still installs vulnerable picomatch. Must keep.

### Pre-existing Test Failures (Baseline)
- As of 2026-05-10 session 8: 100 tests pass (10 test files). Stable since session 6.

### Deprecated Packages
- No deprecated packages found as of 2026-05-10.

See [blocked-updates.md](blocked-updates.md) for detailed notes.
