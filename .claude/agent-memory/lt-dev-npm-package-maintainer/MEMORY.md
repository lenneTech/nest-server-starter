# npm-package-maintainer Memory - nest-server-starter

Detail lives in two authoritative places — read them, don't duplicate here:
- **`pnpm-workspace.yaml`** — every active override with a CVE/chain comment above it. Source of truth for override reasoning.
- **`blocked-updates.md`** — per-package blocker status (cpy-cli, graphql-upload, typescript, …).

This file = current state + timeless rules + one-line session log.

## Current state (session 13, 2026-10-01)
- On top of `@lenne.tech/nest-server` **11.41.5** (lock-step: `version` == framework dep). EVERY direct dependency now equals the framework's pin (deps + devDeps of its published manifest) except better-auth (same 1.7.1, wire-critical). mongoose 9.10.3, oxfmt 0.71, oxlint 1.86, @swc/core 1.16.12, @types/node 26.6.3, @types/multer 2.3.0.
- Overrides (30 entries, none removed): nodemailer 9.1.1 -> **10.0.13** (lockstep), **new** `'js-yaml@>=5.0.0 <5.4.2': 5.4.2` (LOAD-BEARING: a no-override resolve brings back 5.3.0 + GHSA-r3ph-w7gj-g6xm), hono -> 4.13.11, browserslist -> 4.29.3. After the raise, WITH vs WITHOUT differs only in js-yaml, the minimatch/brace-expansion design, ajv 8.x unification and the uuid peer floor.
- Lockfile hygiene: `pnpm dedupe` (4 in-major duplicates) + stale optional peer `@nestjs/websockets@11.1.28` (+ object-hash) dropped — see the rule below.
- Validation: `pnpm run check` green (371 tests / 26 files, build, server-start), audit 0 at every level. NOT committed (coordinator commits).

