import {
  type DatabaseSqlEngine,
  getEnvironmentConfig,
  IServerOptions,
  isLocalEnv,
  merge,
  resolveSmtpSecure,
  RoleEnum,
} from '@lenne.tech/nest-server';
import { Logger, type LogLevel } from '@nestjs/common';
import { CronExpression } from '@nestjs/schedule';
import * as dotenv from 'dotenv';
import { join } from 'path';

import { ProjectErrors } from './server/common/errors/project-errors.js';

import metaData from './meta.json' with { type: 'json' };

/**
 * Configuration for the different environments.
 *
 * --------------------------------------------------------------------------
 * Single source of truth → `IServerOptions`
 * --------------------------------------------------------------------------
 * Every option, its type, and its default is documented in
 * `node_modules/@lenne.tech/nest-server/dist/core/common/interfaces/server-options.interface.d.ts`.
 * If a value here is missing, the framework's default applies (see
 * `core.module.ts` and `cookies.helper.ts` in the same package).
 *
 * --------------------------------------------------------------------------
 * Where to change what
 * --------------------------------------------------------------------------
 * - **Defaults that apply to every deployed env** → edit `deployedConfig()`.
 * - **Defaults that apply to every local env**    → edit `localConfig()`.
 * - **Per-env override** (e.g. local disables roles, e2e drops cron jobs)
 *   → pass it via `options.config` to the helper. The override is deep-merged
 *   on top of the base via the framework's `merge` (lodash mergeWith with
 *   array replacement) — same semantics as `getEnvironmentConfig` itself.
 * - **Required deployed env vars**
 *   → edit the `REQUIRED_DEPLOYED_ENV_VARS` table below. Single source of
 *   truth for both the fail-fast guard and the inline doc.
 * - **Log levels** (`log` and above when deployed, every level locally)
 *   → `resolveLogLevels()` below; per deployment NestJS's `NEST_LOG_LEVEL`.
 * - **Database** (MongoDB by default, PostgreSQL by configuration)
 *   → `PROJECT_SQL_ENGINE` below, or the `NSC__DATABASE__*` env vars.
 *
 * --------------------------------------------------------------------------
 * Secrets policy
 * --------------------------------------------------------------------------
 * - **Local-only envs** (pipeline `local → e2e → ci`): hardcoded dummy
 *   secrets so the project runs **completely without a `.env`**. These
 *   values are public and MUST NOT appear in any deployment.
 * - **Deployed envs** (pipeline `develop → test → production`): NO secrets
 *   in this file. Operators set them via `NSC__*` environment variables
 *   which are auto-merged into the config by `getEnvironmentConfig`
 *   (path: `NSC__FOO__BAR` → `config.foo.bar`, single underscore =
 *   camelCase boundary). See `.env.example`.
 *
 *   All three deployed envs share the exact same baseline (`deployedConfig`)
 *   so any misconfig surfaces in `develop`/`test` long before reaching
 *   production. Missing required env vars throw at startup (fail-fast).
 *
 * --------------------------------------------------------------------------
 * URL configuration
 * --------------------------------------------------------------------------
 * - `local`, `ci`, `e2e`: localhost defaults (API:3000, App:3001) — no setup needed.
 *   Override defaults via env vars: PORT, BIND_ADDRESS, BASE_URL, APP_URL,
 *   NSC__MONGOOSE__URI (NSC__DATABASE__URL / __OWNER_URL on PostgreSQL), SMTP_HOST,
 *   SMTP_PORT (e.g. for `lt dev up` parallel projects that serve the API as
 *   `https://api.<slug>.localhost` behind Caddy).
 * - `develop`, `test`, `production`: set `NSC__BASE_URL`; `appUrl` is auto-derived
 *   (e.g. `https://api.example.com` → `https://example.com`).
 *
 * Cross-subdomain cookies (`crossSubDomainCookies: true`) are enabled in
 * the local baseline whenever `BASE_URL` is set, so Better Auth shares
 * cookies between `https://api.<slug>.localhost` and `https://<slug>.localhost`
 * automatically. The cookie `domain` is auto-derived from `appUrl`.
 */
dotenv.config({ quiet: true });

// =============================================================================
// Project-wide constants (paths, errors, demo cron jobs)
// =============================================================================
const PROJECT_STATIC_ASSETS = { options: { prefix: '' }, path: join(import.meta.dirname, '..', 'public') };
const PROJECT_TEMPLATES = { engine: 'ejs', path: join(import.meta.dirname, 'assets', 'templates') };
const PROJECT_ERROR_CODE = { additionalErrorRegistry: ProjectErrors };
const PROJECT_HEALTH_CHECK = { configs: { database: { enabled: true } }, enabled: true };

/**
 * File access — the COARSE gate on the two inherited download routes
 * (`GET /files/id/:id`, `GET /files/:filename`).
 *
 * Since nest-server 11.33.0 these are role-gated and default to `[ADMIN]`.
 * That default is right for the framework's own reference server, and wrong
 * for this starter: it ships an avatar upload every signed-in user may use, so
 * an admin-only download would make `user.avatar` unreadable by the very user
 * it belongs to.
 *
 * So the gate is widened to "signed in" and the real decision is made per file
 * in `FileService.checkRights()` (own file, or ADMIN). Roles can only answer
 * "may this caller reach the route"; they can never answer "may this caller
 * have THIS file". See the framework's 11.32.x-to-11.33.x guide § A.3.
 *
 * `uploadRoles` / `deleteRoles` are left at their `[ADMIN]` default — they
 * govern the core GraphQL members only, and this project's own file endpoints
 * declare `@Roles(RoleEnum.ADMIN)` themselves.
 *
 * NOTE for markup-driven downloads: anything stricter than `S_EVERYONE` only
 * works from an `<img>`/`<a download>` when the session travels as a COOKIE on
 * a same-site request (cookies are enabled here, and `lt dev up` serves app and
 * API as siblings under one registrable domain). A Bearer-only frontend has to
 * fetch such URLs programmatically and build an object URL.
 */
const PROJECT_FILE = { downloadRoles: [RoleEnum.S_USER] };

/**
 * Request body limits (nest-server 11.42.4+), SHARED by `localConfig()` and `deployedConfig()`
 * so the limit is the same in production, under `lt dev up` and in the e2e suite.
 *
 * `undefined` keeps body-parser's 100 kB for JSON and for URL-encoded bodies — what this starter
 * runs on. Over the limit a request gets 413 `#LTNS_0304: Request body too large [...]`, before
 * authentication and routing. Raise a limit only where the data model needs it, and only as far:
 * `JSON.parse` blocks the event loop for the whole body (~0.5 ms per 100 kB, ~55 ms for 2 MB).
 * Set it here rather than with `useBodyParser()` in main.ts, which the e2e suite never runs.
 * Per-environment override without a code change: `NSC__BODY_PARSER__JSON__LIMIT=2mb`.
 *
 *   const PROJECT_BODY_PARSER: IServerOptions['bodyParser'] = { json: { limit: '2mb' } };
 */
