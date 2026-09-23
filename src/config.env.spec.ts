/**
 * Static config check: when BASE_URL is set (the case under `lt dev up`),
 * the `local`/`e2e`/`ci` baseline must enable `crossSubDomainCookies` so
 * Better Auth shares cookies between `https://api.<slug>.localhost` and
 * `https://<slug>.localhost`. Without this, sessions created by API
 * sign-in are not seen by the App in the same browser.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('config.env.ts — cross-subdomain cookies', () => {
  const ORIG_BASE_URL = process.env.BASE_URL;
  const ORIG_NODE_ENV = process.env.NODE_ENV;

  beforeEach(() => {
    delete process.env.BASE_URL;
    delete process.env.APP_URL;
    process.env.NODE_ENV = 'local';
    vi.resetModules();
    // `getEnvironmentConfig()` runs at module scope in config.env.ts and prints three
    // `console.info` lines ("Configured for: …", "NEST_SERVER_CONFIG used from .env",
    // "Environment object … integrated"). With `vi.resetModules()` + a re-import per test that
    // is 38 x 3 = 114 writes from THIS FILE ALONE — every other spec in the suite emits zero.
    //
    // Two reasons to silence them here rather than anywhere else:
    //
    // 1. Noise. 114 lines in every green run is output nobody reads, which is how a line that
    //    matters gets skipped.
    // 2. Every one of them is forwarded to the main thread as an `onUserConsoleLog` RPC, and at
    //    worker teardown vitest REJECTS whatever is still in flight instead of awaiting it —
    //    `EnvironmentTeardownError: Closing rpc while "onUserConsoleLog" was pending`, which
    //    fails the whole run with every test green. See vitest-e2e.config.ts for the mechanism.
    //
    // Scoped to this file on purpose. `disableConsoleIntercept` would close the race for the
    // suite but surface all 114 lines; a global console mock in a setup file would blind every
    // other spec's diagnostics. This removes the writes at their source: 114 -> 0, and no other
    // test loses anything.
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
  });

  afterEach(() => {
    if (ORIG_BASE_URL) process.env.BASE_URL = ORIG_BASE_URL;
    else delete process.env.BASE_URL;
    if (ORIG_NODE_ENV) process.env.NODE_ENV = ORIG_NODE_ENV;
  });

  it('does NOT enable crossSubDomainCookies without BASE_URL (classic localhost dev)', async () => {
    const { config } = await import('./config.env');
    const ba: any = config.local?.betterAuth;
    expect(ba?.crossSubDomainCookies).toBeUndefined();
  });

  it('enables crossSubDomainCookies when BASE_URL is set (lt dev mode)', async () => {
    process.env.BASE_URL = 'https://api.crm.localhost';
    const { config } = await import('./config.env');
    const ba: any = config.local?.betterAuth;
    expect(ba?.crossSubDomainCookies).toBe(true);
  });

  it('does NOT enable crossSubDomainCookies when BASE_URL is the Vite asset path "/"', async () => {
    process.env.BASE_URL = '/';
    const { config } = await import('./config.env');
    const ba: any = config.local?.betterAuth;
    expect(ba?.crossSubDomainCookies).toBeUndefined();
  });
});

/**
 * SMTP transport security — port/TLS pairing
 *
 * `secure: true` means "open the connection with TLS immediately", which is what
 * port 465 does. Port 587 opens in plaintext and upgrades via STARTTLS, so pairing
 * it with `secure: true` makes nodemailer send a TLS ClientHello at a server that
 * answers with an SMTP greeting — OpenSSL reports `wrong version number` and every
 * send fails.
 *
 * The old default paired exactly those two, so any deployment that did not set
 * SMTP_SECURE=false had a mail transport that could not connect. It stayed
 * invisible because auth mail is sent fire-and-forget: the API answers 200 and the
 * failure only reaches the log. Found in a project whose whole password-reset flow
 * was dead for this reason — which is why the wiring is asserted here rather than
 * left to review.
 *
 * These read the RESOLVED config instead of re-implementing `resolveSmtpSecure()`.
 * A copy of the logic would keep passing after the wiring changes or the helper is
 * bypassed, which is exactly the failure this guards against.
 */
