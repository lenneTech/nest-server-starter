/**
 * Static config check: when BASE_URL is set (the case under `lt dev up`),
 * the `local`/`e2e`/`ci` baseline must enable `crossSubDomainCookies` so
 * Better Auth shares cookies between `https://api.<slug>.localhost` and
 * `https://<slug>.localhost`. Without this, sessions created by API
 * sign-in are not seen by the App in the same browser.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('config.env.ts — cross-subdomain cookies', () => {
  const ORIG_BASE_URL = process.env.BASE_URL;
  const ORIG_NODE_ENV = process.env.NODE_ENV;

  beforeEach(() => {
    delete process.env.BASE_URL;
    delete process.env.APP_URL;
    process.env.NODE_ENV = 'local';
    vi.resetModules();
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
