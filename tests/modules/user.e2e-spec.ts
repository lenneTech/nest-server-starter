import {
  ComparisonOperatorEnum,
  ConfigService,
  HttpExceptionLogFilter,
  TestGraphQLType,
  TestHelper,
} from '@lenne.tech/nest-server';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test, TestingModule } from '@nestjs/testing';
import { createHash } from 'crypto';
import { PubSub } from 'graphql-subscriptions';
import { Server } from 'http';
import { MongoClient, ObjectId } from 'mongodb';

import envConfig from '../../src/config.env';
import metaData = require('../../src/meta.json');
import { imports, ServerModule } from '../../src/server/server.module';

/**
 * Helper to hash password with SHA256 if enabled in config
 */
function hashPassword(password: string): string {
  if (!envConfig.sha256) {
    return password;
  }
  return createHash('sha256').update(password).digest('hex');
}

describe('User Module (e2e)', () => {
  // To enable debugging, include these flags in the options of the request you want to debug
  const log = true; // eslint-disable-line unused-imports/no-unused-vars
  const logError = true; // eslint-disable-line unused-imports/no-unused-vars

  // Test environment properties
  let app: NestExpressApplication;
  let httpServer: Server;
  let testHelper: TestHelper;

  // database
  let connection;
  let db;

  // Services
  let configService: ConfigService; // eslint-disable-line unused-imports/no-unused-vars

  // Global vars for IAM tests
  let gId: string;
  let gEmail: string;
  let gPassword: string;
  let gToken: string;

  // Global vars for REST tests
  let gRestPrepareUserId: string;
  let gRestPrepareUserToken: string;
  let gRestUserId: string;
  let gRestUserEmail: string;

  // ===================================================================================================================
  // Preparations
  // ===================================================================================================================

  /**
   * Before all tests
   */
  beforeAll(async () => {
    try {
      // Start server for testing
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

      // Use httpServer.listen(0) for dynamic port
      httpServer = app.getHttpServer();
      await new Promise<void>((resolve) => {
        httpServer.listen(0, '127.0.0.1', () => resolve());
      });

      // Get dynamically assigned port for WebSocket connection
      const address = httpServer.address();
      const dynamicPort = typeof address === 'object' && address ? address.port : 3030;
      testHelper = new TestHelper(app, `ws://127.0.0.1:${dynamicPort}/graphql`);
      configService = moduleFixture.get(ConfigService);

      // Connection to database
      console.info(`MongoDB: Create connection to ${envConfig.mongoose.uri}`);
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
    // Clean up test users
    if (db && gId) {
      try {
        await db.collection('users').deleteOne({ _id: new ObjectId(gId) });
      } catch {
        // Ignore cleanup errors
      }
    }
    if (connection) {
      await connection.close();
    }
    // Explicitly close httpServer
    if (httpServer) {
      await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    }
    if (app) {
      await app.close();
    }
  });

  // ===================================================================================================================
  // IAM Authentication Tests
  // ===================================================================================================================

  /**
   * Sign up new user via IAM
   */
  it('IAM: signUp', async () => {
    const random = Math.random().toString(36).substring(7);
    gPassword = `${random  }A1!`;
    gEmail = `user-${random}@testuser.com`;

    const res = await testHelper.rest('/iam/sign-up/email', {
      method: 'POST',
      payload: {
        email: gEmail,
        name: 'Everardo',
        password: hashPassword(gPassword),
        termsAndPrivacyAccepted: true,
      },
      statusCode: 201,
    });

    expect(res).toBeDefined();

    // Get user ID from database
    const user = await db.collection('users').findOne({ email: gEmail });
    expect(user).toBeDefined();
    gId = user._id.toString();

    // Verify email for BetterAuth
    await db.collection('users').updateOne(
      { _id: new ObjectId(gId) },
      { $set: { emailVerified: true, verified: true } },
    );
  });

  /**
   * Sign in user via IAM
   */
  it('IAM: signIn', async () => {
    const res = await testHelper.rest('/iam/sign-in/email', {
      method: 'POST',
      payload: {
        email: gEmail,
        password: hashPassword(gPassword),
      },
      returnResponse: true,
      statusCode: 200,
    });

    expect(res).toBeDefined();
    gToken = TestHelper.extractSessionToken(res);
    expect(gToken).toBeDefined();
  });

  /**
   * Get session via IAM
   */
  it('IAM: getSession', async () => {
    const res = await testHelper.rest('/iam/session', {
      cookies: gToken,
      method: 'GET',
      statusCode: 200,
    });

    expect(res).toBeDefined();
  });

  // ===================================================================================================================
  // User GraphQL Tests (using IAM token)
  // ===================================================================================================================

  /**
   * Find users without admin rights should fail
   * With IAM and the global RolesGuard, @Roles(RoleEnum.ADMIN) is enforced.
   * Non-admin users get ACCESS_DENIED error.
   */
  it('findUsers without rights', async () => {
    const res: any = await testHelper.graphQl(
      {
        fields: ['id', 'email'],
        name: 'findUsers',
        type: TestGraphQLType.QUERY,
      },
      { statusCode: 200, token: gToken },
    );
    // Non-admin users should get FORBIDDEN error
    expect(res).toBeDefined();
    expect(res.errors).toBeDefined();
    expect(res.errors[0].extensions.code).toBe('FORBIDDEN');
  });

  /**
   * Update user
   */
  it('updateUser', async () => {
    const res: any = await testHelper.graphQl(
      {
        arguments: {
          id: gId,
          input: {
            firstName: 'Jonny',
          },
        },
        fields: ['id', 'email', 'firstName', 'roles'],
        name: 'updateUser',
        type: TestGraphQLType.MUTATION,
      },
      { token: gToken },
    );
    expect(res.id).toEqual(gId);
    expect(res.email).toEqual(gEmail);
    expect(res.firstName).toEqual('Jonny');
    expect(res.roles.length).toEqual(0);
  });

  /**
   * Update roles as non admin
   */
  it('user updates own role failed', async () => {
    const res: any = await testHelper.graphQl(
      {
        arguments: {
          id: gId,
          input: {
            roles: ['member'],
          },
        },
        fields: ['id', 'email', 'firstName', 'roles'],
        name: 'updateUser',
        type: TestGraphQLType.MUTATION,
      },
      { token: gToken },
    );

    expect(res.errors.length).toBeGreaterThanOrEqual(1);
    expect(res.errors[0].extensions.originalError.statusCode).toEqual(401);
    expect(res.errors[0].message).toEqual('The current user has no access rights for roles of UserInput');
    expect(res.data).toBe(null);
  });

  /**
   * Get user (as admin)
   */
  it('getUser', async () => {
    await db.collection('users').findOneAndUpdate({ _id: new ObjectId(gId) }, { $set: { roles: ['admin'] } });
    const res: any = await testHelper.graphQl(
      {
        arguments: {
          id: gId,
        },
        fields: ['id', 'email', 'firstName', 'roles'],
        name: 'getUser',
      },
      { token: gToken },
    );
    expect(res.id).toEqual(gId);
    expect(res.email).toEqual(gEmail);
    expect(res.firstName).toEqual('Jonny');
    expect(res.roles[0]).toEqual('admin');
    expect(res.roles.length).toEqual(1);
  });

  /**
   * Find users
   */
  it('findUsers', async () => {
    const res: any = await testHelper.graphQl(
      {
        fields: ['id', 'email'],
        name: 'findUsers',
      },
      { token: gToken },
    );
    expect(res.length).toBeGreaterThanOrEqual(1);
  });

  /**
   * Find user via ID
   */
  it('findUserViaId', async () => {
    const res: any = await testHelper.graphQl(
      {
        arguments: { filter: { singleFilter: { field: 'id', operator: ComparisonOperatorEnum.EQ, value: gId } } },
        fields: ['id', 'email'],
        name: 'findUsers',
      },
      { token: gToken },
    );
    expect(res.length).toBe(1);
    expect(res[0].id).toEqual(gId);
    expect(res[0].email).toEqual(gEmail);
  });

  /**
   * Find sample user
   */
  it('findSampleUser', async () => {
    const res: any = await testHelper.graphQl(
      {
        arguments: { samples: 1 },
        fields: ['id', 'email'],
        name: 'findUsers',
      },
      { token: gToken },
    );
    expect(res.length).toBeGreaterThanOrEqual(1);
  });

  /**
   * Update roles as admin
   */
  it('user updates roles as admin', async () => {
    const res: any = await testHelper.graphQl(
      {
        arguments: {
          id: gId,
          input: {
            roles: ['member'],
          },
        },
        fields: ['id', 'email', 'firstName', 'roles'],
        name: 'updateUser',
        type: TestGraphQLType.MUTATION,
      },
      { token: gToken },
    );
    expect(res.id).toEqual(gId);
    expect(res.email).toEqual(gEmail);
    expect(res.firstName).toEqual('Jonny');
    expect(res.roles[0]).toEqual('member');
    expect(res.roles.length).toEqual(1);
  });

  /**
   * Delete user
   */
  it('deleteUser', async () => {
    const res: any = await testHelper.graphQl(
      {
        arguments: {
          id: gId,
        },
        fields: ['id'],
        name: 'deleteUser',
        type: TestGraphQLType.MUTATION,
      },
      { token: gToken },
    );
    expect(res.id).toEqual(gId);
    gId = null; // Mark as deleted to skip cleanup
  });

  // ===================================================================================================================
  // REST API Tests for User Controller
  // ===================================================================================================================

  /**
   * Prepare user for REST tests via IAM
   */
  it('REST: prepare user for testing', async () => {
    // Create new admin user for REST tests via IAM
    const random = Math.random().toString(36).substring(7);
    const password = `${random  }R1!`;
    const email = `rest-${random}@rest-test.com`;

    await testHelper.rest('/iam/sign-up/email', {
      method: 'POST',
      payload: {
        email,
        name: 'RESTTestUser',
        password: hashPassword(password),
        termsAndPrivacyAccepted: true,
      },
      statusCode: 201,
    });

    // Get user from database
    const user = await db.collection('users').findOne({ email });
    gRestPrepareUserId = user._id.toString();

    // Set admin role and verify email
    await db.collection('users').updateOne(
      { _id: new ObjectId(gRestPrepareUserId) },
      { $set: { emailVerified: true, roles: ['admin'], verified: true } },
    );

    // Sign in to get session token
    const signInRes = await testHelper.rest('/iam/sign-in/email', {
      method: 'POST',
      payload: {
        email,
        password: hashPassword(password),
      },
      returnResponse: true,
      statusCode: 200,
    });
    gRestPrepareUserToken = TestHelper.extractSessionToken(signInRes);
    expect(gRestPrepareUserToken).toBeDefined();
  });

  /**
   * Get Meta via REST
   */
  it('REST: getMeta', async () => {
    const res = await testHelper.rest('/meta');
    expect(res.package).toEqual(metaData.name);
    expect(res.version).toEqual(metaData.version);
  });

  /**
   * Create user via REST
   */
  it('REST: createUser', async () => {
    const random = Math.random().toString(36).substring(7);
    const input = {
      email: `${random}@rest-test.com`,
      firstName: 'RestTest',
      lastName: 'User',
      password: `${random  }P1!`,
    };

    const res = await testHelper.rest('/users', {
      cookies: gRestPrepareUserToken,
      method: 'POST',
      payload: input,
      statusCode: 201,
    });

    expect(res.id).toBeDefined();
    expect(res.email).toEqual(input.email);
    expect(res.firstName).toEqual(input.firstName);
    gRestUserId = res.id;
    gRestUserEmail = res.email;
  });

  /**
   * Get user by ID via REST
   */
  it('REST: getUserById', async () => {
    const res = await testHelper.rest(`/users/${gRestUserId}`, {
      cookies: gRestPrepareUserToken,
    });
    expect(res.id).toEqual(gRestUserId);
    expect(res.email).toEqual(gRestUserEmail);
  });

  /**
   * Find users via REST
   */
  it('REST: findUsers', async () => {
    const res = await testHelper.rest('/users', {
      cookies: gRestPrepareUserToken,
    });
    expect(Array.isArray(res)).toEqual(true);
    expect(res.length).toBeGreaterThan(0);
  });

  /**
   * Find users with count via REST
   */
  it('REST: findAndCountUsers', async () => {
    const res = await testHelper.rest('/users/count', {
      cookies: gRestPrepareUserToken,
    });
    expect(res.items).toBeDefined();
    expect(res.totalCount).toBeDefined();
    expect(Array.isArray(res.items)).toEqual(true);
    expect(res.totalCount).toBeGreaterThan(0);
  });

  /**
   * Update user via REST
   */
  it('REST: updateUser', async () => {
    const res = await testHelper.rest(`/users/${gRestUserId}`, {
      cookies: gRestPrepareUserToken,
      method: 'PATCH',
      payload: {
        firstName: 'RestUpdated',
      },
    });
    expect(res.id).toEqual(gRestUserId);
    expect(res.firstName).toEqual('RestUpdated');
  });

  /**
   * Delete user via REST
   */
  it('REST: deleteUser', async () => {
    const res = await testHelper.rest(`/users/${gRestUserId}`, {
      cookies: gRestPrepareUserToken,
      method: 'DELETE',
    });
    expect(res.id).toEqual(gRestUserId);
  });

  /**
   * Clean up REST prepare user
   */
  it('REST: delete prepare user', async () => {
    const res = await testHelper.rest(`/users/${gRestPrepareUserId}`, {
      cookies: gRestPrepareUserToken,
      method: 'DELETE',
    });
    expect(res.id).toEqual(gRestPrepareUserId);
  });
});