describe('config.env.ts — SMTP transport security', () => {
  const ORIGINAL_PORT = process.env.SMTP_PORT;
  const ORIGINAL_SECURE = process.env.SMTP_SECURE;
  const ORIGINAL_REQUIRE_TLS = process.env.SMTP_REQUIRE_TLS;

  async function loadSmtp(env: { SMTP_PORT?: string; SMTP_REQUIRE_TLS?: string; SMTP_SECURE?: string }) {
    vi.resetModules();
    delete process.env.SMTP_PORT;
    delete process.env.SMTP_SECURE;
    delete process.env.SMTP_REQUIRE_TLS;
    if (env.SMTP_PORT !== undefined) process.env.SMTP_PORT = env.SMTP_PORT;
    if (env.SMTP_SECURE !== undefined) process.env.SMTP_SECURE = env.SMTP_SECURE;
    if (env.SMTP_REQUIRE_TLS !== undefined) process.env.SMTP_REQUIRE_TLS = env.SMTP_REQUIRE_TLS;
    process.env.NODE_ENV = 'local';
    const { config } = await import('./config.env');
    return (config.production as any)?.email?.smtp as
      | { port?: number; requireTLS?: boolean; secure?: boolean }
      | undefined;
  }

  afterEach(() => {
    if (ORIGINAL_PORT === undefined) delete process.env.SMTP_PORT;
    else process.env.SMTP_PORT = ORIGINAL_PORT;
    if (ORIGINAL_SECURE === undefined) delete process.env.SMTP_SECURE;
    else process.env.SMTP_SECURE = ORIGINAL_SECURE;
    if (ORIGINAL_REQUIRE_TLS === undefined) delete process.env.SMTP_REQUIRE_TLS;
    else process.env.SMTP_REQUIRE_TLS = ORIGINAL_REQUIRE_TLS;
    vi.resetModules();
  });

  it('does not use implicit TLS on the default port', async () => {
    // The exact defect: neither variable set, port falls back to 587.
    const smtp = await loadSmtp({});
    expect(smtp?.port).toBe(587);
    expect(smtp?.secure).toBe(false);
  });

  it('uses implicit TLS on port 465', async () => {
    expect((await loadSmtp({ SMTP_PORT: '465' }))?.secure).toBe(true);
  });

  it('lets SMTP_SECURE override the port-derived default in both directions', async () => {
    // An override that cannot override is not one — a host may serve implicit TLS
    // on a non-standard port. The broken pairing therefore stays REACHABLE, but only
    // through an explicit contradiction; it can no longer arrive from the default.
    expect((await loadSmtp({ SMTP_PORT: '587', SMTP_SECURE: 'true' }))?.secure).toBe(true);
    expect((await loadSmtp({ SMTP_PORT: '465', SMTP_SECURE: 'false' }))?.secure).toBe(false);
  });

  it('accepts the canonical spellings case- and whitespace-insensitively', async () => {
    expect((await loadSmtp({ SMTP_PORT: '587', SMTP_SECURE: 'TRUE' }))?.secure).toBe(true);
    expect((await loadSmtp({ SMTP_PORT: '587', SMTP_SECURE: ' true ' }))?.secure).toBe(true);
    expect((await loadSmtp({ SMTP_PORT: '465', SMTP_SECURE: 'FALSE' }))?.secure).toBe(false);
  });

  it('forces STARTTLS instead of leaving the upgrade to the server', async () => {
    // `secure: false` alone is OPPORTUNISTIC: nodemailer upgrades only when the server
    // advertises STARTTLS in its EHLO reply (smtp-connection:1506). Strip that line in
    // transit and the session stays plaintext — SMTP credentials and any auth link
    // included — while nothing fails.
    expect((await loadSmtp({}))?.requireTLS).toBe(true);
    expect((await loadSmtp({ SMTP_PORT: '465' }))?.requireTLS).toBe(true);
  });

  it('only disables STARTTLS enforcement on an explicit "false"', async () => {
    // Asymmetric to `secure` on purpose: there either answer is defensible, here one
    // is safe and the other is not, so a typo must keep the protection.
    expect((await loadSmtp({ SMTP_REQUIRE_TLS: 'false' }))?.requireTLS).toBe(false);
    for (const value of ['fasle', 'no', '0', 'true', '']) {
      expect((await loadSmtp({ SMTP_REQUIRE_TLS: value }))?.requireTLS).toBe(true);
    }
  });

  it('never produces an impossible pairing except from an explicit contradiction', async () => {
    // The property that matters, over the whole input space rather than a few
    // examples: implicit TLS on 587 and plaintext on 465 are unreachable unless
    // someone writes 'true'/'false' out. Honouring `1`/`yes` would break exactly
    // that on 587 while changing nothing on 465.
    for (const value of [undefined, '', '1', 'yes', 'on', '0', 'no', 'off', 'ja', '2']) {
      expect((await loadSmtp({ SMTP_PORT: '587', SMTP_SECURE: value }))?.secure).toBe(false);
      expect((await loadSmtp({ SMTP_PORT: '465', SMTP_SECURE: value }))?.secure).toBe(true);
    }
  });
});