const PROJECT_BODY_PARSER: IServerOptions['bodyParser'] = undefined;

/**
 * TUS resumable uploads, SHARED by `localConfig()` and `deployedConfig()`. `TusModule.forRoot()` in
 * server.module.ts gets no `config`, so this key is what configures it — read since nest-server
 * 11.42.9; before, a `tus` block here did nothing at all.
 *
 * `undefined` keeps the framework defaults: endpoint `/tus`, signed-in users only (`[S_USER]`), any
 * file type, 50 GB per upload. Restrict it like this:
 *
 *   const PROJECT_TUS: IServerOptions['tus'] = { allowedTypes: ['image/*', 'application/pdf'], maxSize: 100 * 1024 * 1024 };
 *
 * `false` switches TUS off. Upload URLs follow the request, so they stay correct when you enable the
 * global prefix in main.ts. `relativeLocation: true` for a frontend that reaches TUS through a
 * same-origin proxy. See the framework's 11.42.8-to-11.42.9 guide § 5.
 */
const PROJECT_TUS: IServerOptions['tus'] = undefined;

/*
 * FROM nest-server 11.35.0 ON, the rule in `FileService.checkRights()` is also available as a
 * DECLARATION — add `access` to PROJECT_FILE and you can delete the override:
 *
 *   const PROJECT_FILE = { access: 'owner', downloadRoles: [RoleEnum.S_USER] };
 *
 * | `file.access`   | project class                                            |
 * |-----------------|----------------------------------------------------------|
 * | `'public'`      | open: anyone may read and write                          |
 * | `'authenticated'` | login-restricted: every signed-in user                  |
 * | `'owner'`       | per-user: only the uploader, plus ADMIN                  |
 * | `'tenant'`      | per-tenant: only the own validated tenant, plus ADMIN    |
 * | `'custom'`      | the default — you write `checkRights()` yourself         |
 *
 * `'owner'` is exactly what this project's override does, including the parts that are easy to get
 * wrong (fail closed without a user, require `metadata.ownerId` to be PRESENT, cover the by-name
 * branch, refuse a listing) AND the metadata stamping that `AvatarController` currently does by hand.
 *
 * This starter keeps the explicit override on purpose: it is the reference implementation, so it has
 * to EXERCISE the inheritance seam a consuming project extends — a rule that lives only in a preset
 * proves the preset works, never that the extension point still does. **In your own project, prefer
 * the preset** unless your rights are something the framework cannot guess (an explicit read right, a
 * case assignment, a published flag).
 *
 * Two consequences worth knowing before you switch: files uploaded BEFORE you enable the preset carry
 * no `metadata.ownerId` and are therefore ADMIN-only until you backfill it, and declaring the class
 * never widens the role gate — `'public'` still needs `downloadRoles: [RoleEnum.S_EVERYONE]`.
 */

/**
 * The database: MongoDB, the default, or PostgreSQL (nest-server 12.1.0+). One codebase for both: the models are
 * registered through `CorePersistenceModule.forFeature()`, and the configuration decides where they are stored.
 *
 * `undefined` keeps MongoDB: the `mongoose` configuration is the only data source, exactly as before. The SQL engine
 * (`'typeorm'`, `'kysely'` or `'drizzle'`, each needs its package next to `pg`) switches every environment to
 * PostgreSQL:
 *
 *   const PROJECT_SQL_ENGINE: DatabaseSqlEngine | undefined = 'typeorm';
 *
 * - **local, e2e, ci** then run on the PostgreSQL of docker-compose.yml (`docker compose --profile postgres up -d`) with
 *   the public dummy roles of LOCAL_POSTGRES below, and connect to no MongoDB (a NSC__MONGOOSE__URI from the shell, as
 *   `lt dev up` exports it, is dropped there unless `database.models` routes a model to it).
 * - **Deployed envs** read the URLs from NSC__DATABASE__URL (application role) and NSC__DATABASE__OWNER_URL (owner
 *   role); both become required, NSC__MONGOOSE__URI no longer (REQUIRED_DEPLOYED_ENV_VARS).
 *
 * Without a code change, the env vars switch a single run or deployment: NSC__DATABASE__URL and
 * NSC__DATABASE__OWNER_URL name the databases, NSC__DATABASE__SQL_ENGINE alone puts the local envs on LOCAL_POSTGRES
 * (the CI job `postgres` does that). Both roles and why they are separate: docker/postgres/initdb/10-roles.sh.
 *
 * Per-model exceptions (`database.models`), several sources, MySQL / MariaDB: nest-server migration guide
 * 12.0.x → 12.1.x, §3 and §7. Moving existing MongoDB data is a data migration; nothing is copied by itself.
 */
const PROJECT_SQL_ENGINE: DatabaseSqlEngine | undefined = undefined;

/**
 * The PostgreSQL of the local envs: the `postgres` service of docker-compose.yml with the roles its init script creates
 * (docker/postgres/initdb/10-roles.sh). Public dummy credentials, like the other secrets of localConfig() — NEVER in a
 * deployment. 5433 rather than 5432 keeps clear of a PostgreSQL already running on the machine.
 */
const LOCAL_POSTGRES = {
  app: 'nest_app:nest-app-secret',
  host: '127.0.0.1:5433',
  owner: 'nest_owner:nest-owner-secret',
};

/** The env vars that configure the default data source; any of them switches a local env to it */
const DATABASE_ENV_VARS = ['NSC__DATABASE__URL', 'NSC__DATABASE__OWNER_URL', 'NSC__DATABASE__SQL_ENGINE'];

/**
 * The `database` block of a local env, or `undefined` for MongoDB. URLs from the environment win over LOCAL_POSTGRES,
 * both or neither: half from each would migrate one database and serve another.
 */
function localDatabase(dbName: string): IServerOptions['database'] | undefined {
  if (!PROJECT_SQL_ENGINE && !DATABASE_ENV_VARS.some((name) => process.env[name])) {
    return undefined;
  }
  if (process.env.NSC__DATABASE__URL || process.env.NSC__DATABASE__OWNER_URL) {
    return { sqlEngine: PROJECT_SQL_ENGINE };
  }
  return {
    ownerUrl: `postgres://${LOCAL_POSTGRES.owner}@${LOCAL_POSTGRES.host}/${dbName}`,
    sqlEngine: PROJECT_SQL_ENGINE,
    url: `postgres://${LOCAL_POSTGRES.app}@${LOCAL_POSTGRES.host}/${dbName}`,
  };
}