## Blocked (see blocked-updates.md)
- **graphql-upload 15→17**: v16+ ships `.mjs`-only exports; breaks `require('graphql-upload/GraphQLUpload.js')` in file.resolver.ts.
- **typescript 5.9→6/7**: strictPropertyInitialization (TS2564) + null-assignment (TS2322) errors across framework-extending models (user.model.ts, meta.model.ts, find-and-count-users-result.output.ts) + baseUrl TS5101. API-shaped model change to fix.
- (cpy-cli, vite-plugin-node, class-validator: RESOLVED — history in blocked-updates.md.)
- Majors deliberately held (re-checked 2026-10-01): NestJS 12 family (core 12.1.2, cli/schematics 12, graphql 14, mongoose 12, schedule 12, swagger 12), vitest/@vitest/* 5.0.3 (nest-server stays on 4 and its check scripts parse the vitest summary — move together), typescript 7.0.2 (23 errors build / 53 tests on 2026-09-26), dotenv 18.0.5, graphql-upload 18, pnpm 12 (never from a maintenance run). In-major but held: mongodb 7.7.0 (mongoose 9.10.3 declares ~7.6), better-auth trio 1.7.7 (wire-critical), @swc/core 1.16.13 (inside the release-age gate on 2026-10-01, and the framework pins 1.16.12).

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

- **`pnpm run update` (extras/sync-packages.mjs) bumps package.json, never the overrides.** A BARE lockstep override (`multer: 2.3.0`) then silently forces the raised direct dependency back DOWN (package.json said 2.4.0, the lockfile held 2.3.0). Use the range-floored form that mirrors the framework's own entry (`'multer@>=2.0.0 <2.4.0': 2.4.0`) and raise it in the same run.
- **sync-packages only aligns within the SAME section.** mongodb and supertest are devDependencies here but dependencies in nest-server, so they are never raised by it — align them by hand (mongoose 9.10 requires mongodb ~7.6; a lagging pin leaves a second copy).
- **better-auth / @better-auth/* are wire-critical**: they move in lock-step across nest-server, nuxt-extensions and both starters in ONE release round. Never bump them here alone; report the newest version instead.
- **The nest-server consumer gate** (`check:consumer` in nest-server's publish.yml) installs the tarball into a copy of THIS starter and raises its pins the way `pnpm run update` does (since 11.41.4). A starter pin that the gate prints as "raised" is one every consumer must raise too.
- **@vitest/ui is vitest's OPTIONAL PEER**, not a direct devDependency; fflate arrives through it (see the fflate override comment).
- **The BARE `nodemailer:` lockstep key moves with EVERY framework bump.** On 2026-10-01 it still said 9.1.1 after `pnpm run update` raised the framework to 11.41.5 (which declares 10.0.13): it pinned the framework's own nodemailer DOWN and kept five advisories (2 high) open. After any framework bump, grep the lockfile for nodemailer / ws / @apollo/server / multer and compare with `node_modules/@lenne.tech/nest-server/package.json`.
- **A resolved OPTIONAL PEER sticks in the lockfile forever.** `@nestjs/websockets@11.1.28` (optional peer of @nestjs/core, loaded at runtime via optionalRequire) sat here 2026-07-16..2026-10-01 although a fresh resolve and nest-server's lock have none; `pnpm update --depth Infinity` and `pnpm dedupe` keep it. Detect: compare package NAMES between the repo lock and a fresh `--lockfile-only` resolve. Remove net-zero in scratch: temporary `'<pkg>': '-'` override + `--lockfile-only`, restore the workspace file byte-identical, `--lockfile-only` again, copy the lock back, `pnpm install --frozen-lockfile`. Matters because nest-server's `check:consumer` copies THIS lockfile.
- **`pnpm dedupe` is cheap here** — on 2026-10-01 it collapsed 4 in-major duplicates with zero other drift. Try it in scratch each run; never swap in a fresh-resolve lockfile (100+ packages of unrelated float).

## Session log (one line each)
- **s13 (2026-10-01)**: downstream of nest-server 11.41.5 — nodemailer override 9.1.1 -> 10.0.13 (5 advisories), js-yaml 5.x entry added (GHSA-r3ph-w7gj-g6xm on swagger's exact pin), hono 4.13.11 / browserslist 4.29.3, `pnpm dedupe` + stale `@nestjs/websockets` dropped. 371 tests, 0 vulns. Port-squat trap did not bite.
- **s12 (2026-09-26)**: downstream of nest-server 11.41.4 — 12 pins via `pnpm run update`, mongodb/supertest aligned by hand, bare multer override fixed (range-floored), 12 override targets raised in lockstep with the framework. 366 tests, 0 vulns.
- **s11 (2026-07-16)**: compodoc 2.0 subtree prune → removed babel×2 + morgan overrides; range→fixed pins; cpy-cli 7 unblocked; on nest-server 11.28.1. 0 vulns, 100/100.
- **s10 (2026-05-31)**: NO changes — release-age gate blocked all registry mutations (11.26.0 same-day publish) + dev had pnpm link active. Noted Prisma chain gone in 11.26.0 (effect override became no-op; hono/@hono via @modelcontextprotocol/sdk now).
- **s9 (2026-05-24)**: MIGRATED overrides package.json→pnpm-workspace.yaml (pnpm 11 stopped reading pnpm.overrides → all were dead, 8 vulns). Added qs/ws/@protobufjs/utf8/brace-expansion overrides. Aligned @nestjs/* to 11.1.23.
- **s8 (2026-05-10)**: hono/axios/fast-uri bumps; added babel-plugin override (later removed s11); removed redundant srvx.
- **s7 (2026-04-28)**: vite-plugin-node 7→8 unblocked (vitest peer widened); vite override→8.x (fixed postcss CVE); removed file-type override.
- **s6 & earlier**: removed follow-redirects/path-to-regexp overrides (parents pin fixed versions). Deprecated packages: none, throughout.
