import { HttpExceptionLogFilter, TestHelper } from '@lenne.tech/nest-server';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test, TestingModule } from '@nestjs/testing';
import { createHash } from 'crypto';
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

describe('User Module REST (e2e)', () => {
  // To enable debugging, include these flags in the options of the request you want to debug
  const log = true;
  const logError = true;

  // Test environment properties
  let app: NestExpressApplication;
  let httpServer: Server;
  let testHelper: TestHelper;

  // database
  let connection;
  let db;

  // Global vars for REST tests
  let gRestPrepareUserId: string;
  let gRestPrepareUserToken: string;
  let gRestUserId: string;
  let gRestUserEmail: string;
  let gRestMemberId: string;
  let gRestMemberToken: string;

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

      // Use httpServer.listen(0) for dynamic port
      httpServer = app.getHttpServer();
      await new Promise<void>((resolve) => {
        httpServer.listen(0, '127.0.0.1', () => resolve());
      });

      testHelper = new TestHelper(app);

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
    if (db && gRestPrepareUserId) {
      try {
        await db.collection('users').deleteOne({ _id: new ObjectId(gRestPrepareUserId) });
      } catch {
        // Ignore cleanup errors
      }
    }
    if (db && gRestUserId) {
      try {
        await db.collection('users').deleteOne({ _id: new ObjectId(gRestUserId) });
      } catch {
        // Ignore cleanup errors
      }
    }
    if (db && gRestMemberId) {
      try {
        await db.collection('users').deleteOne({ _id: new ObjectId(gRestMemberId) });
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
  // REST API Tests for User Controller
  // ===================================================================================================================

  /**
   * Prepare user for REST tests via IAM
   */
  it('REST: prepare user for testing', async () => {
    // Create new admin user for REST tests via IAM
    const random = Math.random().toString(36).substring(7);
    const password = `${random}R1!`;
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
    await db
      .collection('users')
      .updateOne(
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
      password: `${random}P1!`,
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

  // -------------------------------------------------------------------------------------------------------------------
  // Refusals. The controller relies on `@Roles()` alone (the global role guard authenticates AND authorizes); the
  // route-level `AuthGuard(BETTER_AUTH)` it used to carry was a second layer that never changed a decision. These
  // cases are what notices if the remaining layer ever stops refusing — without them every case above stays green,
  // because the admin is still admitted.
  // -------------------------------------------------------------------------------------------------------------------

  /**
   * Prepare a verified user WITHOUT any role
   */
  it('REST: prepare a non-admin user', async () => {
    const random = Math.random().toString(36).substring(7);
    const password = `${random}R1!`;
    const email = `rest-member-${random}@rest-test.com`;

    await testHelper.rest('/iam/sign-up/email', {
      method: 'POST',
      payload: { email, name: 'RESTMember', password: hashPassword(password), termsAndPrivacyAccepted: true },
      statusCode: 201,
    });
    const user = await db.collection('users').findOne({ email });
    gRestMemberId = user._id.toString();
    await db
      .collection('users')
      .updateOne({ _id: new ObjectId(gRestMemberId) }, { $set: { emailVerified: true, roles: [], verified: true } });

    const signInRes = await testHelper.rest('/iam/sign-in/email', {
      method: 'POST',
      payload: { email, password: hashPassword(password) },
      returnResponse: true,
      statusCode: 200,
    });
    gRestMemberToken = TestHelper.extractSessionToken(signInRes);
    expect(gRestMemberToken).toBeDefined();
  });

  /**
   * Every user route refuses an anonymous caller with 401, and nothing is written
   */
  it('REST: refuses every user route to an anonymous caller', async () => {
    const newUser = { email: `anon-${Date.now()}@rest-test.com`, password: 'Anon1234!' };
    await testHelper.rest('/users', { statusCode: 401 });
    await testHelper.rest('/users/count', { statusCode: 401 });
    await testHelper.rest(`/users/${gRestUserId}`, { statusCode: 401 });
    await testHelper.rest('/users', { method: 'POST', payload: newUser, statusCode: 401 });
    await testHelper.rest(`/users/${gRestUserId}`, {
      method: 'PATCH',
      payload: { firstName: 'AnonymousEdit' },
      statusCode: 401,
    });
    await testHelper.rest(`/users/${gRestUserId}`, { method: 'DELETE', statusCode: 401 });

    const target = await db.collection('users').findOne({ _id: new ObjectId(gRestUserId) });
    expect(target).not.toBeNull();
    expect(target.firstName).toEqual('RestTest');
    expect(await db.collection('users').countDocuments({ email: newUser.email })).toEqual(0);
  });

  /**
   * The admin-only routes refuse an authenticated user without the admin role with 403
   */
  it('REST: refuses the admin routes to a non-admin user', async () => {
    const newUser = { email: `member-${Date.now()}@rest-test.com`, password: 'Member1234!' };
    await testHelper.rest('/users', { cookies: gRestMemberToken, statusCode: 403 });
    await testHelper.rest('/users/count', { cookies: gRestMemberToken, statusCode: 403 });
    await testHelper.rest('/users', { cookies: gRestMemberToken, method: 'POST', payload: newUser, statusCode: 403 });
    expect(await db.collection('users').countDocuments({ email: newUser.email })).toEqual(0);
  });

  /**
   * A non-admin user may read their own record, but not another user's — and may neither change nor delete it
   */
  it('REST: limits a non-admin user to their own record', async () => {
    const own = await testHelper.rest(`/users/${gRestMemberId}`, { cookies: gRestMemberToken });
    expect(own.id).toEqual(gRestMemberId);

    await testHelper.rest(`/users/${gRestUserId}`, { cookies: gRestMemberToken, statusCode: 403 });
    await testHelper.rest(`/users/${gRestUserId}`, {
      cookies: gRestMemberToken,
      method: 'PATCH',
      payload: { firstName: 'MemberEdit' },
      statusCode: 403,
    });
    await testHelper.rest(`/users/${gRestUserId}`, { cookies: gRestMemberToken, method: 'DELETE', statusCode: 403 });

    const target = await db.collection('users').findOne({ _id: new ObjectId(gRestUserId) });
    expect(target).not.toBeNull();
    expect(target.firstName).toEqual('RestTest');
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
    gRestUserId = null; // Mark as deleted to skip cleanup
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
    gRestPrepareUserId = null; // Mark as deleted to skip cleanup
  });
});
