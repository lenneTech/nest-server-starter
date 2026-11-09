/**
 * Better-Auth's origin and CSRF check, switched ON (e2e).
 *
 * vitest sets `TEST=true`, and Better-Auth's `isTest()` then skips the origin check, and with it the
 * CSRF check it is still coupled to (better-auth 1.7: `skipOriginCheck` defaults to `isTest()` unless
 * `advanced.disableOriginCheck` is set). Every other e2e suite therefore runs without both. A frontend
 * that sends a broken `redirectTo` — the literal `undefined/auth/reset-password` a missing `siteUrl`
 * produces — passes there, while every deployed stage answers 403 and the reset mail never goes out.
 *
 * This suite runs the starter's real configuration with the check on and sends what nuxt-base-starter
 * sends: requests from the app origin, and absolute app URLs built by its `appUrl()` helper. nest-server
 * tests the mechanism itself; this file pins the starter's side of it: the app origin is trusted, the
 * URLs the app builds pass, and what an attacker or a misconfigured frontend sends does not.
 */
import {
  ConfigService,
  CoreBetterAuthService,
  HttpExceptionLogFilter,
  resolveAppUrlFromConfig,
  TestHelper,
} from '@lenne.tech/nest-server';
import { Test, TestingModule } from '@nestjs/testing';
import { createHash } from 'crypto';
import { MongoClient } from 'mongodb';

import envConfig from '../src/config.env';

const FOREIGN_ORIGIN = 'https://evil.example';

/** The client hashes the password before it is sent when `sha256` is on, as the app does. */
function hashPassword(password: string): string {
  return envConfig.sha256 ? createHash('sha256').update(password).digest('hex') : password;
}

describe('IAM origin check switched on (e2e)', () => {
  let app;
  let testHelper: TestHelper;
  let connection;
  let db;
  let appOrigin: string;
  let sessionCookies: string;

  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const email = `origin-check-${suffix}@test.com`;
  const password = 'OriginCheck123!';

  beforeAll(async () => {
    // Switched on BEFORE the server module is loaded: `CoreModule.forRoot(envConfig)` runs when
    // server.module.js is imported, and each e2e file has its own module graph (isolate: true).
    const betterAuth = typeof envConfig.betterAuth === 'object' ? envConfig.betterAuth : {};
    const options = (betterAuth.options ?? {}) as Record<string, any>;
    envConfig.betterAuth = {
      ...betterAuth,
      options: { ...options, advanced: { ...options.advanced, disableOriginCheck: false } },
    };
    const { imports, ServerModule } = await import('../src/server/server.module');

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [...imports, ServerModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    app.useGlobalFilters(new HttpExceptionLogFilter());
    app.setBaseViewsDir(envConfig.templates.path);
    app.setViewEngine(envConfig.templates.engine);
    await app.init();
    testHelper = new TestHelper(app);

    connection = await MongoClient.connect(envConfig.mongoose.uri, {});
    db = connection.db();

    // Without this, every refusal below could come from somewhere else and every acceptance would
    // prove nothing: the switch has to have reached Better-Auth.
    const context: any = await (app.get(CoreBetterAuthService).getInstance() as any).$context;
    expect(context.skipOriginCheck).toBe(false);

    // The origin the app is served under, resolved the way nest-server resolves it at runtime
    // (`APP_URL`, else the localhost default of local / e2e / ci).
    const appUrl = resolveAppUrlFromConfig(app.get(ConfigService));
    expect(appUrl).toBeTruthy();
    appOrigin = new URL(appUrl as string).origin;
    expect(context.trustedOrigins).toContain(appOrigin);

    await testHelper.rest('/iam/sign-up/email', {
      method: 'POST',
      payload: { email, name: 'Origin Check', password: hashPassword(password), termsAndPrivacyAccepted: true },
      statusCode: 201,
    });
    // Sign-in requires a verified address; the verification mail is not what this suite is about.
    await db.collection('users').updateOne({ email }, { $set: { emailVerified: true, verified: true } });
  });

  afterAll(async () => {
    const user = await db?.collection('users').findOne({ email });
    if (user) {
      const ids: any[] = [user._id, user._id.toString(), user.iamId, user.id].filter(Boolean);
      await db.collection('account').deleteMany({ userId: { $in: ids } });
      await db.collection('session').deleteMany({ userId: { $in: ids } });
    }
    await db?.collection('users').deleteMany({ email });
    await connection?.close();
    await app?.close();
  });

  describe('sign-in', () => {
    it('signs in from the app origin', async () => {
      const res: any = await testHelper.rest('/iam/sign-in/email', {
        headers: { origin: appOrigin, 'sec-fetch-mode': 'cors', 'sec-fetch-site': 'same-site' },
        method: 'POST',
        payload: { email, password: hashPassword(password) },
        returnResponse: true,
        statusCode: 200,
      });
      expect(TestHelper.extractSessionToken(res)).toBeTruthy();
      // The cookies exactly as the browser would send them back: Better-Auth's own handler reads the
      // SIGNED session cookie, not the bare token.
      const setCookie = res.headers['set-cookie'];
      sessionCookies = (Array.isArray(setCookie) ? setCookie : [setCookie])
        .map((c: string) => c.split(';')[0])
        .join('; ');
    });

    it('refuses a sign-in from a foreign origin', async () => {
      await testHelper.rest('/iam/sign-in/email', {
        headers: { origin: FOREIGN_ORIGIN, 'sec-fetch-mode': 'cors', 'sec-fetch-site': 'cross-site' },
        method: 'POST',
        payload: { email, password: hashPassword(password) },
        statusCode: 403,
      });
    });
  });

  describe('password reset request (redirectTo)', () => {
    // An address without an account: Better-Auth answers it like a known one, and no mail is sent.
    const target = `origin-check-target-${suffix}@test.com`;
    const requestReset = (redirectTo: string, statusCode: number) =>
      testHelper.rest('/iam/request-password-reset', {
        headers: { origin: appOrigin },
        method: 'POST',
        payload: { email: target, redirectTo },
        returnResponse: true,
        statusCode,
      });

    it('accepts the absolute app URL nuxt-base-starter builds with appUrl()', async () => {
      await requestReset(`${appOrigin}/auth/reset-password`, 200);
    });

    it('refuses the "undefined/…" value a missing siteUrl produces', async () => {
      const res: any = await requestReset('undefined/auth/reset-password', 403);
      expect(JSON.stringify(res.body)).toContain('INVALID_REDIRECT_URL');
    });

    it('refuses a redirect to a foreign origin', async () => {
      const res: any = await requestReset(`${FOREIGN_ORIGIN}/auth/reset-password`, 403);
      expect(JSON.stringify(res.body)).toContain('INVALID_REDIRECT_URL');
    });
  });

  describe('a signed-in request that changes state', () => {
    // Revoking the OTHER sessions keeps the one the test uses, so the pair can run in either order.
    const revokeOthers = (origin: string, statusCode: number) =>
      testHelper.rest('/iam/revoke-other-sessions', {
        cookies: sessionCookies,
        headers: { origin },
        method: 'POST',
        payload: {},
        returnResponse: true,
        statusCode,
      });

    it('is accepted from the app origin', async () => {
      await revokeOthers(appOrigin, 200);
    });

    it('is refused from a foreign origin even with a valid session cookie', async () => {
      const res: any = await revokeOthers(FOREIGN_ORIGIN, 403);
      expect(JSON.stringify(res.body)).toContain('INVALID_ORIGIN');
    });
  });
});
