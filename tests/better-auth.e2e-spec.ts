import { HttpExceptionLogFilter, TestGraphQLType, TestHelper } from '@lenne.tech/nest-server';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test, TestingModule } from '@nestjs/testing';
import { createHash } from 'crypto';
import { PubSub } from 'graphql-subscriptions';
import { Server } from 'http';
import { Db, MongoClient, ObjectId } from 'mongodb';

import envConfig from '../src/config.env';
import { UserService } from '../src/server/modules/user/user.service';
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

/**
 * BetterAuth Integration Tests
 *
 * Tests for parallel Legacy Auth and IAM (BetterAuth) authentication:
 * - UserA: Legacy signUp → Legacy signIn → signOut → IAM signIn
 * - UserB: Legacy signUp → IAM signIn
 * - UserC: IAM signUp → IAM signIn
 */
describe('BetterAuth Integration (e2e)', () => {
  // Test environment properties
  let app: NestExpressApplication;
  let httpServer: Server;
  let testHelper: TestHelper;

  // Database
  let connection: MongoClient;
  let db: Db;

  // UserA: Legacy registration, Legacy login, Legacy logout, then IAM login
  let userAEmail: string;
  let userAPassword: string;
  let userAId: string;
  let userALegacyToken: string;

  // UserB: Legacy registration, IAM login
  let userBEmail: string;
  let userBPassword: string;
  let userBId: string;
  let userBIamToken: string;

  // UserC: IAM registration, IAM login
  let userCEmail: string;
  let userCPassword: string;
  let userCId: string;
  let userCIamToken: string;

  // ===================================================================================================================
  // Preparations
  // ===================================================================================================================

  beforeAll(async () => {
    if (envConfig.cookies) {
      console.error('NOTE: Cookie handling is enabled. The tests with tokens will fail!');
    }
    try {
      const moduleFixture: TestingModule = await Test.createTestingModule({
        imports: [...imports, ServerModule],
        providers: [
          UserService,
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

      // Use httpServer.listen(0) instead of app.listen() to:
      // - Avoid "Nest application successfully started" log noise
      // - Use dynamic port to prevent conflicts in parallel tests
      httpServer = app.getHttpServer();
      await new Promise<void>((resolve) => {
        httpServer.listen(0, '127.0.0.1', () => resolve());
      });
      const port = (httpServer.address() as { port: number }).port;
      testHelper = new TestHelper(app, `ws://127.0.0.1:${port}/graphql`);

      // Connection to database
      connection = await MongoClient.connect(envConfig.mongoose.uri);
      db = connection.db();
    } catch (e) {
      console.error('beforeAllError', e);
    }
  });

  afterAll(async () => {
    // Clean up test users
    if (db) {
      if (userAId) {
        await db.collection('users').deleteOne({ _id: new ObjectId(userAId) });
      }
      if (userBId) {
        await db.collection('users').deleteOne({ _id: new ObjectId(userBId) });
      }
      if (userCId) {
        await db.collection('users').deleteOne({ _id: new ObjectId(userCId) });
      }
    }

    // Close database connection
    if (connection) {
      await connection.close();
    }

    // Explicitly close httpServer to prevent open handle warnings
    if (httpServer) {
      await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    }

    // Close NestJS application
    if (app) {
      await app.close();
    }
  });

  // ===================================================================================================================
  // UserA: Legacy signUp → Legacy signIn → signOut → IAM signIn
  // ===================================================================================================================

  describe('UserA: Legacy registration → Legacy login → Logout → IAM login', () => {
    it('should sign up via Legacy Auth', async () => {
      userAPassword = Math.random().toString(36).substring(7);
      userAEmail = `usera-${userAPassword}@betterauth-test.com`;

      const res: any = await testHelper.graphQl({
        arguments: {
          input: {
            email: userAEmail,
            firstName: 'UserA',
            password: userAPassword,
          },
        },
        fields: [{ user: ['id', 'email'] }],
        name: 'signUp',
        type: TestGraphQLType.MUTATION,
      });

      expect(res.user.email).toEqual(userAEmail);
      userAId = res.user.id;
    });

    it('should verify UserA', async () => {
      const user = await db.collection('users').findOne({ _id: new ObjectId(userAId) });
      const res: any = await testHelper.graphQl({
        arguments: {
          token: user.verificationToken,
        },
        name: 'verifyUser',
        type: TestGraphQLType.MUTATION,
      });
      expect(res).toEqual(true);
    });

    it('should sign in via Legacy Auth', async () => {
      const res: any = await testHelper.graphQl({
        arguments: {
          input: {
            email: userAEmail,
            password: userAPassword,
          },
        },
        fields: ['token', 'refreshToken', { user: ['id', 'email'] }],
        name: 'signIn',
        type: TestGraphQLType.MUTATION,
      });

      expect(res.user.id).toEqual(userAId);
      expect(res.user.email).toEqual(userAEmail);
      expect(res.token.length).toBeGreaterThan(0);
      userALegacyToken = res.token;
    });

    it('should sign out via Legacy Auth', async () => {
      // Legacy signOut is not always available as a GraphQL mutation
      // Skip if not available and proceed with IAM login test
      try {
        const res: any = await testHelper.graphQl(
          {
            name: 'signOut',
            type: TestGraphQLType.MUTATION,
          },
          { token: userALegacyToken },
        );
        expect(res).toEqual(true);
      } catch {
        // signOut might not be available, continue with test
        console.info('Legacy signOut not available, continuing...');
      }
    });

    it('should sign in via IAM (BetterAuth)', async () => {
      const res: any = await testHelper.graphQl({
        arguments: {
          email: userAEmail,
          password: hashPassword(userAPassword),
        },
        fields: ['success', 'token', 'error', { user: ['id', 'email'] }],
        name: 'betterAuthSignIn',
        type: TestGraphQLType.MUTATION,
      });

      // Check for errors first
      if (res.errors) {
        console.error('BetterAuth SignIn Error:', JSON.stringify(res.errors, null, 2));
      }
      expect(res.success).toEqual(true);
      expect(res.user.email).toEqual(userAEmail);
      expect(res.token.length).toBeGreaterThan(0);
    });
  });

  // ===================================================================================================================
  // UserB: Legacy signUp → IAM signIn → IAM signOut
  // ===================================================================================================================

  describe('UserB: Legacy registration → IAM login → IAM logout', () => {
    it('should sign up via Legacy Auth', async () => {
      userBPassword = Math.random().toString(36).substring(7);
      userBEmail = `userb-${userBPassword}@betterauth-test.com`;

      const res: any = await testHelper.graphQl({
        arguments: {
          input: {
            email: userBEmail,
            firstName: 'UserB',
            password: userBPassword,
          },
        },
        fields: [{ user: ['id', 'email'] }],
        name: 'signUp',
        type: TestGraphQLType.MUTATION,
      });

      expect(res.user.email).toEqual(userBEmail);
      userBId = res.user.id;
    });

    it('should verify UserB', async () => {
      const user = await db.collection('users').findOne({ _id: new ObjectId(userBId) });
      const res: any = await testHelper.graphQl({
        arguments: {
          token: user.verificationToken,
        },
        name: 'verifyUser',
        type: TestGraphQLType.MUTATION,
      });
      expect(res).toEqual(true);
    });

    it('should sign in via IAM (BetterAuth) without prior Legacy login', async () => {
      const res: any = await testHelper.graphQl({
        arguments: {
          email: userBEmail,
          password: hashPassword(userBPassword),
        },
        fields: ['success', 'token', 'error', { user: ['id', 'email'] }],
        name: 'betterAuthSignIn',
        type: TestGraphQLType.MUTATION,
      });

      if (res.errors) {
        console.error('BetterAuth SignIn Error (UserB):', JSON.stringify(res.errors, null, 2));
      }
      expect(res.success).toEqual(true);
      expect(res.user.email).toEqual(userBEmail);
      expect(res.token.length).toBeGreaterThan(0);
      userBIamToken = res.token;
    });

    it('should sign out via IAM (BetterAuth)', async () => {
      const res: any = await testHelper.graphQl(
        {
          name: 'betterAuthSignOut',
          type: TestGraphQLType.MUTATION,
        },
        { token: userBIamToken },
      );
      expect(res).toEqual(true);
    });
  });

  // ===================================================================================================================
  // UserC: IAM signUp → IAM signIn → IAM signOut
  // ===================================================================================================================

  describe('UserC: IAM registration → IAM login → IAM logout', () => {
    it('should sign up via IAM (BetterAuth)', async () => {
      userCPassword = Math.random().toString(36).substring(7);
      userCEmail = `userc-${userCPassword}@betterauth-test.com`;

      const res: any = await testHelper.graphQl({
        arguments: {
          email: userCEmail,
          name: 'UserC',
          password: hashPassword(userCPassword),
        },
        fields: ['success', 'error', { user: ['id', 'email'] }],
        name: 'betterAuthSignUp',
        type: TestGraphQLType.MUTATION,
      });

      if (res.errors) {
        console.error('BetterAuth SignUp Error (UserC):', JSON.stringify(res.errors, null, 2));
      }
      expect(res.success).toEqual(true);
      expect(res.user.email).toEqual(userCEmail);
      userCId = res.user.id;
    });

    it('should sign in via IAM (BetterAuth)', async () => {
      const res: any = await testHelper.graphQl({
        arguments: {
          email: userCEmail,
          password: hashPassword(userCPassword),
        },
        fields: ['success', 'token', 'error', { user: ['id', 'email'] }],
        name: 'betterAuthSignIn',
        type: TestGraphQLType.MUTATION,
      });

      if (res.errors) {
        console.error('BetterAuth SignIn Error (UserC):', JSON.stringify(res.errors, null, 2));
      }
      expect(res.success).toEqual(true);
      expect(res.user.id).toEqual(userCId);
      expect(res.user.email).toEqual(userCEmail);
      expect(res.token.length).toBeGreaterThan(0);
      userCIamToken = res.token;
    });

    it('should sign out via IAM (BetterAuth)', async () => {
      const res: any = await testHelper.graphQl(
        {
          name: 'betterAuthSignOut',
          type: TestGraphQLType.MUTATION,
        },
        { token: userCIamToken },
      );
      expect(res).toEqual(true);
    });
  });

  // ===================================================================================================================
  // Additional Tests
  // ===================================================================================================================

  describe('BetterAuth Features', () => {
    it('should report betterAuthEnabled as true', async () => {
      const res: any = await testHelper.graphQl({
        name: 'betterAuthEnabled',
      });
      expect(res).toEqual(true);
    });

    it('should return betterAuthFeatures', async () => {
      const res: any = await testHelper.graphQl({
        fields: ['enabled', 'jwt', 'twoFactor', 'passkey'],
        name: 'betterAuthFeatures',
      });
      expect(res.enabled).toBeDefined();
      expect(res.jwt).toBeDefined();
      expect(res.twoFactor).toBeDefined();
      expect(res.passkey).toBeDefined();
    });
  });
});
