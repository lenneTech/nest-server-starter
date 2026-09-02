import { EmailService, HttpExceptionLogFilter, TestHelper } from '@lenne.tech/nest-server';
import { Test, TestingModule } from '@nestjs/testing';
import { createHash } from 'crypto';
import { MongoClient } from 'mongodb';

import envConfig from '../src/config.env';
import { imports, ServerModule } from '../src/server/server.module';

/**
 * Story: the password-reset mail this starter sends is one a person can actually use.
 *
 * WHY THIS FILE EXISTS
 *
 * The starter shipped `sendPasswordResetMail` with no test at all, and it accumulated four
 * independent defects that every generated project inherited:
 *
 *   1. THE TOKEN WAS NEVER IN THE LINK. It was read off the object `setPasswordResetTokenForEmail`
 *      returns, and the security interceptor strips `passwordResetToken` there — correctly, since a
 *      reset token in a response body is one in a log and a proxy cache. So the mail said
 *      `…/undefined`. Found in production, by the recipient.
 *   2. THE LINK POINTED AT A PAGE THAT DOES NOT EXIST. The base was `/auth/password-reset`; the
 *      page nuxt-base-starter ships is `/auth/reset-password`, and it reads the token from
 *      `?token=` rather than from a path segment. Both halves were wrong, so even a correct token
 *      landed nowhere.
 *   3. AN UNKNOWN ADDRESS CRASHED THE ENDPOINT. Since 11.38.0 the framework returns `null` there
 *      instead of throwing, and this code read `user.email` unguarded — a 500 for unknown and 201
 *      for known is the account oracle the framework change existed to close, reopened one layer up.
 *   4. THE SEND WAS AWAITED, so the response time told the two cases apart even once the status
 *      codes matched.
 *
 * Each is asserted separately below, because fixing any one of them leaves the others intact.
 */
function hashPassword(password: string): string {
  if (!envConfig.sha256) {
    return password;
  }
  return createHash('sha256').update(password).digest('hex');
}

describe('Password reset mail (e2e)', () => {
  let app;
  let testHelper: TestHelper;
  let connection;
  let db;

  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const email = `reset-mail-${suffix}@test.com`;

  /** Everything the mailer was asked to send, in order. */
  const sent: { config: Record<string, unknown>; subject: string; to: string }[] = [];

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [...imports, ServerModule],
    })
      // The only way to see what a recipient would see without sending anything.
      .overrideProvider(EmailService)
      .useValue({
        sendMail: async (to: string, subject: string, config: Record<string, unknown>) => {
          sent.push({ config, subject, to });
          return { accepted: [to] };
        },
      })
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalFilters(new HttpExceptionLogFilter());
    app.setBaseViewsDir(envConfig.templates.path);
    app.setViewEngine(envConfig.templates.engine);
    await app.init();
    testHelper = new TestHelper(app);

    connection = await MongoClient.connect(envConfig.mongoose.uri, {});
    db = connection.db();

    await testHelper.rest('/iam/sign-up/email', {
      method: 'POST',
      payload: { email, name: 'Reset Mail', password: 'ResetMail123!', termsAndPrivacyAccepted: true },
      statusCode: 201,
    });
  });

  afterAll(async () => {
    const user = await db.collection('users').findOne({ email });
    if (user) {
      const ids: any[] = [user._id, user._id.toString(), user.iamId, user.id].filter(Boolean);
      await db.collection('account').deleteMany({ userId: { $in: ids } });
      await db.collection('session').deleteMany({ userId: { $in: ids } });
    }
    await db.collection('users').deleteMany({ email });
    await connection.close();
    await app.close();
  });

  it('puts the real token in the link, not the word undefined', async () => {
    sent.length = 0;

    await testHelper.rest('/users/password/reset-request', {
      method: 'POST',
      payload: { email },
      statusCode: 201,
    });

    // The send is detached so it does not leak timing, so it may not have happened yet.
    for (let attempt = 0; attempt < 40 && sent.length === 0; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    expect(sent).toHaveLength(1);
    const link = String((sent[0].config.templateData as { link?: string })?.link ?? '');

    expect(link).not.toContain('undefined');
    expect(link).toMatch(/^https?:\/\/[^/]+\/auth\/reset-password\?token=[a-f0-9]{64}$/);

    // THE token, not merely a well-shaped one — a value that does not match unlocks nothing.
    const stored = await db.collection('users').findOne({ email });
    expect(link.endsWith(String(stored?.passwordResetToken))).toBe(true);
  });

  it('points at the page the frontend starter actually ships', async () => {
    sent.length = 0;
    await testHelper.rest('/users/password/reset-request', { method: 'POST', payload: { email }, statusCode: 201 });
    for (let attempt = 0; attempt < 40 && sent.length === 0; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    const link = String((sent[0].config.templateData as { link?: string })?.link ?? '');

    // nuxt-base-template/app/pages/auth/reset-password.vue — the page is spelled that way round,
    // and it reads the token from `?token=`, not from a path segment. A link that gets either half
    // wrong reaches a page that reports an invalid token, which is indistinguishable to the
    // recipient from an expired one.
    expect(link).toContain('/auth/reset-password?token=');
    expect(link).not.toContain('/auth/password-reset');
  });

  it('answers an unknown address exactly like a known one, and mails nothing', async () => {
    sent.length = 0;

    // A 500 here is the failure this asserts against: it both crashes and re-opens the account
    // oracle that returning `null` from the framework was meant to close.
    await testHelper.rest('/users/password/reset-request', {
      method: 'POST',
      payload: { email: `nobody-${suffix}@test.com` },
      statusCode: 201,
    });

    await new Promise((resolve) => setTimeout(resolve, 300));

    // Otherwise this endpoint sends billable mail to any address a stranger names.
    expect(sent).toHaveLength(0);
  });
});
