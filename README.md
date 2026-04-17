# Starter for lenne.Tech Nest Server

This is the starter kit for the [lenne.Tech Nest Server](https://github.com/lenneTech/nest-server).

It contains everything you need to get started right away and a few code examples to help you create your own modules.

In combination with Angular (see [lenne.Tech Angular example](https://github.com/lenneTech/angular-example)
incl. [ng-base](https://github.com/lenneTech/ng-base/tree/main/projects/ng-base/README.md)) the Nest Server is an ideal
basis for your next project.

For efficient handling we recommend using the [lenne.Tech CLI](https://github.com/lenneTech/cli) 
to initialize a new project and create modules and module elements.

This starter is regularly updated to the latest version of the Nest server. This makes it ideal for viewing the changes 
and applying them to your own project (see [Update Notes](update)).

[![License](https://img.shields.io/github/license/lenneTech/nest-server-starter)](/LICENSE)

## Requirements

- [Node.js](https://nodejs.org):
  the runtime environment for your server

- [pnpm](https://pnpm.io):
  the package manager for your dependencies

- [Git](https://git-scm.com/book/en/v2/Getting-Started-Installing-Git):  
  the version control system for your source code

- [MongoDB](https://docs.mongodb.com/manual/installation/#mongodb-community-edition-installation-tutorials)
  (or any other database compatible with [MikroORM](https://mikro-orm.io)):  
  the database for your objects

## 1. Install the starter kit via [CLI](https://github.com/lenneTech/cli)

```
$ pnpm add -g @lenne.tech/cli
$ lt server create <ServerName>
$ cd <ServerName>
```

## 2. Start the server

```
$ pnpm run start:dev
```

## 3. Extend the server

Since the server is based on [Nest](https://nestjs.com/), you can find all information about extending your server
in the [documentation of Nest](https://docs.nestjs.com/).

To create a new Module with model, inputs, resolver and service you can use the [CLI](https://github.com/lenneTech/cli):

```
$ lt server module <ModuleName>
```

We are currently working on a documentation of the extensions and auxiliary classes that the
[lenne.Tech Nest Server](https://github.com/lenneTech/nest-server) contains. As long as this is not yet available,
have a look at the [source code](https://github.com/lenneTech/nest-server/tree/master/src/core).
There you will find a lot of things that will help you to extend your server, such as:

- [GraphQL scalars](https://github.com/lenneTech/nest-server/tree/master/src/core/common/scalars)
- [Filter and pagination](https://github.com/lenneTech/nest-server/tree/master/src/core/common/args)
- [Decorators for restrictions and roles](https://github.com/lenneTech/nest-server/tree/master/src/core/common/decorators)
- [Authorisation handling](https://github.com/lenneTech/nest-server/tree/master/src/core/modules/auth)
- [Ready to use user module](https://github.com/lenneTech/nest-server/tree/master/src/core/modules/user)
- [Common helpers](https://github.com/lenneTech/nest-server/tree/master/src/core/common/helpers) and
  [helpers for tests](https://github.com/lenneTech/nest-server/blob/master/src/test/test.helper.ts)
- ...

## Further information

### Running the app

```bash
# Development
$ pnpm start

# Watch mode
$ pnpm run start:dev

# Production mode
$ pnpm run start:prod
```

### Test

```bash
# e2e tests
$ pnpm run test:e2e
```

Configuration for testing:
```
Node interpreter: /user/local/bin/node
Vitest package: FULL_PATH_TO_PROJECT_DIR/node_modules/vitest
Working directory: FULL_PATH_TO_PROJECT_DIR
Vitest config: vitest-e2e.config.ts
```
see [E2E-Tests.run.xml](.run/E2E-Tests.run.xml)

## Docker

The project includes a production-ready multi-stage Dockerfile. It works both as a standalone project and inside a monorepo created with `lt fullstack init`.

### Build & Run

```bash
# Standalone
docker build -t api .
docker run -e NSC__MONGOOSE__URI=mongodb://host:27017/mydb -p 3000:3000 api

# Monorepo (build context = monorepo root)
docker build --build-arg API_DIR=projects/api -t api .
```

### What it does

1. **Stage 1 (deps):** Installs dependencies with pnpm, rebuilds bcrypt native addon
2. **Stage 2 (build):** Compiles TypeScript, removes devDependencies
3. **Stage 3 (runner):** Minimal Alpine image, non-root user, runs migrations on startup

### Files

| File | Purpose |
|------|---------|
| `Dockerfile` | Multi-stage production build |
| `docker-entrypoint.sh` | Runs DB migrations before server start |
| `.dockerignore` | Excludes node_modules, dist, tests, etc. from build context |

### Environment

The migration store reads the MongoDB URI from the `NSC__MONGOOSE__URI` environment variable, so it works in Docker production where `config.env.ts` is not available as TypeScript source.

## Debugging

Configuration for debugging is:
```
Node interpreter: /user/local/bin/node
Node parameters: node_modules/@nestjs/cli/bin/nest.js start --debug --watch
Working directory: FULL_PATH_TO_PROJECT_DIR
JavaScript file: src/main.ts
```
see [Debug.run.xml](.run/Debug.run.xml)

## Configuration

The configuration of the server is done via `src/config.env.ts`. The file is structured into two
helper functions and an environment matrix; the full philosophy and a "where to change what" guide
sit in the file's JSDoc header. Read that first when you're not sure where a value comes from.

### Environments

| Env | Type | Secrets | Runs without `.env` |
|-----|------|---------|---------------------|
| `local` | local-only — developer machine | hardcoded public dummies | yes |
| `e2e` | local-only — used by `pnpm run test:e2e` | hardcoded public dummies | yes |
| `ci` | local-only — used by `pnpm run vitest:ci` | hardcoded public dummies | yes |
| `develop` | deployed (first stage) | **must** come from `NSC__*` env vars | no — fails fast |
| `test` | deployed (staging stage) | **must** come from `NSC__*` env vars | no — fails fast |
| `production` | deployed (final stage) | **must** come from `NSC__*` env vars | no — fails fast |

Local-only envs are independent stages, not a pipeline — each is configured for a specific scenario
(developer machine, test runs, CI runs). Deployed envs share the exact same baseline (`deployedConfig`)
and follow the pipeline `develop → test → production`, so any misconfiguration surfaces in `develop`
or `test` long before it reaches production.

### Environment variables

Three ways to override or extend the resolved config:

1. **`NSC__`-prefixed env vars** *(recommended for secrets/URLs)* — auto-merged into the config tree
   by `getEnvironmentConfig`. Path mapping: `NSC__FOO__BAR` → `config.foo.bar`; single underscore =
   camelCase boundary (so `NSC__BETTER_AUTH__SECRET` → `config.betterAuth.secret`).
2. **`NEST_SERVER_CONFIG` JSON** — a multiline JSON string that is parsed and deep-merged into the
   config (lodash `mergeWith`, arrays are replaced not concatenated).
3. **Direct `process.env` reads in `config.env.ts`** — only used for values that need parsing
   (booleans, numbers, comma-separated lists). Examples: `LEGACY_AUTH_ENABLED`, `CORS_ALLOWED_ORIGINS`,
   `SMTP_PORT`, `SMTP_SECURE`.

### Secrets policy

For deployed envs, `src/config.env.ts` contains **no secrets, no fallback values, no `process.env.*`
reads for sensitive paths**. Operators set them via `NSC__*` env vars; if any required value is
missing, the server throws at startup with a list of all missing variables. The full list is
maintained in a single place (`REQUIRED_DEPLOYED_ENV_VARS` in `config.env.ts`) and is the source of
truth for both the runtime guard and the inline documentation.

See `.env.example` for the complete catalog of required and optional env vars.

### Verifying configurations

`pnpm run check:envs` boots every NODE_ENV against an empty `.env` (deployed must fail-fast,
local must start) and against a fixture `.env` (all six must start). Add `--docker` for the same
checks inside the production image: `pnpm run check:envs:docker`.

## Test & debug the NestServer package in this project
Use `pnpm link` to include the local NestJS server in the project.

1. clone [NestServer](https://github.com/lenneTech/nest-server): `git clone https://github.com/lenneTech/nest-server.git`
2. go to the nest-server folder (`cd nest-server`), install the packages via `pnpm install` and start the nest server in watch mode: `pnpm run watch`
3. link the nest server live package to this project via `pnpm run link:nest-server` and start the server: `pnpm start`
4. unlink the nest-server live package and use the normal package again when you are done: `pnpm run unlink:nest-server`

## Deployment with deploy.party

This project is prepared for deployment with deploy.party.

Example configuration for deploy.party (productive):

| Key                  | Value                                              |
|----------------------|----------------------------------------------------|
| Source               | GitLab                                             |  
| Repository           | my-repo                                            |
| Branch               | main                                               |
| Registry             | localhost                                          |
| Name                 | api                                                |
| URL                  | api.my-domain.com                                  |
| Type                 | Node                                               |
| Base image           | node:20                                            |
| Custom image command | RUN apt-get install -y tzdata curl                 |
|                      | ENV TZ Europe/Berlin                               |
| Base directory       | ./projects/api                                     |
| Install command      | pnpm install                                       |
| Build command        | pnpm run build                                     |
| Start command        | pnpm run dp:prod                                   |
| Healthcheck command  | curl --fail http://localhost:3000/meta \|\| exit 1 |
| Port                 | 3000                                               |
| Enable SSL           | true                                               |

## Documentation
The API and developer documentation can automatically be generated.

```bash
# generate and serve documentation
$ pnpm run docs
```

## Update
An update to a new Nest Sever version can be done as follows:

1. set the new Nest Server version in the package.json under `{dependencies: {"@lenne.tech/nest-server": "NEW_VERSON" }}`.
2. run `pnpm run update`
3. adjust project according to changes in git history from nest server
4. run tests via `pnpm run test:e2e`, build via `pnpm run build` and start the server with `pnpm start` to check if everything is working

Since this starter is regularly updated, it is ideal as a template for the changes to be made in your own project. 
Simply compare the current version in the Git history of this starter with the version that was previously used in 
the project and adapt your own project accordingly.

## Planned enhancements:

- Documentation of extensions and auxiliary classes

## Thanks

Many thanks to the developers of [Nest](https://github.com/nestjs/nest)
and all the developers whose packages are used here.

## License

MIT - see LICENSE
