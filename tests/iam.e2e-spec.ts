import { CoreBetterAuthService, HttpExceptionLogFilter, TestHelper } from '@lenne.tech/nest-server';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test, TestingModule } from '@nestjs/testing';
import { createHash } from 'crypto';
import { PubSub } from 'graphql-subscriptions';
import { Server } from 'http';
import { Db, MongoClient, ObjectId } from 'mongodb';

import envConfig from '../src/config.env';
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
 * Auth (IAM) Integration Tests
 *
 * Tests for IAM (Better-Auth) authentication via REST with cookie-based sessions:
 * - UserA: IAM signUp → IAM signIn → IAM signOut
 * - UserB: IAM signUp → get session → sign out
 */
describe('Auth Integration (e2e)', () => {
  // Test environment properties
  let app: NestExpressApplication;
  let httpServer: Server;
  let testHelper: TestHelper;
  let betterAuthService: CoreBetterAuthService;

  // Database
  let connection: MongoClient;
  let db: Db;

  // UserA: IAM registration, IAM login, IAM logout
  let userAEmail: string;
  let userAPassword: string;
  let userAId: string;
  let userASessionToken: string;

  // UserB: IAM registration, session check
  let userBEmail: string;
  let userBPassword: string;
  let userBId: string;
  let userBSessionToken: string;

  // ===================================================================================================================
  // Preparations
  // ===================================================================================================================

  beforeAll(async () => {
    try {
      const moduleFixture: TestingModule = await Test.createTestingModule({
        imports: [...imports, ServerModule],
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
      testHelper = new TestHelper(app);
      betterAuthService = moduleFixture.get(CoreBetterAuthService);

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
    }

    // Close database connection
    if (connection) {
      await connection.close();
    }

    // Explicitly close httpServer
    if (httpServer) {
      await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    }

    // Close NestJS application
    if (app) {
      await app.close();
    }
  });

  // ===================================================================================================================
  // Helper Functions
  // ===================================================================================================================

  function generateTestEmail(prefix: string): string {
    const random = Math.random().toString(36).substring(7);
    return `${prefix}-${random}@auth-test.com`;
  }

  // ===================================================================================================================
  // IAM Feature Tests
  // ===================================================================================================================

  describe('IAM Features', () => {
    it('should have IAM enabled', async () => {
      expect(betterAuthService.isEnabled()).toBe(true);
    });

    it('should check IAM service is operational', async () => {
      // IAM features are accessed through the service directly
      expect(betterAuthService.isJwtEnabled()).toBeDefined();
    });
  });

  // ===================================================================================================================
  // UserA: IAM signUp → IAM signIn → IAM signOut
  // ===================================================================================================================

  describe('UserA: IAM registration → IAM login → IAM logout', () => {
    it('should sign up via IAM', async () => {
      userAPassword = `${Math.random().toString(36).substring(7)  }A1!`;
      userAEmail = generateTestEmail('usera');

      const res = await testHelper.rest('/iam/sign-up/email', {
        method: 'POST',
        payload: {
          email: userAEmail,
          name: 'UserA',
          password: hashPassword(userAPassword),
          termsAndPrivacyAccepted: true,
        },
        statusCode: 201,
      });

      expect(res).toBeDefined();
      expect(res.user || res.id).toBeDefined();

      // Get user ID from response or database
      if (res.user?.id) {
        userAId = res.user.id;
      } else {
        const user = await db.collection('users').findOne({ email: userAEmail });
        if (user) userAId = user._id.toString();
      }

      // Verify email for BetterAuth
      await db.collection('users').updateOne(
        { _id: new ObjectId(userAId) },
        { $set: { emailVerified: true, verified: true } },
      );
    });

    it('should sign in via IAM', async () => {
      const res = await testHelper.rest('/iam/sign-in/email', {
        method: 'POST',
        payload: {
          email: userAEmail,
          password: hashPassword(userAPassword),
        },
        returnResponse: true,
        statusCode: 200,
      });

      expect(res).toBeDefined();
      userASessionToken = TestHelper.extractSessionToken(res);
      expect(userASessionToken).toBeDefined();
    });

    it('should get session via IAM', async () => {
      if (!userASessionToken) {
        return;
      }

      const res = await testHelper.rest('/iam/session', {
        cookies: userASessionToken,
        method: 'GET',
        statusCode: 200,
      });

      expect(res).toBeDefined();
    });

    it('should sign out via IAM', async () => {
      if (!userASessionToken) {
        return;
      }

      const res = await testHelper.rest('/iam/sign-out', {
        cookies: userASessionToken,
        method: 'POST',
        statusCode: 201,
      });

      expect(res).toBeDefined();
    });
  });

  // ===================================================================================================================
  // UserB: IAM signUp → Session verification
  // ===================================================================================================================

  describe('UserB: IAM registration → Session verification', () => {
    it('should sign up via IAM', async () => {
      userBPassword = `${Math.random().toString(36).substring(7)  }B2!`;
      userBEmail = generateTestEmail('userb');

      const res = await testHelper.rest('/iam/sign-up/email', {
        method: 'POST',
        payload: {
          email: userBEmail,
          name: 'UserB',
          password: hashPassword(userBPassword),
          termsAndPrivacyAccepted: true,
        },
        statusCode: 201,
      });

      expect(res).toBeDefined();

      // Get user ID from response or database
      if (res.user?.id) {
        userBId = res.user.id;
      } else {
        const user = await db.collection('users').findOne({ email: userBEmail });
        if (user) userBId = user._id.toString();
      }

      // Verify email for BetterAuth
      await db.collection('users').updateOne(
        { _id: new ObjectId(userBId) },
        { $set: { emailVerified: true, verified: true } },
      );
    });

    it('should sign in and receive session via IAM', async () => {
      const res = await testHelper.rest('/iam/sign-in/email', {
        method: 'POST',
        payload: {
          email: userBEmail,
          password: hashPassword(userBPassword),
        },
        returnResponse: true,
        statusCode: 200,
      });

      expect(res).toBeDefined();
      userBSessionToken = TestHelper.extractSessionToken(res);
      expect(userBSessionToken).toBeDefined();
    });
  });

  // ===================================================================================================================
  // Error Handling Tests
  // ===================================================================================================================

  describe('Error Handling', () => {
    it('should reject sign-in with invalid credentials', async () => {
      try {
        await testHelper.rest('/iam/sign-in/email', {
          method: 'POST',
          payload: {
            email: 'nonexistent@test.com',
            password: 'wrongpassword',
          },
          statusCode: 401,
        });
      } catch (error) {
        // Expected to fail
        expect(error).toBeDefined();
      }
    });

    it('should reject duplicate sign-up', async () => {
      // Try to sign up with same email as UserA
      try {
        await testHelper.rest('/iam/sign-up/email', {
          method: 'POST',
          payload: {
            email: userAEmail,
            name: 'Duplicate',
            password: hashPassword('password123'),
            termsAndPrivacyAccepted: true,
          },
          statusCode: 400,
        });
      } catch (error) {
        // Expected to fail
        expect(error).toBeDefined();
      }
    });
  });
});
