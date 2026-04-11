# nest-server-starter

## Project Overview

Starter template for `@lenne.tech/nest-server` based NestJS applications. Used by `lt server create` and
`lt fullstack init` to scaffold new projects.

## Structure

```
src/
├── main.ts                    # Bootstrap (Swagger setup in REST/Both mode)
├── config.env.ts              # Per-environment configuration
├── server/
│   ├── server.module.ts       # Root module (imports all feature modules)
│   └── modules/
│       ├── user/              # User module (CRUD, auth, avatar)
│       ├── file/              # File module (upload, download, GridFS)
│       └── meta/              # Meta module (server info)
tests/
├── iam.e2e-spec.ts            # IAM/Auth integration tests
├── common.e2e-spec.ts         # Common endpoint tests
├── project.e2e-spec.ts        # Project-level tests
├── common-graphql.e2e-spec.ts # GraphQL schema introspection
├── project-graphql.e2e-spec.ts # GraphQL project queries
└── modules/
    ├── user-graphql.e2e-spec.ts  # User GraphQL CRUD
    ├── user-rest.e2e-spec.ts     # User REST CRUD
    ├── file-graphql.e2e-spec.ts  # File GraphQL operations
    ├── file-rest.e2e-spec.ts     # File REST operations
    └── tus.e2e-spec.ts           # TUS upload tests
```

## API Mode System

This starter supports three API modes: **Rest**, **GraphQL**, and **Both**. The `lt` CLI processes the template after
cloning to remove mode-specific code.

### Region Markers

Mode-specific code is wrapped in `// #region <mode>` / `// #endregion <mode>` comments:

```typescript
// #region graphql
import { UserResolver } from './user.resolver';
// #endregion graphql

// #region rest
import { UserController } from './user.controller';
// #endregion rest
```

**Rules:**

- Only use block markers on own lines (NO inline markers - oxfmt breaks them)
- Markers are pure comments - the starter builds and runs with all markers present
- In "Both" mode, markers are stripped and all code remains

### api-mode.manifest.json

Declares mode-specific files, packages, and scripts:

- `modes.graphql.filePatterns` - Files deleted in REST mode (resolvers, GQL tests, schema.gql)
- `modes.rest.filePatterns` - Files deleted in GraphQL mode (controllers, REST tests)
- `modes.graphql.packages` / `modes.rest.packages` - Mode-specific packages
- `modes.graphql.scripts` - Scripts removed in REST mode

### Special Cases

