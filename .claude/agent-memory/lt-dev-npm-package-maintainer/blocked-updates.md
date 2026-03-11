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