/** Demo cron job — disabled by default; flip `disabled: false` to activate. */
const DEMO_CRON_JOBS = {
  sayHello: {
    cronTime: CronExpression.EVERY_5_MINUTES,
    disabled: true,
    runOnInit: false,
    timeZone: 'Europe/Berlin',
  },
};

// =============================================================================
// Type guards (narrow IServerOptions union types for fail-fast checks below)
// =============================================================================

interface SmtpOptionsLike {
  auth?: { pass?: string; user?: string };
  host?: string;
}

function isSmtpOptionsObject(smtp: unknown): smtp is SmtpOptionsLike {
  return typeof smtp === 'object' && smtp !== null && !Array.isArray(smtp);
}

function getBetterAuthSecret(config: Partial<IServerOptions>): string | undefined {
  return typeof config.betterAuth === 'object' ? config.betterAuth.secret : undefined;
}

/** Does a `database` block configure the default source? Without one, `mongoose` is the default source */
function hasDatabase(config: Partial<IServerOptions>): boolean {
  return config.database !== undefined && config.database !== false;
}

/** The URL of the default source: `database` as a URL string, or its `url` */
function getDatabaseUrl(config: Partial<IServerOptions>): string | undefined {
  return typeof config.database === 'string' ? config.database : config.database ? config.database.url : undefined;
}

/** A `database` block whose default source is (or, without a URL yet, will be) a SQL database */
function hasSqlDatabase(config: Partial<IServerOptions>): boolean {
  return hasDatabase(config) && !/^mongodb(\+srv)?:/i.test(getDatabaseUrl(config) ?? '');
}

/** Whether `database.models` keeps a model in the MongoDB of the `mongoose` configuration */
function routesModelsToMongoose(config: Partial<IServerOptions>): boolean {
  return typeof config.database === 'object' && Object.values(config.database.models ?? {}).includes('mongoose');
}

// =============================================================================
// Required `NSC__*` env vars for deployed envs (single source of truth)
// -----------------------------------------------------------------------------
// Used by the fail-fast guard (bottom of file) AND documented in `.env.example`.
// Add a new required var by appending an entry — both the runtime check and
// the error message update automatically.
// =============================================================================
type ConfigCheck = (config: Partial<IServerOptions>) => boolean;
interface RequiredEnvVar {
  /** Predicate evaluated against the resolved config; `false` ⇒ missing. */
  check: ConfigCheck;
  /** Optional gate — entry is only enforced when this returns true. */
  condition?: ConfigCheck;
  /** The `NSC__*` env var name shown in the error message. */
  envVar: string;
}

export const REQUIRED_DEPLOYED_ENV_VARS: RequiredEnvVar[] = [
  { check: (c) => !!c.baseUrl, envVar: 'NSC__BASE_URL' },
  // MongoDB, the default: required while no `database` block names the default source (PROJECT_SQL_ENGINE,
  // NSC__DATABASE__*). A deployment on PostgreSQL needs no MongoDB, and setting the URI anyway connects one.
  { check: (c) => !!c.mongoose?.uri, condition: (c) => !hasDatabase(c), envVar: 'NSC__MONGOOSE__URI' },
  // PostgreSQL: the application role serves the requests, the owner role brings the schema up to date at boot and
  // runs the migrations (docker-entrypoint.sh). Without the owner, the boot stops at the first pending schema change.
  { check: (c) => !!getDatabaseUrl(c), condition: hasDatabase, envVar: 'NSC__DATABASE__URL' },
  {
    check: (c) => typeof c.database === 'object' && !!c.database.ownerUrl,
    condition: hasSqlDatabase,
    envVar: 'NSC__DATABASE__OWNER_URL',
  },
  { check: (c) => !!getBetterAuthSecret(c), envVar: 'NSC__BETTER_AUTH__SECRET' },
  { check: (c) => isSmtpOptionsObject(c.email?.smtp) && !!c.email.smtp.host, envVar: 'NSC__EMAIL__SMTP__HOST' },
  {
    check: (c) => isSmtpOptionsObject(c.email?.smtp) && !!c.email.smtp.auth?.user,
    envVar: 'NSC__EMAIL__SMTP__AUTH__USER',
  },
  {
    check: (c) => isSmtpOptionsObject(c.email?.smtp) && !!c.email.smtp.auth?.pass,
    envVar: 'NSC__EMAIL__SMTP__AUTH__PASS',
  },
  { check: (c) => !!c.email?.defaultSender?.email, envVar: 'NSC__EMAIL__DEFAULT_SENDER__EMAIL' },
  // Legacy Auth secrets — ONLY required when a consuming project explicitly
  // opts back into legacy endpoints via `auth.legacyEndpoints.enabled: true`
  // (default in this starter is BetterAuth-only, so these stay unset).
  {
    check: (c) => !!c.jwt?.secret,
    condition: (c) => c.auth?.legacyEndpoints?.enabled === true,
    envVar: 'NSC__JWT__SECRET',
  },
  {
    check: (c) => !!c.jwt?.refresh?.secret,
    condition: (c) => c.auth?.legacyEndpoints?.enabled === true,
    envVar: 'NSC__JWT__REFRESH__SECRET',
  },
];