- **file.controller.ts** stays in ALL modes (download endpoints needed - GraphQL can't stream binary)
  - Only REST admin methods (upload, info, delete) are in `// #region rest`
- **server.controller.ts** stays in ALL modes (infrastructure: `/`, `/meta`, `/config`)
- **user.service.ts** has `// #region graphql` around PubSub (subscription events)
- **user.service.ts** has `// #region rest` around `setAvatar()` (called only by avatar.controller.ts)
- **config.env.ts** has NO markers - CLI modifies it via ts-morph AST (replaces `graphQl: {...}` with `graphQl: false`
  in REST mode)
- **Models/DTOs** stay in ALL modes (`@ObjectType`, `@Field` are no-ops without GraphQL)

### Test File Convention

- `*-graphql.e2e-spec.ts` - Only GraphQL tests (deleted in REST mode)
- `*-rest.e2e-spec.ts` - Only REST tests (deleted in GraphQL mode)
- `*.e2e-spec.ts` (no suffix) - Shared tests (all modes)
- Shared tests use noop PubSub: `{ provide: 'PUB_SUB', useValue: { publish: async () => {} } }`

### strip-markers Script

`pnpm run strip-markers` removes all region markers (keeping all code), deletes the manifest, and cleans up. Use this
for manual "Both" mode setup without the CLI.

## Tooling

- **Formatter:** oxfmt (`pnpm run format`)
- **Linter:** oxlint (`pnpm run lint`)
- **Tests:** vitest (`pnpm run test:e2e`)
- **Build:** tsc (`pnpm run build`)

## Development

```bash
pnpm start          # Start with migrations (local env)
pnpm run test:e2e   # Run E2E tests
pnpm run build      # Build for production
```

MongoDB must be running locally on default port (27017).

## Framework: @lenne.tech/nest-server

This starter is the canonical base used by `lt fullstack init` and
`lt server create` for **both** framework consumption modes:

- **npm mode (default):** `@lenne.tech/nest-server` is installed as
  an npm dependency; framework code lives in
  `node_modules/@lenne.tech/nest-server/`.
- **vendor mode:** after cloning this starter, the lt CLI runs
  `convertCloneToVendored()` which clones the nest-server repo into
  `/tmp`, copies its `src/core/` tree (+ flatten-fix) into
  `<project>/src/core/`, removes the `@lenne.tech/nest-server` npm dep,
  merges upstream transitive deps, rewrites all consumer imports from
  `'@lenne.tech/nest-server'` to relative paths, writes
  `src/core/VENDOR.md`, and wires vendor maintenance scripts. In
  vendor mode the CLI also prepends a `<!-- lt-vendor-marker -->`
  block at the top of this CLAUDE.md at init time.

**Auto-detect:** `test -f <api-root>/src/core/VENDOR.md` → vendor mode.
`lt status`, `lt fullstack update`, `lt server module/object/addProp/
test/permissions` all detect the mode via this check. Generated code
follows the project's mode automatically — no manual flag after init.

### Framework source files

Read the framework source at these paths. **Path prefix depends on mode:**

- **npm mode:** `node_modules/@lenne.tech/nest-server/<path>`
- **vendor mode:** `<path>` relative to the api root, where
  `src/core/` is the framework tree (so
  `src/core/common/services/crud.service.ts` instead of
  `node_modules/@lenne.tech/nest-server/src/core/common/services/crud.service.ts`)

| File                                                      | Purpose                                                                         |
|-----------------------------------------------------------|---------------------------------------------------------------------------------|
| `CLAUDE.md` (npm) / `src/core/VENDOR.md` (vendor)         | Framework rules (npm) / vendor baseline + patch log (vendor)                    |
| `FRAMEWORK-API.md` (npm only)                             | Compact API reference (interfaces, method signatures)                           |
| `src/core.module.ts`                                      | CoreModule.forRoot() — all module registration logic                            |
| `src/core/common/interfaces/server-options.interface.ts`  | ALL config interfaces (IServerOptions, IBetterAuth, ICoreModuleOverrides, etc.) |
| `src/core/common/interfaces/service-options.interface.ts` | ServiceOptions interface for service method calls                               |
| `src/core/common/services/crud.service.ts`                | CrudService base class — ALL services extend this                               |
| `src/core/modules/*/INTEGRATION-CHECKLIST.md`             | Per-module integration steps                                                    |
| `src/core/modules/*/README.md`                            | Per-module documentation                                                        |
| `docs/REQUEST-LIFECYCLE.md` (npm only)                    | Complete request lifecycle, interceptor chain, decorator reference              |
| `.claude/rules/` (npm only)                               | 11 rule files covering architecture, security, testing, modules                 |

### Updating the framework

- **npm mode:** `/lt-dev:backend:update-nest-server` (bumps
  `package.json`, walks migration guides).
- **vendor mode:** `/lt-dev:backend:update-nest-server-core` (clones
  upstream, computes delta vs baseline, applies hunks, re-runs
  flatten-fix).

The generic `nest-server-updater` auto-delegates to `-core` when it
detects a vendored project (`src/core/VENDOR.md` present). In
practice, users always run `/lt-dev:backend:update-nest-server` and
the right flow kicks in automatically.

### Native MongoDB Driver — Security Rules

**NEVER** use `model.collection.*` or `model.db.*` methods — these bypass all Mongoose plugins (Tenant, Audit,
RoleGuard, Password). Use Mongoose Model methods instead:

- `Model.insertMany([doc])` instead of `collection.insertOne(doc)`
- `Model.bulkWrite(ops)` instead of `collection.bulkWrite(ops)`
- `Model.updateMany(f, u)` instead of `collection.updateMany(f, u)`

If native access is unavoidable: use `this.getNativeCollection(reason)` or `this.getNativeDb(reason)` from CrudService.

`connection.db.collection()` is only allowed for schema-less collections (OAuth, BetterAuth, MCP) and read-only
aggregations. Never for write operations on tenant-scoped collections.

Details: `node_modules/@lenne.tech/nest-server/docs/native-driver-security.md`

### Mongoose Index Placement

**Rule:** Single-field indexes live on the property. `Schema.index()` is reserved for compound (multi-field) indexes only.

1. **Single-field indexes** → declare directly on the property via `@Prop({ index: true })` or `@UnifiedField({ mongoose: { index: true } })`. Keeps all property info in one place and visible during code review.

2. **Framework-managed indexes** → do NOT set manually. Example: `tenantId` is automatically indexed by the `mongooseTenantPlugin` in `@lenne.tech/nest-server`. Adding `index: true` on `tenantId` triggers Mongoose `"Duplicate schema index"` warnings.

3. **Compound (multi-field) indexes** → only these belong in `Schema.index({ field1: 1, field2: 1 })` after `SchemaFactory.createForClass(...)`. This is the only acceptable use of `Schema.index()`.

4. **TTL indexes** → declare inline: `@Prop({ required: true, index: { expireAfterSeconds: 3600 } })`. Do NOT add a separate `Schema.index()` call — it duplicates the index.

5. **`unique: true` implies an index** → no additional `Schema.index({ field: 1 }, { unique: true })` needed.

**Why:** Hidden `Schema.index()` calls at the bottom of the file are easy to miss, leading to duplicate definitions and Mongoose warnings when multiple developers touch the same model. Add a short comment next to framework-managed fields explaining the index is auto-created.

### CrudService process() — Memory Considerations

The `process()` pipeline adds memory overhead per call. Under high traffic or in service cascades this can cause memory
issues. If this happens, bypass `process()` while keeping Mongoose plugins active:

**Use CrudService** for user-facing APIs (authorization + field filtering needed).
**Use direct Mongoose** for system-internal code (processors, crons) where no user context exists:
- `Model.create(input)` instead of `CrudService.create(input)` — 3x faster, 9x less memory than `save()`
- `Model.findByIdAndUpdate(id, input).lean()` instead of `CrudService.update(id, input)` — fastest update
- `Model.findById(id).lean()` instead of `getForce(id)` — 5x less memory in high-frequency paths

For high-frequency paths (monitoring, metrics): defer complex logic (incidents, notifications) to cron/queue, avoid
service cascades, use lean queries for WebSocket data.

**NEVER** pass Mongoose SubDocument Arrays (e.g. `entity.logs`, `entity.comments`) through `CrudService.update()` — not even in controllers. The Proxy-wrapped subdocuments cause OOM when `clone()` (rfdc) and `processDeep()` trigger Proxy getters on every property. Use `CrudService.pushToArray()` / `pullFromArray()` instead (preferred), or direct `$push` / `$set` via `Model.findByIdAndUpdate()` for combined operations.

**NEVER** bypass Mongoose entirely via `collection.*` — see above. Details:
`node_modules/@lenne.tech/nest-server/docs/process-performance-optimization.md`

### Rules

1. **ALWAYS read actual source code** from `node_modules/@lenne.tech/nest-server/` before guessing framework behavior
2. **NEVER re-implement** functionality that nest-server already provides — check CrudService first
3. **When extending a Core* class**, read the parent class source first to understand protected helpers and super()
   calls
4. **Use `ICoreModuleOverrides`** parameter on `CoreModule.forRoot()` to customize modules — never call `forRoot()`
   twice
5. **When debugging framework errors**, start by reading the relevant source file, not by guessing
6. **Read `FRAMEWORK-API.md`** for a quick overview of all available interfaces, config options, and method signatures
