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
**Status**: BLOCKED
**Reason**: `@nestjs/mapped-types@2.1.0` declares peer dep `class-validator@"^0.13.0 || ^0.14.0"` - does not include 0.15.x. Upgrading generates peer dep warning which could cause runtime issues.
**Fix needed**: Wait for `@nestjs/mapped-types` to update its peer dep to accept 0.15.x, or upgrade @nestjs/graphql which bundles mapped-types.
