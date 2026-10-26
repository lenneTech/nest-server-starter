import { EmailService, HttpExceptionLogFilter, TestGraphQLType, TestHelper } from '@lenne.tech/nest-server';
import { Test, TestingModule } from '@nestjs/testing';
import { MongoClient } from 'mongodb';

import envConfig from '../src/config.env.js';
import { imports, ServerModule } from '../src/server/server.module.js';

/**
 * Story: the password-reset mail this starter sends is one a person can actually use — asked
 * through the `requestPasswordResetMail` mutation (user.resolver.ts).
 *
 * The four defects behind these assertions, and why each is asserted separately, are told in
 * password-reset-mail-rest.e2e-spec.ts, which asks the same three questions through the REST route.
 * Both specs exist because a generated project keeps only one of them: api-mode.manifest.json
 * deletes `*-rest.e2e-spec.ts` in GraphQL mode and `*-graphql.e2e-spec.ts` in REST mode, so without
 * this file a GraphQL-only project would not test its reset mail at all. The mail itself comes from
 * the shared `UserService.sendPasswordResetMail`; what differs per transport is the answer, and the
 * account oracle lives in the answer.
 */
describe('Password reset mail - GraphQL (e2e)', () => {
  let app;
  let testHelper: TestHelper;
  let connection;
  let db;

  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const email = `reset-mail-gql-${suffix}@test.com`;

  /** Everything the mailer was asked to send, in order. */
  const sent: { config: Record<string, unknown>; subject: string; to: string }[] = [];

  /** Ask for a reset mail the way a GraphQL client does. */
  function requestResetMail(address: string) {
    return testHelper.graphQl({
      arguments: { email: address },
      name: 'requestPasswordResetMail',
      type: TestGraphQLType.MUTATION,
    });
  }

  /** The send is detached so it does not leak timing, so it may not have happened yet. */
  async function waitForMail() {
    for (let attempt = 0; attempt < 40 && sent.length === 0; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }

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

    // Better Auth's sign-up is REST in every API mode (it is not one of the starter's controllers).
    await testHelper.rest('/iam/sign-up/email', {
      method: 'POST',
      payload: { email, name: 'Reset Mail GraphQL', password: 'ResetMail123!', termsAndPrivacyAccepted: true },
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

    expect(await requestResetMail(email)).toBe(true);
    await waitForMail();

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
    await requestResetMail(email);
    await waitForMail();

    const link = String((sent[0].config.templateData as { link?: string })?.link ?? '');

    // nuxt-base-template/app/pages/auth/reset-password.vue reads the token from `?token=`.
    expect(link).toContain('/auth/reset-password?token=');
    expect(link).not.toContain('/auth/password-reset');
  });

  it('answers an unknown address exactly like a known one, and mails nothing', async () => {
    sent.length = 0;

    // GraphQL answers 200 either way, so the oracle would sit in the payload: an error for an
    // unknown address, or `false` where a known one gets `true`. Both count, so assert the value.
    const answer = await requestResetMail(`nobody-${suffix}@test.com`);
    expect(answer?.errors, 'an unknown address must not produce an error a caller can tell apart').toBeUndefined();
    expect(answer).toBe(true);

    await new Promise((resolve) => setTimeout(resolve, 300));

    // Otherwise this mutation sends billable mail to any address a stranger names.
    expect(sent).toHaveLength(0);
  });
});
