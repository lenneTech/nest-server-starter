import { getEnvironmentConfig, IServerOptions, merge } from '@lenne.tech/nest-server';
import { CronExpression } from '@nestjs/schedule';
import * as dotenv from 'dotenv';
import { join } from 'path';

import { ProjectErrors } from './server/common/errors/project-errors';

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
 * - `develop`, `test`, `production`: set `NSC__BASE_URL`; `appUrl` is auto-derived
 *   (e.g. `https://api.example.com` → `https://example.com`).
 */
dotenv.config();

// =============================================================================
// Project-wide constants (paths, errors, demo cron jobs)
// =============================================================================
const PROJECT_STATIC_ASSETS = { options: { prefix: '' }, path: join(__dirname, '..', 'public') };
const PROJECT_TEMPLATES = { engine: 'ejs', path: join(__dirname, 'assets', 'templates') };
const PROJECT_ERROR_CODE = { additionalErrorRegistry: ProjectErrors };
const PROJECT_HEALTH_CHECK = { configs: { database: { enabled: true } }, enabled: true };

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

const REQUIRED_DEPLOYED_ENV_VARS: RequiredEnvVar[] = [
  { check: (c) => !!c.baseUrl, envVar: 'NSC__BASE_URL' },
  { check: (c) => !!c.mongoose?.uri, envVar: 'NSC__MONGOOSE__URI' },
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
  // Legacy Auth secrets — only required when legacy endpoints are enabled
  {
    check: (c) => !!c.jwt?.secret,
    condition: (c) => c.auth?.legacyEndpoints?.enabled !== false,
    envVar: 'NSC__JWT__SECRET',
  },
  {
    check: (c) => !!c.jwt?.refresh?.secret,
    condition: (c) => c.auth?.legacyEndpoints?.enabled !== false,
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
//   LEGACY_AUTH_ENABLED   "false" → disables legacy /auth endpoints
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

  const base: Partial<IServerOptions> = {
    auth: { legacyEndpoints: { enabled: process.env.LEGACY_AUTH_ENABLED !== 'false' } },
    automaticObjectIdFiltering: true,
    // betterAuth.secret comes from NSC__BETTER_AUTH__SECRET
    betterAuth: {
      twoFactor: { appName: process.env.TWO_FACTOR_APP_NAME || brand },
    },
    // Brevo overlay — only active when BREVO_API_KEY is set
    ...(process.env.BREVO_API_KEY
      ? {
          brevo: {
            apiKey: process.env.BREVO_API_KEY,
            sender: {
              email: process.env.EMAIL_DEFAULT_SENDER || 'noreply@example.com',
              name: process.env.EMAIL_DEFAULT_SENDER_NAME || brand,
            },
          },
        }
      : {}),
    compression: true,
    // CORS propagated to GraphQL/REST/BetterAuth via shared buildCorsConfig
    cors: { allowedOrigins: process.env.CORS_ALLOWED_ORIGINS?.split(',').filter(Boolean) },
    email: {
      // defaultSender.email comes from NSC__EMAIL__DEFAULT_SENDER__EMAIL
      defaultSender: { name: brand },
      smtp: {
        // host + auth.user + auth.pass come from NSC__EMAIL__SMTP__HOST etc.
        port: parseInt(process.env.SMTP_PORT || '587', 10),
        secure: process.env.SMTP_SECURE !== 'false',
      },
    },
    env: envName,
    errorCode: PROJECT_ERROR_CODE,
    // #region graphql
    // docs:bootstrap generates the spectaql GraphQL schema docs — only
    // meaningful when GraphQL is enabled.
    execAfterInit: 'pnpm run docs:bootstrap',
    // #endregion graphql
    filter: { maxLimit: null },
    // #region graphql
    // Disable GraphQL playground in production for security; keep it in develop/test for tooling
    graphQl: { driver: { introspection: true, playground: envName !== 'production' }, maxComplexity: 1000 },
    // #endregion graphql
    healthCheck: PROJECT_HEALTH_CHECK,
    ignoreSelectionsForPopulate: true,
    // jwt.secret + jwt.refresh.secret come from NSC__JWT__SECRET / NSC__JWT__REFRESH__SECRET
    jwt: {
      refresh: { renewal: true, signInOptions: { expiresIn: '7d' } },
      sameTokenIdPeriod: 2000,
      signInOptions: { expiresIn: '15m' },
    },
    logExceptions: true,
    // mongoose.uri comes from NSC__MONGOOSE__URI (no fallback in deployed envs)
    permissions: true,
    port: 3000,
    sha256: true,
    staticAssets: PROJECT_STATIC_ASSETS,
    templates: PROJECT_TEMPLATES,
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

  const base: Partial<IServerOptions> = {
    automaticObjectIdFiltering: true,
    // Public dummy secret — sufficient for local/test, NEVER in deployments
    betterAuth: {
      secret: `BETTER_AUTH_SECRET_${upper}_LOCAL_32_CHARS`,
      twoFactor: { appName: brand },
    },
    compression: true,
    cors: { allowAll: true },
    email: {
      defaultSender: { email: 'noreply@test.local', name: brand },
      smtp: {
        auth: { pass: '', user: '' },
        host: 'mailhog.lenne.tech',
        // No SMTP host configured? → write mails as JSON to stdout (safe for tests)
        jsonTransport: !process.env.SMTP_HOST || undefined,
        port: 1025,
        secure: false,
      },
    },
    env: envName,
    errorCode: PROJECT_ERROR_CODE,
    // #region graphql
    execAfterInit: 'pnpm run docs:bootstrap',
    // #endregion graphql
    filter: { maxLimit: null },
    // #region graphql
    graphQl: { driver: { introspection: true, playground: true }, maxComplexity: 1000 },
    // #endregion graphql
    healthCheck: PROJECT_HEALTH_CHECK,
    // hostname unset → framework default 0.0.0.0 (works on host AND inside containers)
    ignoreSelectionsForPopulate: true,
    // Public dummy JWT secrets — sufficient for local/test, NEVER in deployments
    jwt: {
      refresh: {
        renewal: true,
        secret: `SECRET_OR_PRIVATE_KEY_${upper}_REFRESH_32CH`,
        signInOptions: { expiresIn: '7d' },
      },
      sameTokenIdPeriod: 2000,
      secret: `SECRET_OR_PRIVATE_KEY_${upper}_MIN_32_CHARS`,
      signInOptions: { expiresIn: '15m' },
    },
    logExceptions: true,
    mongoose: { uri: `mongodb://127.0.0.1/${options.dbName}` },
    port: 3000,
    sha256: true,
    staticAssets: PROJECT_STATIC_ASSETS,
    templates: PROJECT_TEMPLATES,
  };

  return options.config ? merge({}, base, options.config) : base;
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
  // Deployed environments — pipeline: develop → test → production
  // All three share the same baseline (deployedConfig) so misconfig surfaces
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
};

/**
 * Resolve and validate config.
 *
 * `getEnvironmentConfig` produces the full merge:
 *   env-specific config → loadLocalConfig → NEST_SERVER_CONFIG → NSC__* env vars
 *
 * After that, for deployed envs (`develop`, `test`, `production`) we enforce
 * that every required secret/URL listed in `REQUIRED_DEPLOYED_ENV_VARS` is
 * present. Without this guard, the framework's own `merge` would silently
 * fill in defaults (e.g. `mongodb://localhost/nest-server-default` for
 * `mongoose.uri`), which would allow a misconfigured deployment to boot
 * against the wrong database or with random per-restart session secrets —
 * the exact silent-fail mode we want to avoid.
 */
const resolved = getEnvironmentConfig({ config });

const DEPLOYED_ENVS = new Set(['develop', 'test', 'production']);
if (DEPLOYED_ENVS.has(resolved.env)) {
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

export default resolved;
