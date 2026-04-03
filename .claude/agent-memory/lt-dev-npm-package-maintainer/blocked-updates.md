# Blocked Package Updates

## cpy-cli 6 → 7
**Status**: BLOCKED
**Reason**: v7 throws a fatal error when source directory doesn't exist. The `copy:migrations` script (`cpy ./migrations ./dist/`) fails because the `migrations/` directory doesn't exist in a fresh build. v6 silently skipped missing sources.
**Fix needed**: Add `|| true` to migrations copy or create migrations dir, then upgrade.

## graphql-upload 15 → 16/17
**Status**: BLOCKED
**Reason**: v16+ moved all exports from `.js` files to `.mjs` files only (applies from v16.0.0 onwards). The import in `src/server/modules/file/file.resolver.ts` uses `require('graphql-upload/GraphQLUpload.js')` which no longer exists.
**Latest versions available**: 16.0.2 (also blocked) and 17.0.0.
**Fix needed**: Update import to use `import GraphQLUpload from 'graphql-upload/GraphQLUpload.mjs'` (ESM import) and ensure project ESM config supports it, OR wait for @lenne.tech/nest-server to handle this migration.

## class-validator 0.14 → 0.15
**Status**: RESOLVED (updated 2026-03-11)
**Notes**: Project was updated to 0.15.1. Peer dep warning from `@nestjs/mapped-types@2.1.0` (still declares `^0.13.0 || ^0.14.0`) exists but is suppressed by `strict-peer-dependencies=false`. Tests pass fine at 0.15.1.

## typescript 5.9.3 → 6.0.2
**Status**: BLOCKED (attempted 2026-04-03)
**Reason**: TypeScript 6.0 is stricter and produces 26 errors in 5 source files:
- `user.model.ts`: TS2564 (uninitialized decorated properties: avatar, createdBy, updatedBy) + TS2322 (null assigned to string/boolean/Date in securityCheck())
- `meta.model.ts`: TS2564 for environment, title, package, version properties
- `find-and-count-users-result.output.ts`: TS2564 for items, totalCount
- `user.service.ts`: TS2532 (object possibly undefined at lines 86, 113)
- `config.env.ts`: errors
Also: `baseUrl` compiler option is deprecated in TS6 (was restored for tsconfig-paths compatibility).
**Fix needed**: Add `!` to decorated properties, change null assignments in securityCheck to use proper optional types, or suppress with `"strictPropertyInitialization": false`. This is a significant model API change affecting the lenne.tech base model contract.

## vite-plugin-node 7 → 8
**Status**: BLOCKED (assessed 2026-04-03)
**Reason**: v8 requires `vite@^8.0.0` as peer dependency. Currently vitest@4.1.2 uses `vite@7.3.1`. Upgrading vite to v8 would require upgrading vitest to a version that supports vite@8, which is a multi-step major upgrade.
**Fix needed**: Upgrade vitest (and potentially vite) first, then upgrade vite-plugin-node.
