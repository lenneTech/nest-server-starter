# npm-package-maintainer Memory - nest-server-starter

Detail lives in two authoritative places — read them, don't duplicate here:
- **`pnpm-workspace.yaml`** — every active override with a CVE/chain comment above it. Source of truth for override reasoning.
- **`blocked-updates.md`** — per-package blocker status (cpy-cli, graphql-upload, typescript, …).

This file = current state + timeless rules + one-line session log.

## Current state (session 11, 2026-07-16)
- On top of `@lenne.tech/nest-server` **11.28.1**: nest deps aligned to 11.1.28, mongoose 9.7.4, multer 2.2.0, @nestjs/swagger 11.4.5. devDeps: @compodoc/compodoc **2.0.0**, cpy-cli **7.0.0**, @types/node **26.1.1**, mongodb 7.5.0, @swc/core 1.15.43, @vitest/* 4.1.10, oxfmt 0.59, oxlint 1.74, semver 7.8.5, @nestjs/cli 11.0.24.
- **compodoc 1.2→2.0 pruned the live-server + @babel/preset-env + angular-devkit subtree** (lockfile −~1600 lines). Made 3 overrides obsolete → REMOVED, audit still 0 vulns incl. dev: `@babel/plugin-transform-modules-systemjs`, `@babel/core`, `morgan`. uuid now enters via compodoc>vis-network>vis-data (comment updated).
- **Override range→fixed-pin hardening**: form-data→4.0.6, nodemailer→9.0.3 (framework's exact), multer→2.2.0, **js-yaml→4.3.0** (js-yaml never published 4.1.2; the old `>=4.1.2` range silently pulled a 5.0.0 major — pin reverts it, 4.x ends at 4.3.0).
- @apollo/server **5.5.1** = nest-server's dep → aligned, KEEP.
- Unused: NONE. Categorization: optimal (no changes).
- Validation: build ✓, format ✓, lint (oxlint 1.74) ✓, unit 9/9 ✓, e2e 100/100 ✓, audit 0 (prod+dev) ✓. NOT committed.

## Blocked (see blocked-updates.md)
- **graphql-upload 15→17**: v16+ ships `.mjs`-only exports; breaks `require('graphql-upload/GraphQLUpload.js')` in file.resolver.ts.
- **typescript 5.9→6/7**: strictPropertyInitialization (TS2564) + null-assignment (TS2322) errors across framework-extending models (user.model.ts, meta.model.ts, find-and-count-users-result.output.ts) + baseUrl TS5101. API-shaped model change to fix.
- (cpy-cli, vite-plugin-node, class-validator: RESOLVED — history in blocked-updates.md.)
- Only graphql-upload + typescript show in `pnpm outdated`.

## Timeless rules
- **Overrides location (pnpm 11)**: top-level `overrides:` in `pnpm-workspace.yaml`, NOT package.json `pnpm.overrides` (silently ignored → dead overrides → vulns reappear). Build approvals = `allowBuilds:` (pkg→true). Freshly-published-package gate exceptions = `minimumReleaseAgeExclude:` with the **bare name** (`'@lenne.tech/nest-server'`), never `name@version` (version-pinned excludes NOT honored on pnpm 11.1.3).
- **@nestjs/schedule dual-instance trap**: bumping @nestjs/common/core/platform-express/testing PAST what nest-server deps → two @nestjs/core → two @nestjs/schedule → TS2415 ("separate declarations of private property logger"). Fix = align these to nest-server's exact versions (direct-dep alignment, cleaner than overrides). Same for mongoose (align to framework's exact).
- **@apollo/server override is permanent** until @apollo/server-plugin-landing-page-graphql-playground stops peering `@apollo/server@^4`. Keep the override version equal to nest-server's @apollo/server.
- **supertest + @types/supertest MUST STAY** despite no direct import — required at runtime by `@lenne.tech/nest-server/dist/test/test.helper.js`. Removing breaks tests.
- **Binary-only deps look "unused" in grep but are used via package.json scripts**: rimraf, nodemon, cpy(-cli), standard-version, oxfmt, oxlint, ts-node. Do NOT remove.
- **semver is devDep-correct**: its only src/ occurrence is a comment in meta.model.ts; real use is extras/sync-packages.mjs.
- **release-age gate**: pnpm 11.1.3 hard-fails `pnpm add`/`pnpm run <script>` on registry packages published < ~1 day ago (`ERR_PNPM_MINIMUM_RELEASE_AGE_VIOLATION`); loose `pnpm install` only warns. No env/flag bypass works — wait out the cutoff. `link:` deps are exempt.
- **pnpm link ../nest-server breaks the build+tests** (dual @nestjs/core → MongooseCoreModule DI failure → testHelper undefined). This is a link artifact, NOT a starter dep problem — do not "fix" it; validate against the registry package instead.
- **Categorization history**: mongodb → devDep (tests-only). Removed as unused: @types/passport, @types/lodash, @types/ejs (not imported; tsconfig pins `"types": ["vitest/globals"]` so global @types aren't auto-included).

## Session log (one line each)
- **s11 (2026-07-16)**: compodoc 2.0 subtree prune → removed babel×2 + morgan overrides; range→fixed pins; cpy-cli 7 unblocked; on nest-server 11.28.1. 0 vulns, 100/100.
- **s10 (2026-05-31)**: NO changes — release-age gate blocked all registry mutations (11.26.0 same-day publish) + dev had pnpm link active. Noted Prisma chain gone in 11.26.0 (effect override became no-op; hono/@hono via @modelcontextprotocol/sdk now).
- **s9 (2026-05-24)**: MIGRATED overrides package.json→pnpm-workspace.yaml (pnpm 11 stopped reading pnpm.overrides → all were dead, 8 vulns). Added qs/ws/@protobufjs/utf8/brace-expansion overrides. Aligned @nestjs/* to 11.1.23.
- **s8 (2026-05-10)**: hono/axios/fast-uri bumps; added babel-plugin override (later removed s11); removed redundant srvx.
- **s7 (2026-04-28)**: vite-plugin-node 7→8 unblocked (vitest peer widened); vite override→8.x (fixed postcss CVE); removed file-type override.
- **s6 & earlier**: removed follow-redirects/path-to-regexp overrides (parents pin fixed versions). Deprecated packages: none, throughout.