// =============================================================================
// Deployed-env baseline — `develop` → `test` → `production` (deployment pipeline)
// -----------------------------------------------------------------------------
// All required secrets/URLs come from `NSC__*` env vars (see
// `REQUIRED_DEPLOYED_ENV_VARS` above) and are merged in by `getEnvironmentConfig`.
//
// Optional operator knobs (parsed in code → kept as direct env vars):
//   CORS_ALLOWED_ORIGINS  comma-separated extra origins
//   SMTP_PORT             default 587
//   SMTP_SECURE           "false" → STARTTLS
//   TWO_FACTOR_APP_NAME   TOTP issuer (defaults to brand name)
//   BREVO_API_KEY         enables Brevo template-mail overlay
// =============================================================================
function deployedConfig(
  envName: string,
  options?: {
    brandSuffix?: string;
    config?: Partial<IServerOptions>;
  },
): Partial<IServerOptions> {
  const brand = options?.brandSuffix ? `Nest Server Starter ${options.brandSuffix}` : 'Nest Server Starter';
  const smtpPort = parseInt(process.env.SMTP_PORT || '587', 10);

  const base: Partial<IServerOptions> = {
    automaticObjectIdFiltering: true,
    // The LEGACY reset token (`POST /users/password/reset`) expires after 60 minutes since
    // nest-server 11.39.0 — before that it never expired at all, while the error message
    // already claimed it did. A reset link takes over an EXISTING account, so an unbounded
    // one means an archived, forwarded or restored mail opens that account years later.
    //
    // Left at the default on purpose; set it only to shorten the window, or to state the
    // opt-out explicitly. `0` disables expiry and restores the pre-11.39 behaviour — anything
    // unusable (negative, empty, non-numeric) falls back to 60 rather than to "unbounded", so
    // a typo can never be the thing that switches off an account-takeover credential.
    //
    // auth: { passwordReset: { tokenExpiresInMinutes: 60 } },
    //
    // betterAuth.secret comes from NSC__BETTER_AUTH__SECRET
    betterAuth: {
      // Native password reset is ON by default since nest-server 11.36.1: the framework injects the
      // `sendResetPassword` hook, so `POST /iam/request-password-reset` is a live, UNAUTHENTICATED,
      // token-minting, mail-sending endpoint. Two bounds guard it — a per-recipient cooldown in the
      // mailer (always on) and the IP-axis `rateLimit` below (OFF unless you configure it).
      //
      // emailAndPassword: { passwordReset: false },   // answers RESET_PASSWORD_DISABLED again
      //
      // Public self-registration is OPEN by default: `POST /iam/sign-up/email` creates an account for
      // anyone, and `GET /iam/features` reports `signUpEnabled: true`. A project WITHOUT a public
      // registration (invitation-only, accounts created by an admin) must close it here. A missing
      // registration page closes nothing: the route answers whether or not the frontend links to it.
      // Since nest-server 12.3.0 the switch also refuses first sign-ins through social providers, while
      // existing users keep signing in. Plugins the project adds itself (`plugins` in this block) are NOT
      // covered: one that can create a user needs its own sign-up option, e.g.
      // `magicLink({ disableSignUp: true, … })`, or it registers anyone who asks for a link.
      //
      // emailAndPassword: { disableSignUp: true },   // same object as `passwordReset` above
      //
      // The project's own invitation and admin flows then create their users IN-PROCESS, the way
      // `CoreSystemSetupService.createInitialAdmin()` does through Better-Auth's internal adapter, and
      // never through the public route, neither over HTTP nor via `api.signUpEmail()`. That route is
      // exactly what the switch closes: a flow built on it stops working once the switch is set, and
      // keeping such a flow alive is how sign-up stays open for everybody.
      //
      // Where a failed OAuth sign-in lands when the flow brought no error URL of its own (state expired
      // after ten minutes, missing or tampered), and where `GET /iam/error` forwards (nest-server
      // 12.10.0+). Unset: <appUrl>/auth/login?error=<code>, the login page of nuxt-base-starter. A path
      // is resolved against the app URL, an absolute http(s) URL is used as it is, `false` keeps
      // Better-Auth's own error page on the API host. The login page maps `error` to a text of its own
      // and never renders `error_description`, which anyone can set through a link to /iam/error. From
      // the environment: NSC__BETTER_AUTH__ERROR_URL (see .env.example).
      //
      // errorUrl: '/auth/login',
      //
      // Sign-in through Microsoft Entra ID for one organization, identity only. Needs nest-server
      // 12.10.0 or later: older versions hand a provider its credentials and `disableSignUp` only and
      // drop the other options below, so the sign-in runs against `common` with Microsoft Graph
      // scopes, and `disableSignUp: false` then opens sign-up to every account `common` admits. The
      // values that differ per stage come from NSC__BETTER_AUTH__SOCIAL_PROVIDERS__MICROSOFT__CLIENT_ID,
      // __CLIENT_SECRET and __TENANT_ID (see .env.example); the provider stays off while the client
      // id or secret is empty. Combine it with `emailAndPassword: { disableSignUp: true }` above to
      // close e-mail sign-up while the organization's members get their account through Microsoft.
      // A failed sign-in lands on the page `errorUrl` (above) names.
      //
      // Microsoft as the only way in (`emailAndPassword: { enabled: false }`) switches Passkey and
      // two-factor off since nest-server 12.11.0: a passkey registered once would keep signing its
      // owner in after the organization withdrew the access. `twoFactor` below then logs a warning;
      // keep a factor deliberately with `passkey: true` or `twoFactor: { …, enabled: true }`.
      //
      // socialProviders: {
      //   microsoft: {
      //     clientId: '', // NSC__…__CLIENT_ID: the app registration's application (client) id
      //     clientSecret: '', // NSC__…__CLIENT_SECRET
      //     // tenantId from NSC__…__TENANT_ID. Unset, Better-Auth signs in through `common`, which admits
      //     // accounts of every organization and personal Microsoft accounts.
      //     disableDefaultScope: true, // leave out Better-Auth's default User.Read and offline_access
      //     scope: ['openid', 'profile', 'email'], // identity only: no Graph scope, no refresh token
      //     disableProfilePhoto: true, // no Graph request for the profile photo on every sign-in
      //     disableSignUp: false, // a member's first Microsoft sign-in creates the account
      //     // Sign-in only through the redirect to Microsoft. nest-server sets this for every social
      //     // provider since 12.11.0, so the line states the default. Only `false` opens
      //     // POST /iam/sign-in/social and /iam/link-social for a Microsoft ID token sent directly (up to
      //     // 12.10.x, leaving the line out did): the one a user's last sign-in stored, which
      //     // POST /iam/get-access-token hands back, opens a new session without asking Microsoft until
      //     // about an hour after that sign-in, also after the organization revoked the user's access.
      //     // The redirect flow does not use that path and keeps working.
      //     disableIdTokenSignIn: true,
      //   },
      // },
      //
      // Sessions last 7 days and are extended once a day while they are used, so a session used every
      // day never ends and a withdrawal at the sign-in provider never reaches it. A fixed lifetime signs
      // the user out after that many hours, every time, and the next sign-in asks Microsoft again
      // (nest-server 12.11.0+; NSC__BETTER_AUTH__SESSION__EXPIRES_IN_HOURS / __EXTEND_ON_USE):
      //
      // session: { expiresInHours: 8, extendOnUse: false },
      //
      // Route-level limiter for all /iam/* endpoints. Presence of the object enables it — an
      // explicit `enabled: false` pre-configures without switching it on. Set `trustProxy` (below)
      // whenever you turn this on behind a reverse proxy, or every client shares one bucket.
      //
      // Switchable from the environment, like `trustProxy`: no template can know the right
      // numbers, but an operator should not have to edit TypeScript to turn the limiter on. The
      // per-recipient cooldown in the mailer covers mail-bombing ONE address; this is the IP axis,
      // which is what bounds address enumeration and mail-cost amplification across many.
      ...(process.env.IAM_RATE_LIMIT_MAX
        ? {
            rateLimit: {
              max: Number(process.env.IAM_RATE_LIMIT_MAX),
              windowSeconds: Number(process.env.IAM_RATE_LIMIT_WINDOW_SECONDS ?? 60),
            },
          }
        : {}),
      //
      // Send the reset mail through Brevo instead of SMTP/EJS. Deliberately separate from
      // `emailVerification.brevoTemplateId` and with no fallback to it — that one is the
      // VERIFICATION mail, and reusing it would tell someone who asked to reset their password to
      // confirm their address instead.
      // emailVerification: { passwordResetBrevoTemplateId: 42 },
      //
      // The application name in the verification and reset mails (subject, templates, Brevo parameters;
      // nest-server 12.8.3+). Unset, the mails use the package.json name, "Api" in a monorepo. Same object as
      // above; with verification switched off it reads { enabled: false, appName }, because `false` keeps no
      // settings. Also NSC__BETTER_AUTH__EMAIL_VERIFICATION__APP_NAME (.env.example).
      // emailVerification: { appName: 'My App' },
      //
      // NOT wired here on purpose: `options.user.validateUserInfo`. It is better-auth's hook for
      // narrowing self-registration (domain allowlist, invite code), and reaching for it is the
      // obvious move — but from better-auth 1.7 it also BREAKS INITIAL-ADMIN SETUP. better-auth
      // resolves the hook through `getCurrentAuthContext()`, which only exists inside its own
      // request pipeline; system setup runs at application bootstrap, so the call ends in
      // `FORBIDDEN / validation_context_missing` and no admin is ever created. Fail-closed, but
      // the error names nothing you would connect to this setting.
      //
      // Note the source is NOT a bypass: the framework passes `{ method: 'admin' }` when it
      // provisions the first admin, so a hook that runs CAN allow it through by branching on
      // `source.method` — the context problem above is the part you cannot branch around. If you
      // need the hook, provision the first admin through a request-scoped IAM route instead.
      // See nest-server migration-guides/11.36.x-to-11.37.0.md §7.
      twoFactor: { appName: process.env.TWO_FACTOR_APP_NAME || brand },
    },
    bodyParser: PROJECT_BODY_PARSER,
    // Brevo overlay — only active when BREVO_API_KEY is set
    ...(process.env.BREVO_API_KEY
      ? {
          brevo: {
            apiKey: process.env.BREVO_API_KEY,
            // The SDK would otherwise retry twice, honouring Retry-After with a 60 s cap PER
            // attempt and no timeout at all — and sendMail() is awaited inside request handlers
            // (e.g. the BetterAuth email-verification hook), so a rate-limited Brevo could park a
            // user-facing request for ~2 minutes. The framework defaults to 0/10; raise them here
            // only if you deliberately want SDK-level retrying.
            maxRetries: Number(process.env.BREVO_MAX_RETRIES ?? 0),
            sender: {
              email: process.env.EMAIL_DEFAULT_SENDER || 'noreply@example.com',
              name: process.env.EMAIL_DEFAULT_SENDER_NAME || brand,
            },
            // A failed send resolves to `null` rather than throwing. Set this to true on
            // security-critical delivery paths where the caller must not proceed silently.
            throwOnError: process.env.BREVO_THROW_ON_ERROR === 'true',
            timeoutInSeconds: Number(process.env.BREVO_TIMEOUT_SECONDS ?? 10),
          },
        }
      : {}),
    compression: true,
    // configEndpoint: deliberately unset. Since nest-server 12.5.0 the administrators' `GET /config`
    // answers 404 in every deployed env (local, ci and e2e keep it), and where it answers it masks every
    // secret. A stage that needs it sets NSC__CONFIG_ENDPOINT=true (.env.example); the answer stays masked.
    // CORS propagated to GraphQL/REST/BetterAuth via shared buildCorsConfig
    cors: { allowedOrigins: process.env.CORS_ALLOWED_ORIGINS?.split(',').filter(Boolean) },
    // PostgreSQL instead of MongoDB (PROJECT_SQL_ENGINE above). Left out by default: then the `mongoose` configuration
    // (NSC__MONGOOSE__URI) is the only data source, exactly as before. The URLs never live in this file: the
    // application role from NSC__DATABASE__URL, the owner role from NSC__DATABASE__OWNER_URL (.env.example,
    // "Database"). Written out, the block the two fill in:
    //
    // database: {
    //   models: { Article: 'mongoose' }, // exceptions per model, here: Article stays in MongoDB (NSC__MONGOOSE__URI)
    //   ownerUrl: 'postgres://owner_role@db/project', // owns the tables, evolves them at boot, runs the migrations
    //   sqlEngine: 'typeorm', // or 'kysely' / 'drizzle'
    //   url: 'postgres://app_role@db/project', // owns nothing, no BYPASSRLS: every request runs as this role
    // },
    //
    // `models` is optional. With NSC__MONGOOSE__URI also set, MongoDB stays as the extra source `mongoose`, and only the
    // models listed there are stored in it.
    //
    // The short form `database: 'postgres://app_role@db/project'` names the application role only. nest-server then
    // evolves no table (it only verifies them and stops the boot while a change is pending), and the migrations have no
    // owner to run as. The deployed envs therefore refuse it and ask for NSC__DATABASE__OWNER_URL beside it; an
    // NSC__DATABASE__* variable replaces a short form as a whole, so set NSC__DATABASE__URL with it.
    // Per database: nest-server migration-guides/12.0.x-to-12.1.x.md §3 (PostgreSQL).
    ...(PROJECT_SQL_ENGINE ? { database: { sqlEngine: PROJECT_SQL_ENGINE } } : {}),
    email: {
      // defaultSender.email comes from NSC__EMAIL__DEFAULT_SENDER__EMAIL
      defaultSender: { name: brand },
      // Optional since nest-server 12.3.2: a Reply-To header on every SMTP mail, auth mails included, so answers
      // reach e.g. a support mailbox instead of noreply@. Unset means no header. Set it through
      // NSC__EMAIL__DEFAULT_REPLY_TO; one sendMail() call overrides it with `replyTo` or drops it with `replyTo: false`.
      // defaultReplyTo: 'support@example.com',
      // The page nuxt-base-starter ships (`app/pages/auth/reset-password.vue`) reads the token from
      // `?token=`, so the link must carry it that way. `{token}` is substituted, and the leading
      // slash resolves against `appUrl` — which keeps this one line correct in every environment
      // instead of needing a full URL per deployment.
      //
      // Set explicitly rather than left to the framework default: that default appends the token as
      // a PATH segment, which suits a project whose page is `reset-password/[token].vue`. Both
      // conventions are supported; what breaks is a link built for one and a page written for the
      // other, and then only for whoever clicks it.
      passwordResetLink: '/auth/reset-password?token={token}',
      smtp: {
        // host + auth.user + auth.pass come from NSC__EMAIL__SMTP__HOST etc.
        port: smtpPort,
        // `secure: false` alone means OPPORTUNISTIC STARTTLS: nodemailer upgrades only if the
        // server advertises the capability, so an attacker who strips it from the greeting gets
        // the SMTP credentials and a working reset link in cleartext. This matters BECAUSE of the
        // fix below — while the 587 + secure:true pairing was in place the connection always
        // failed, and a channel that never opens has nothing to downgrade. Requiring the upgrade
        // pins that shut (the decision sits in smtp-connection/index.js:1506). Opt out only for
        // a host that genuinely cannot do STARTTLS, and then know that the session is plaintext.
        //
        // Deliberately asymmetric to `resolveSmtpSecure` below: there an unrecognised value
        // decides nothing and the port does, because either answer is defensible. Here one
        // answer is safe and the other is not, so everything but the exact 'false' keeps the
        // protection — a typo must not switch it off.
        requireTLS: process.env.SMTP_REQUIRE_TLS !== 'false',
        // Port-derived, with SMTP_SECURE as an override. The rule lives in the framework
        // (`resolveSmtpSecure`, exported since 11.39.0) so project and framework cannot drift:
        // only the literal 'true'/'false' override, everything else follows the port. This was
        // a local copy until 11.39.0 shipped the export — see migration guide §6.
        secure: resolveSmtpSecure(process.env.SMTP_SECURE, smtpPort),
      },
    },
    env: envName,
    errorCode: PROJECT_ERROR_CODE,
    // No `execAfterInit` here: the spectaql docs (`pnpm run docs:bootstrap`, localConfig) need pnpm, scripts/ and
    // a registry download, none of which the production image has — it logged "pnpm: not found" on every start.
    file: PROJECT_FILE,
    filter: { maxLimit: null },
    // #region graphql
    // Disable the GraphQL IDE (GraphiQL) in production for security; keep it in develop/test for tooling
    graphQl: { driver: { graphiql: envName !== 'production', introspection: true }, maxComplexity: 1000 },
    // #endregion graphql
    healthCheck: PROJECT_HEALTH_CHECK,
    ignoreSelectionsForPopulate: true,
    // Logs the stack of every HttpException at `debug`, so on deployed stages only with NEST_LOG_LEVEL=debug
    // (resolveLogLevels() below). Errors that are no HttpException still reach the log at `error`, with stack.
    logExceptions: true,
    // mongoose.uri comes from NSC__MONGOOSE__URI (no fallback in deployed envs; not needed on PostgreSQL)
    permissions: true,
    port: Number(process.env.PORT) || 3000,
    sha256: true,
    staticAssets: PROJECT_STATIC_ASSETS,
    // swagger: deliberately unset. Since nest-server 12.7.0 setupSwagger() mounts nothing in a deployed env
    // (/swagger and /api-docs-json answer 404): the document lists every route, the roles it needs and every input
    // shape. local, ci and e2e keep it. A stage that needs it, e.g. for a client generator reading /api-docs-json
    // there, sets NSC__SWAGGER=true (.env.example).
    // systemSetup: deliberately unset. Since nest-server 12.4.0 the setup page's anonymous
    // `POST /system-setup/init` is CLOSED in every deployed env (403 LTNS_0053): on a fresh instance,
    // whoever called it first became the administrator. local, ci and e2e keep it open. A deployed stage
    // gets its first admin from NSC__SYSTEM_SETUP__INITIAL_ADMIN__EMAIL / __PASSWORD (created at boot
    // while no user exists), or opens the page behind NSC__SYSTEM_SETUP__HTTP_INIT__TOKEN, which the
    // frontend sends as X-System-Setup-Token. Both are documented in .env.example.
    templates: PROJECT_TEMPLATES,
    tus: PROJECT_TUS,
    // Express `trust proxy`, passed through by CoreModule (nest-server 11.33.0+).
    // Deliberately UNSET here, because the correct value is the number of proxies
    // that actually sit in front of THIS deployment and no template can know it.
    //
    // Set it as soon as ANYTHING in the deployment keys on `request.ip` behind a reverse proxy
    // (Caddy, nginx, a Kubernetes ingress, a cloud LB) — without this it resolves to the PROXY
    // for every request, so every client shares one bucket and the limit throttles all of them
    // at once. That covers the framework limiters `auth.rateLimit` / `betterAuth.rateLimit`, and
    // equally a limiter the project writes itself in one of its own controllers.
    //
    // The boot warning only covers the first kind: it fires when a FRAMEWORK limiter is on and
    // the value is unset, because that is all the framework can see. A project whose only
    // limiter is its own gets no warning at all — so adding one is a reason to come back here.
    // Observed in a consumer project (DEV-3411): a hand-written limiter on a public endpoint
    // counted five wrong access codes per minute, keyed on `request.ip`, and behind Traefik all
    // customers of one document therefore shared a single budget. Five wrong guesses by anybody
    // locked out the real customer, and a stranger who only knew the link could keep them out
    // indefinitely without ever having the code. The only hint was a runtime warning from
    // `express-rate-limit` itself, in the container log.
    //   trustProxy: 1,      // exactly one reverse proxy in front of the app
    //   trustProxy: 2,      // a reverse proxy behind a CDN
    //   trustProxy: false,  // nothing proxies us — states it explicitly, silences the warning
    // NEVER `true` on a public deployment: it trusts whatever the client sent.
    //
    // Graceful-shutdown delay in ms (nest-server 11.33.0+), default 0 = off.
    // `installGracefulShutdown()` in main.ts waits this long IN THE SIGTERM/SIGINT
    // HANDLER, before close() is entered, so a load balancer can finish
    // deregistering while requests still land on a fully healthy instance. A Nest
    // lifecycle hook cannot do this — every one of them already runs inside close().
    //
    // Left unset because the right value depends on the orchestrator: keep it well
    // below the grace period AND leave room for the drain that follows (Compose
    // `stop_grace_period` 10s, Kubernetes `terminationGracePeriodSeconds` 30s,
    // installProcessDiagnostics() force-exits after 30s). Exceed any of them and the
    // process is SIGKILLed mid-wait with no hook running. >10000 warns, >60000 caps.
    //   shutdownDelayMs: 5000,
    //
    // A load balancer that polls readiness drains the replica during that delay (nest-server
    // 12.11.0+): `healthCheck: { ...PROJECT_HEALTH_CHECK, readiness: true }` mounts
    // GET /health-check/ready, which answers 503 `shutting_down` from the first SIGTERM on and 503
    // while the database or build check fails. GET /health-check (the Dockerfile's HEALTHCHECK) stays
    // as it is. From the environment: NSC__HEALTH_CHECK__READINESS=true.
    //
    // Storage note: `file.storage` and `s3` are deliberately NOT set here. Unset,
    // the driver derives to GridFS (a database is configured, no `s3` block is) —
    // which is what this starter runs on. On PostgreSQL it derives to `filesystem`
    // instead (`uploads/files`, pod-local: mount it as a volume or configure `s3`
    // before running more than one replica). Configuring `s3.bucket` alone would make
    // S3 the derived driver and MOVE the bytes; `FileService` already forwards
    // `configService` + `s3Service` to `super()`, so that works instead of failing
    // the boot. See `.env.example` → "File storage" for the operator-facing knobs.
    //
    // Redis (`redis`) is likewise unset: absent means every feature keeps its
    // process-local behaviour, which is correct for a single replica. See
    // `.env.example` → "Central Redis" before scaling past one.
    //
    // Feeds the health check's build identity (`/health-check` → build.version),
    // kept in sync with the `version` GET /meta reports (both read meta.json).
    version: metaData.version,
  };

  return options?.config ? merge({}, base, options.config) : base;
}

