# npm-package-maintainer Memory - nest-server-starter

## Key Findings (last updated 2026-03-15)

### Packages that MUST stay despite appearing unused in grep
- `supertest` + `@types/supertest`: Required by `@lenne.tech/nest-server/dist/test/test.helper.js` at runtime even though no direct test import. REMOVING BREAKS TESTS.

### Blocked Updates (Architecture)
- `cpy-cli` 6→7: v7 throws error when source dir doesn't exist (e.g. ./migrations). `copy:migrations` script fails.
- `graphql-upload` 15→17: v17 changed all exports from `.js` to `.mjs` only. Breaks `require('graphql-upload/GraphQLUpload.js')` in `src/server/modules/file/file.resolver.ts`.
- `class-validator` was previously blocked at 0.14 due to `@nestjs/mapped-types` peer dep, but as of 2026-03-11 the project is already at 0.15.1 and works (strict-peer-dependencies=false).

### Overrides (pnpm.overrides) - as of 2026-03-15
- `@apollo/server`: Still needed. `@apollo/server-plugin-landing-page-graphql-playground@4.0.1` peerDeps `@apollo/server@^4`, conflicting with v5 from nest-server. Currently pinned to 5.4.0.
- `qs`: Security fix for CVE arrayLimit bypass DoS. Keep at latest (currently 6.15.0).
- `hono`: Security fix (Prototype Pollution + other CVEs), keep at latest (currently 4.12.8). @lenne.tech/nest-server>@nestjs/terminus>prisma>@prisma/dev chain.
- `@hono/node-server`: Security fix, keep at latest (currently 1.19.11).
- `lodash`: Security fix, keep at latest (currently 4.17.23).
- `ajv`: Security fix (ReDoS), keep at latest (currently 8.18.0). Via @compodoc/compodoc>@angular-devkit/schematics>@angular-devkit/core chain.
- `file-type`: Security fix (infinite loop in ASF parser), simplified to single override `"file-type": "21.3.2"`. Via @nestjs/common chain.

### Removed Overrides (2026-03-15 - no longer needed, pnpm resolves naturally)
- `flatted@<3.4.0`: Removed. flat-cache@3.2.0 requires "^3.2.9" and pnpm resolves to 3.4.1 naturally.
- `yauzl@<3.2.1`: Removed. @xhmikosr/decompress-unzip requires "^3.2.0" and pnpm resolves to 3.2.1 (latest) naturally.
- `undici@>=7.0.0 <7.24.0`: Removed. cheerio requires "^7.12.0" and pnpm resolves to 7.24.3 naturally.
- `undici@>=7.17.0 <7.24.0`: Removed. Duplicate of the above, was redundant.
- `file-type@>=20.0.0 <=21.3.1`: Removed. Cascade override now simplified to single `"file-type": "21.3.2"`.

### Removed Packages (2026-03-15)
- `vite-tsconfig-paths 6.1.1`: Not used anywhere in the project (not in vite.config.ts, vitest*.config.ts, src/, tests/, scripts/, extras/).

### Pre-existing Test Failures (Baseline)
- As of 2026-03-15, all 99 tests pass. No pre-existing failures.
- Previously 2 i18n tests failed at baseline but these have been resolved.

### Deprecated Packages
- No deprecated packages found as of 2026-03-15.

See [blocked-updates.md](blocked-updates.md) for detailed notes.
