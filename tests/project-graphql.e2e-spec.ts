import {
  ComparisonOperatorEnum,
  HttpExceptionLogFilter,
  RoleEnum,
  SortOrderEnum,
  TestGraphQLType,
  TestHelper,
} from '@lenne.tech/nest-server';
import { Test, TestingModule } from '@nestjs/testing';
import { createHash } from 'crypto';
import { PubSub } from 'graphql-subscriptions';
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

describe('Project GraphQL (e2e)', () => {
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
        imports: [
          ...imports,
          ServerModule,
        ],
        providers: [
          {
            provide: 'PUB_SUB',
            useValue: new PubSub(),
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
      const password = `${random + i  }P1!`;
      const input = {
        email: `${random + i}@testusers.com`,
        name: `Test${'0'.repeat((`${userCount}`).length - (`${i}`).length)}${i}${random}`,
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
      await db.collection('users').updateOne(
        { _id: new ObjectId(user._id) },
        { $set: { emailVerified: true, verified: true } },
      );
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
  // GraphQL Tests
  // ===================================================================================================================

  /**
   * Find and count users
   */
  it('findAndCountUsers', async () => {
    const emails = users.map(user => user.email);
    emails.pop();
    const args = {
      filter: {
        singleFilter: {
          field: 'email',
          operator: ComparisonOperatorEnum.IN,
          value: emails,
        },
      },
      limit: 2,
      skip: 1,
      sort: [{ field: 'firstName', order: SortOrderEnum.DESC }],
    };
    const res: any = await testHelper.graphQl(
      {
        arguments: { ...args },
        fields: [{ items: ['id', 'email', 'firstName', 'lastName'] }, 'totalCount'],
        name: 'findAndCountUsers',
        type: TestGraphQLType.QUERY,
      },
      { token: users[0].token },
    );
    const min = Math.min(args.limit, emails.length - args.skip);
    expect(res.totalCount).toEqual(emails.length);
    expect(res.items.length).toEqual(min);
    for (let i = 0; i < min; i++) {
      const resPos = emails.length - 1 - args.skip - i;
      const curPos = i;
      expect(res.items[curPos].id).toEqual(users[resPos].id);
      expect(res.items[curPos].email).toEqual(users[resPos].email);
      expect(emails.includes(res.items[curPos].email)).toBe(true);
      expect(res.items[curPos].firstName).toEqual(users[resPos].firstName);
    }
  });

  /**
   * Get sample user
   */
  it('getSampleUser', async () => {
    const emails = users.map(user => user.email);
    const args = {
      filter: {
        singleFilter: {
          field: 'email',
          operator: ComparisonOperatorEnum.IN,
          value: emails,
        },
      },
      limit: 2,
      samples: 1,
      sort: [{ field: 'email', order: SortOrderEnum.DESC }],
    };
    const res: any = await testHelper.graphQl(
      {
        arguments: { ...args },
        fields: ['id', 'email', 'firstName', 'lastName'],
        name: 'findUsers',
        type: TestGraphQLType.QUERY,
      },
      { token: users[0].token },
    );
    expect(res.length).toEqual(1);
    expect(emails.includes(res[0].email)).toBe(true);
    const email = res[0].email;
    let otherEmail = res[0].email;
    while (email === otherEmail) {
      const otherRes: any = await testHelper.graphQl(
        {
          arguments: { ...args },
          fields: ['id', 'email', 'firstName', 'lastName'],
          name: 'findUsers',
          type: TestGraphQLType.QUERY,
        },
        { token: users[0].token },
      );
      expect(otherRes.length).toEqual(1);
      expect(emails.includes(otherRes[0].email)).toBe(true);
      otherEmail = otherRes[0].email;
    }
  });

  // ===================================================================================================================
  // Clean up tests
  // ===================================================================================================================

  /**
   * Delete users
   */
  it('deleteUsers', async () => {
    // Add admin role to last user
    await db
      .collection('users')
      .findOneAndUpdate({ _id: new ObjectId(users[users.length - 1].id) }, { $set: { roles: ['admin'] } });

    for (const user of users) {
      const res: any = await testHelper.graphQl(
        {
          arguments: {
            id: user.id,
          },
          fields: ['id'],
          name: 'deleteUser',
          type: TestGraphQLType.MUTATION,
        },
        { token: users[users.length - 1].token },
      );
      expect(res.id).toEqual(user.id);
    }
  });
});