// =============================================================================
// Local-env baseline — `local`, `e2e`, `ci`
// -----------------------------------------------------------------------------
// Hardcoded fallbacks so the project runs without a `.env`. Public dummy
// secrets only — NEVER reuse in deployed environments.
// Override anything via `options.config` per env or via `NSC__*` env vars.
// =============================================================================
function localConfig(
  envName: string,
  options: {
    brandSuffix: string;
    config?: Partial<IServerOptions>;
    dbName: string;
  },
): Partial<IServerOptions> {
  const brand = `Nest Server Starter ${options.brandSuffix}`;
  const upper = envName.toUpperCase();
  // PostgreSQL (PROJECT_SQL_ENGINE or NSC__DATABASE__*) instead of the `mongoose` block below, never both
  const database = localDatabase(options.dbName);

  const base: Partial<IServerOptions> = {
    appUrl: process.env.APP_URL,
    automaticObjectIdFiltering: true,
    // Filter BASE_URL against '/' because Vite/Vitest auto-inject process.env.BASE_URL='/' (asset base path default).
    baseUrl: process.env.BASE_URL && process.env.BASE_URL !== '/' ? process.env.BASE_URL : undefined,
    // Public dummy secret — sufficient for local/test, NEVER in deployments.
    // crossSubDomainCookies enabled when BASE_URL is set (e.g. https://api.<slug>.localhost
    // from `lt dev up`). Better Auth derives the cookie domain from appUrl/baseUrl
    // automatically, so cookies are shared across `*.<slug>.localhost`.
    betterAuth: {
      ...(process.env.BASE_URL && process.env.BASE_URL !== '/' ? { crossSubDomainCookies: true } : {}),
      secret: `BETTER_AUTH_SECRET_${upper}_LOCAL_32_CHARS`,
      twoFactor: { appName: brand },
    },
    bodyParser: PROJECT_BODY_PARSER,
    compression: true,
    cors: { allowAll: true },
    ...(database ? { database } : {}),
    email: {
      defaultSender: { email: 'noreply@test.local', name: brand },
      // The page nuxt-base-starter ships (`app/pages/auth/reset-password.vue`) reads the token from
      // `?token=`, so the link must carry it that way. `{token}` is substituted, and the leading
      // slash resolves against `appUrl` — which keeps this one line correct in every environment
      // instead of needing a full URL per deployment.
      //
      // Set explicitly rather than left to the framework default: that default appends the token as
      // a PATH segment, which suits a project whose page is `reset-password/[token].vue`. Both
      // conventions are supported; what breaks is a link built for one and a page written for the
      // other, and then only for whoever clicks it.
      passwordResetLink: '/auth/reset-password?token={token}',
      smtp: {
        auth: { pass: '', user: '' },
        host: process.env.SMTP_HOST || 'mailhog.lenne.tech',
        // No SMTP host configured? → write mails as JSON to stdout (safe for tests)
        jsonTransport: !process.env.SMTP_HOST || undefined,
        port: parseInt(process.env.SMTP_PORT || '1025', 10),
        secure: false,
      },
    },
    env: envName,
    errorCode: PROJECT_ERROR_CODE,
    // #region graphql
    execAfterInit: 'pnpm run docs:bootstrap',
    // #endregion graphql
    file: PROJECT_FILE,
    filter: { maxLimit: null },
    // #region graphql
    graphQl: { driver: { graphiql: true, introspection: true }, maxComplexity: 1000 },
    // #endregion graphql
    healthCheck: PROJECT_HEALTH_CHECK,
    // hostname unset → framework default 0.0.0.0; override via BIND_ADDRESS for parallel projects on same port
    hostname: process.env.BIND_ADDRESS,
    ignoreSelectionsForPopulate: true,
    logExceptions: true,
    // Left out on PostgreSQL: a configured `mongoose` would connect a MongoDB beside it (source `mongoose`)
    ...(database ? {} : { mongoose: localMongoose(options.dbName) }),
    port: Number(process.env.PORT) || 3000,
    sha256: true,
    staticAssets: PROJECT_STATIC_ASSETS,
    templates: PROJECT_TEMPLATES,
    tus: PROJECT_TUS,
  };

  return options.config ? merge({}, base, options.config) : base;
}

