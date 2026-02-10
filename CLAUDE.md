# nest-server-starter

## Project Overview

Starter template for `@lenne.tech/nest-server` based NestJS applications. Used by `lt server create` and `lt fullstack init` to scaffold new projects.

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

This starter supports three API modes: **Rest**, **GraphQL**, and **Both**. The `lt` CLI processes the template after cloning to remove mode-specific code.

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
- **config.env.ts** has NO markers - CLI modifies it via ts-morph AST (replaces `graphQl: {...}` with `graphQl: false` in REST mode)
- **Models/DTOs** stay in ALL modes (`@ObjectType`, `@Field` are no-ops without GraphQL)

### Test File Convention

- `*-graphql.e2e-spec.ts` - Only GraphQL tests (deleted in REST mode)
- `*-rest.e2e-spec.ts` - Only REST tests (deleted in GraphQL mode)
- `*.e2e-spec.ts` (no suffix) - Shared tests (all modes)
- Shared tests use noop PubSub: `{ provide: 'PUB_SUB', useValue: { publish: async () => {} } }`

### strip-markers Script

`pnpm run strip-markers` removes all region markers (keeping all code), deletes the manifest, and cleans up. Use this for manual "Both" mode setup without the CLI.

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