/**
 * The fail-fast contract for deployed envs (`develop` → `test` → `production`): a missing required
 * `NSC__*` var must stop the server at startup, naming every missing var; local envs must run
 * without any of them. See `REQUIRED_DEPLOYED_ENV_VARS` in config.env.ts.
 *
 * This replaces `scripts/check-envs.sh`, which booted a server per NODE_ENV to check the same thing
 * and could not pass anywhere: its start pattern kept the "startet" typo after main.ts was fixed,
 * and its Phase 2 fixture was git-ignored and never committed. Checked at import, the contract
 * runs in every `pnpm test`, in milliseconds, on every platform.
 *
 * The environment is fully controlled: every inherited `NSC__*` var is removed (`lt dev up` sets
 * `NSC__MONGOOSE__URI`, for one), and the config is imported from an empty working directory. Both
 * config.env.ts and nest-server's getEnvironmentConfig() call `dotenv.config()`, which reads `.env`
 * from the cwd — a developer's `.env` would otherwise fill in what the test left out. (Stubbing
 * `dotenv` was tried and does not work: the second call is a plain require() inside node_modules.)
 */
describe('config.env.ts — fail-fast for deployed envs', () => {
  const ORIGINAL_ENV = { ...process.env };
  const ORIGINAL_CWD = process.cwd();
  let emptyDir = '';

  /** A value for every unconditional requirement — public dummies, never real secrets. */
  const COMPLETE: Record<string, string> = {
    NSC__BASE_URL: 'https://api.example.test',
    NSC__BETTER_AUTH__SECRET: 'contract-test-secret-contract-test-secret',
    NSC__EMAIL__DEFAULT_SENDER__EMAIL: 'noreply@example.test',
    NSC__EMAIL__SMTP__AUTH__PASS: 'contract-test-pass',
    NSC__EMAIL__SMTP__AUTH__USER: 'contract-test-user',
    NSC__EMAIL__SMTP__HOST: 'smtp.example.test',
    NSC__MONGOOSE__URI: 'mongodb://127.0.0.1/contract-test',
  };

  async function load(nodeEnv: string, vars: Record<string, string> = {}) {
    vi.resetModules();
    for (const key of Object.keys(process.env)) {
      if (key.startsWith('NSC__') || key === 'NEST_SERVER_CONFIG') delete process.env[key];
    }
    Object.assign(process.env, vars, { NODE_ENV: nodeEnv });
    process.chdir(emptyDir);
    try {
      return await import('./config.env');
    } finally {
      process.chdir(ORIGINAL_CWD);
    }
  }

  /** The env vars the guard enforces without an opt-in condition. */
  async function unconditional(): Promise<string[]> {
    const { REQUIRED_DEPLOYED_ENV_VARS } = await load('local');
    return REQUIRED_DEPLOYED_ENV_VARS.filter(({ condition }) => !condition).map(({ envVar }) => envVar);
  }

  beforeEach(() => {
    emptyDir = mkdtempSync(join(tmpdir(), 'config-env-contract-'));
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    rmSync(emptyDir, { force: true, recursive: true });
    vi.resetModules();
  });

  it('covers every unconditional requirement with a value above', async () => {
    expect(Object.keys(COMPLETE).sort()).toEqual((await unconditional()).sort());
  });

  it.each(['develop', 'test', 'production'])(
    '%s refuses to start without the vars, naming all of them',
    async (env) => {
      const required = await unconditional();
      const error = await load(env).then(
        () => undefined,
        (err: Error) => err,
      );

      expect(error?.message).toMatch(`Missing required environment variables for NODE_ENV='${env}'`);
      for (const envVar of required) {
        expect(error?.message, envVar).toContain(envVar);
      }
    },
  );

  it.each(['develop', 'test', 'production'])('%s starts once every required var is set', async (env) => {
    await expect(load(env, COMPLETE)).resolves.toBeDefined();
  });

  it('names exactly the one var that is missing', async () => {
    // Per var, so a requirement whose check reads the wrong config path cannot hide behind the others.
    for (const envVar of Object.keys(COMPLETE)) {
      const { [envVar]: _left, ...rest } = COMPLETE;
      const error = await load('production', rest).then(
        () => undefined,
        (err: Error) => err,
      );
      expect(error?.message, `without ${envVar}`).toMatch(new RegExp(`: ${envVar}\\. `));
    }
  });

  it.each(['local', 'e2e', 'ci'])('%s starts without any of them', async (env) => {
    await expect(load(env)).resolves.toBeDefined();
  });
});