/** The MongoDB of the local envs (the default database) */
function localMongoose(dbName: string): IServerOptions['mongoose'] {
  return {
    // Fail fast when Mongo is not there. The driver's default is 30 s per
    // operation, which is the right call for a deployed service riding out a
    // replica-set election — and the wrong one everywhere localConfig applies
    // (local, e2e, ci), where "no Mongo" means it is simply not running.
    //
    // At 30 s the symptom is indistinguishable from a hang: every test burns
    // its own timeout waiting, a CI suite spends its whole budget proving the
    // same fault, and the log blames whatever test happened to run first. At
    // 5 s it is an error message. Deployed environments keep the default —
    // deployedConfig does not go through here.
    //
    // Override per environment via NSC__MONGOOSE__OPTIONS__SERVER_SELECTION_TIMEOUT_MS.
    options: { serverSelectionTimeoutMS: 5000 },
    uri: process.env.NSC__MONGOOSE__URI || `mongodb://127.0.0.1/${dbName}`,
  };
}

// =============================================================================
// Environment matrix
// -----------------------------------------------------------------------------
// Edit per-env behavior here. For shared changes, edit the helpers above.
// =============================================================================
export const config: { [env: string]: Partial<IServerOptions> } = {
  // ===========================================================================
  // Local-only environments — pipeline: local → e2e → ci
  // Run without `.env`, public dummy secrets only.
  // ===========================================================================

  // ---------------------------------------------------------------------------
  // Local — developer machine, role-permissions disabled for convenience
  // ---------------------------------------------------------------------------
  local: localConfig('local', {
    brandSuffix: 'Local',
    config: { cronJobs: DEMO_CRON_JOBS, permissions: { role: false } },
    dbName: 'nest-server-starter-local',
  }),

  // ---------------------------------------------------------------------------
  // E2E — local-style, no cron jobs (next stage after local)
  // ---------------------------------------------------------------------------
  e2e: localConfig('e2e', {
    brandSuffix: 'E2E',
    config: { cronJobs: {} },
    dbName: 'nest-server-starter-e2e',
  }),

  // ---------------------------------------------------------------------------
  // CI — localhost Mongo (like local/e2e); demo cron job.
  // In container CI (Gitlab/GitHub runners), override via NSC__MONGOOSE__URI.
  // ---------------------------------------------------------------------------
  ci: localConfig('ci', {
    brandSuffix: 'CI',
    config: { cronJobs: DEMO_CRON_JOBS },
    dbName: 'nest-server-starter-ci',
  }),

  // ===========================================================================
  // Deployed environments — pipeline: develop → test → production, plus preview
  // All of them share the same baseline (deployedConfig) so misconfig surfaces
  // in develop/test before reaching production.
  // ===========================================================================

  // ---------------------------------------------------------------------------
  // Develop — first deployed stage in the pipeline
  // ---------------------------------------------------------------------------
  develop: deployedConfig('develop', { brandSuffix: 'Develop' }),

  // ---------------------------------------------------------------------------
  // Test — staging stage (between develop and production)
  // ---------------------------------------------------------------------------
  test: deployedConfig('test', { brandSuffix: 'Test' }),

  // ---------------------------------------------------------------------------
  // Production — final deployed stage, no overrides
  // ---------------------------------------------------------------------------
  production: deployedConfig('production'),

  // ---------------------------------------------------------------------------
  // Preview — deployed stage outside the pipeline (e.g. a demo or review instance), same baseline.
  // It is what `migrate:preview:up` migrates, a script the lt CLI writes into every project. Without
  // this block, NODE_ENV=preview is refused at startup (see below), as every NODE_ENV without one.
  // ---------------------------------------------------------------------------
  preview: deployedConfig('preview', { brandSuffix: 'Preview' }),
};

