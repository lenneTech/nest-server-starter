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
