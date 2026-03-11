# npm-package-maintainer Memory - nest-server-starter

## Key Findings (last updated 2026-03-11)

### Packages that MUST stay despite appearing unused in grep
- `supertest` + `@types/supertest`: Required by `@lenne.tech/nest-server/dist/test/test.helper.js` at runtime even though no direct test import. REMOVING BREAKS TESTS.

### Blocked Updates (Architecture)
- `cpy-cli` 6→7: v7 throws error when source dir doesn't exist (e.g. ./migrations). `copy:migrations` script fails.
- `graphql-upload` 15→17: v17 changed all exports from `.js` to `.mjs` only. Breaks `require('graphql-upload/GraphQLUpload.js')` in `src/server/modules/file/file.resolver.ts`.
- `class-validator` was previously blocked at 0.14 due to `@nestjs/mapped-types` peer dep, but as of 2026-03-11 the project is already at 0.15.1 and works (strict-peer-dependencies=false).

### Overrides (pnpm.overrides)
- `@apollo/server`: Still needed. `@apollo/server-plugin-landing-page-graphql-playground@4.0.1` peerDeps `@apollo/server@^4`, conflicting with v5 from nest-server.
- `qs`: Security fix for CVE arrayLimit bypass DoS. Keep at latest (currently 6.15.0).
- `hono`: Security fix (Prototype Pollution + other CVEs), keep at latest (currently 4.12.7). @lenne.tech/nest-server>@nestjs/terminus>prisma>@prisma/dev chain.
- `@hono/node-server`: Security fix, keep at latest (currently 1.19.11).
- `lodash`: Security fix, keep at latest (currently 4.17.23).
- `ajv`: Security fix (ReDoS), keep at latest (currently 8.18.0). Via @compodoc/compodoc>@angular-devkit/schematics>@angular-devkit/core chain.
- `file-type`: Security fix (infinite loop in ASF parser), keep at 21.3.1. Via @swc/cli>@xhmikosr/bin-wrapper>@xhmikosr/downloader chain.

### Pre-existing Test Failures (Baseline)
- 2 tests in `tests/common.e2e-spec.ts` fail at baseline: i18n endpoint tests (`get error translations in English/German`)
- These fail with 404 - NOT caused by our package maintenance. Unrelated to deps.

### Deprecated Packages
- `@types/cron`: Deprecated stub - cron now has own types. Safe to remove (if still present).
- No deprecated packages found as of 2026-03-11.

See [blocked-updates.md](blocked-updates.md) for detailed notes.