/**
 * Log levels of the Nest logger, applied at the bottom of this file while it loads.
 *
 * Every deployed env (develop, test, production, and any env that is not local) prints `log` and
 * above: no `debug`, no `verbose`. Those lines are loud, they cost log storage, and they carry more
 * request context than an operator needs. local, ci and e2e keep every level, as before.
 *
 * To change it for one deployment without a code change, set NestJS's own `NEST_LOG_LEVEL`: a level
 * (`debug` means that level and above), a list (`warn,error`) or a threshold (`>=warn`). While it is
 * set this returns `undefined`, and Nest's ConsoleLogger reads the variable itself. For an invalid
 * value Nest warns once and prints every level.
 */
const DEPLOYED_LOG_LEVELS: LogLevel[] = ['log', 'warn', 'error', 'fatal'];

export function resolveLogLevels(env: string | undefined): LogLevel[] | undefined {
  if (process.env.NEST_LOG_LEVEL?.replaceAll(' ', '')) {
    return undefined;
  }
  return isLocalEnv(env) ? undefined : [...DEPLOYED_LOG_LEVELS];
}

/**
 * Resolve and validate config.
 *
 * `getEnvironmentConfig` produces the full merge:
 *   env-specific config → loadLocalConfig → NEST_SERVER_CONFIG → NSC__* env vars
 *
 * After that, for deployed envs (`develop`, `test`, `production`, and every
 * other env that is not local) we enforce that every required secret/URL
 * listed in `REQUIRED_DEPLOYED_ENV_VARS` is present. Without this guard, the
 * framework's own `merge` would silently
 * fill in defaults (e.g. `mongodb://localhost/nest-server-default` for
 * `mongoose.uri`), which would allow a misconfigured deployment to boot
 * against the wrong database or with random per-restart session secrets —
 * the exact silent-fail mode we want to avoid.
 *
 * A NODE_ENV that has no block in `config` is refused before that. Up to nest-server 12.6.x,
 * getEnvironmentConfig() answered it with the LOCAL block (`config[env] || config.local`): public dummy
 * secrets, the anonymous setup page, GET /config. The required-var check below cannot catch that: it keys
 * on the resolved env, and the local block carries `env: 'local'`. Forced to run, it would still accept
 * the local dummy secret and Mongo URI in place of missing ones. So a stage started with NODE_ENV=staging
 * or =development booted on the local block, whether its NSC__* vars were set or not. An EMPTY NODE_ENV
 * (also only spaces) is refused as well: getEnvironmentConfig() read `NODE_ENV || 'local'`, so it landed
 * on the local block too. Typical source: `NODE_ENV=${NODE_ENV}` in a compose file on a host that does
 * not set the variable. Only an unset NODE_ENV still means `local`.
 *
 * Since nest-server 12.7.0 getEnvironmentConfig() refuses both cases itself. This check stays: it runs
 * first and names this file. Keep its two messages as they are: the nest-server migration guide
 * (12.6.x → 12.7.x, §1) tells projects to search for exactly them to find out whether they have it.
 */
