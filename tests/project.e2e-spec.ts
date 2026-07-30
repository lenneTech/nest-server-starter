import { HttpExceptionLogFilter, RoleEnum, TestHelper } from '@lenne.tech/nest-server';
import { Test, TestingModule } from '@nestjs/testing';
import { createHash } from 'crypto';
import { MongoClient, ObjectId } from 'mongodb';

import envConfig from '../src/config.env';
import { User } from '../src/server/modules/user/user.model';
import { imports, ServerModule } from '../src/server/server.module';

/**
 * Helper to hash password with SHA256 if enabled in config
 */
function hashPassword(password: string): string {
  if (!envConfig.sha256) {
    return password;
  }
  return createHash('sha256').update(password).digest('hex');
}

describe('Project (e2e)', () => {
  // To enable debugging, include these flags in the options of the request you want to debug
  const log = true;
  const logError = true;

  // Test environment properties
  let app;
  let testHelper: TestHelper;

  // database
  let connection;
  let db;

  // Global vars
  const users: Partial<User & { token: string }>[] = [];

  // ===================================================================================================================
  // Preparations
  // ===================================================================================================================

  /**
   * Before all tests
   */
  beforeAll(async () => {
    try {
      const moduleFixture: TestingModule = await Test.createTestingModule({
        imports: [...imports, ServerModule],
        providers: [
          {
            provide: 'PUB_SUB',
            useValue: { publish: async () => {} },
          },
        ],
      }).compile();
      app = moduleFixture.createNestApplication();
      app.useGlobalFilters(new HttpExceptionLogFilter());
      app.setBaseViewsDir(envConfig.templates.path);
      app.setViewEngine(envConfig.templates.engine);
      await app.init();
      testHelper = new TestHelper(app);

      // Connection to database
      connection = await MongoClient.connect(envConfig.mongoose.uri);
      db = await connection.db();
    } catch (e) {
      console.error('beforeAllError', e);
    }
  });

  /**
   * After all tests are finished
   */
  afterAll(async () => {
    await connection.close();
    await app.close();
  });

  // ===================================================================================================================
  // Initialization tests
  // ===================================================================================================================

  /**
   * Create and verify users for testing via IAM
   */
  it('createAndVerifyUsers', async () => {
    const userCount = 5;
    const random = Math.random().toString(36).substring(7);
    for (let i = 0; i < userCount; i++) {
      const password = `${random + i}P1!`;
      const input = {
        email: `${random + i}@testusers.com`,
        name: `Test${'0'.repeat(`${userCount}`.length - `${i}`.length)}${i}${random}`,
        password: hashPassword(password),
        termsAndPrivacyAccepted: true,
      };

      // Sign up user via IAM REST
      const res = await testHelper.rest('/iam/sign-up/email', {
        method: 'POST',
        payload: input,
        statusCode: 201,
      });

      expect(res).toBeDefined();

      // Get user from database
      const user = await db.collection('users').findOne({ email: input.email });
      expect(user).toBeDefined();

      users.push({
        email: input.email,
        firstName: input.name,
        id: user._id.toString(),
        password,
      });

      // Verify user in database
      await db
        .collection('users')
        .updateOne({ _id: new ObjectId(user._id) }, { $set: { emailVerified: true, verified: true } });
    }
    expect(users.length).toBeGreaterThanOrEqual(userCount);
  });

  /**
   * Sign in users via IAM
   */
  it('signInUsers', async () => {
    for (const user of users) {
      const res = await testHelper.rest('/iam/sign-in/email', {
        method: 'POST',
        payload: {
          email: user.email,
          password: hashPassword(user.password),
        },
        returnResponse: true,
        statusCode: 200,
      });

      expect(res).toBeDefined();
      user.token = TestHelper.extractSessionToken(res);
      expect(user.token).toBeDefined();
    }
  });

  /**
   * Prepare users
   */
  it('prepareUsers', async () => {
    await db
      .collection('users')
      .findOneAndUpdate({ _id: new ObjectId(users[0].id) }, { $set: { roles: [RoleEnum.ADMIN] } });
  });

  // ===================================================================================================================
  // Tests
  // ===================================================================================================================

  /**
   * Test
   */
  it('test', async () => {
    console.info('Implement test here');
  });

  // ===================================================================================================================
  // Clean up tests
  // ===================================================================================================================

  /**
   * Delete users
   */
  it('deleteUsers', async () => {
    for (const user of users) {
      await db.collection('users').deleteOne({ _id: new ObjectId(user.id) });
    }
  });
});