const requestedEnv = process.env.NODE_ENV;
const knownEnvs = Object.keys(config).join(', ');
if (requestedEnv !== undefined && !requestedEnv.trim()) {
  throw new Error(
    `NODE_ENV is set but empty (${JSON.stringify(requestedEnv)}). Set one of ${knownEnvs}, ` +
      'or leave NODE_ENV unset to run locally.',
  );
}
if (requestedEnv && !Object.hasOwn(config, requestedEnv)) {
  throw new Error(
    `NODE_ENV='${requestedEnv}' has no block in src/config.env.ts (known: ${knownEnvs}). ` +
      'Use one of them, or add a block for this env to the matrix.',
  );
}

const resolved = getEnvironmentConfig({ config });

// A local env on PostgreSQL connects no MongoDB, also when the shell exports NSC__MONGOOSE__URI (`lt dev up` does for
// every project): getEnvironmentConfig() merges it into every env, and nest-server would then open a MongoDB beside the
// PostgreSQL, or wait minutes at boot for one that is not running. It stays only where `database.models` routes a model
// to the source `mongoose`. The deployed envs keep it: there NSC__MONGOOSE__URI is the documented opt-in.
if (isLocalEnv(resolved.env) && hasSqlDatabase(resolved) && !routesModelsToMongoose(resolved)) {
  delete resolved.mongoose;
}

// Every env that is not local: develop, test, production, and a block a project adds (e.g. `staging`).
if (!isLocalEnv(resolved.env)) {
  const missing = REQUIRED_DEPLOYED_ENV_VARS.filter(({ condition }) => !condition || condition(resolved))
    .filter(({ check }) => !check(resolved))
    .map(({ envVar }) => envVar);

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables for NODE_ENV='${resolved.env}': ${missing.join(', ')}. ` +
        'See .env.example for the full list.',
    );
  }
}

// Applied here, while the config loads, and not as the `logger` option of NestFactory.create in main.ts:
// server.module.ts imports this file and then runs CoreModule.forRoot(), whose modules already log
// (e.g. "RolesGuard registered globally"). That happens before main.ts creates the app, so an option
// there comes too late for those lines.
const logLevels = resolveLogLevels(resolved.env);
if (logLevels) {
  Logger.overrideLogger(logLevels);
}

export default resolved;
