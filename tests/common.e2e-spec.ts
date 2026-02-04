import {
  ConfigService,
  HttpExceptionLogFilter,
  TestHelper,
} from '@lenne.tech/nest-server';
import { Test, TestingModule } from '@nestjs/testing';
import { createHash } from 'crypto';
import { PubSub } from 'graphql-subscriptions';
import { MongoClient, ObjectId } from 'mongodb';

import envConfig from '../src/config.env';
import metaData = require('../src/meta.json');
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

describe('Common (e2e)', () => {
  // To enable debugging, include these flags in the options of the request you want to debug
  const log = true; // eslint-disable-line unused-imports/no-unused-vars
  const logError = true; // eslint-disable-line unused-imports/no-unused-vars

  // Test environment properties
  let app;
  let testHelper: TestHelper;

  // database
  let connection;
  let db;

  // Services
  let configService: ConfigService; // eslint-disable-line unused-imports/no-unused-vars

  // Global vars for admin user
  let gAdminId: string;
  let gAdminEmail: string;
  let gAdminPassword: string;
  let gAdminSessionToken: string;

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
      testHelper = new TestHelper(app);
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
    await connection.close();
    await app.close();
  });

  // ===================================================================================================================
  // Tests
  // ===================================================================================================================

  /**
   * Health check
   */
  it('health check', async () => {
    if (envConfig.healthCheck?.enabled) {
      const res: any = await testHelper.rest('/health-check');
      expect(res.status).toBe('ok');
    }
  });

  /**
   * Get Schema
   */
  it('get schema', async () => {
    const res: any = await testHelper.rest('/graphql', {
      headers: {
        'content-type': 'application/json',
        'x-apollo-operation-name': 'IntrospectionQuery',
      },
      method: 'POST',
      payload:
        '{"operationName":"IntrospectionQuery","variables":{},"query":"query IntrospectionQuery {\\n  __schema {\\n    queryType {\\n      name\\n    }\\n    mutationType {\\n      name\\n    }\\n    subscriptionType {\\n      name\\n    }\\n    types {\\n      ...FullType\\n    }\\n    directives {\\n      name\\n      description\\n      locations\\n      args {\\n        ...InputValue\\n      }\\n    }\\n  }\\n}\\n\\nfragment FullType on __Type {\\n  kind\\n  name\\n  description\\n  fields(includeDeprecated: true) {\\n    name\\n    description\\n    args {\\n      ...InputValue\\n    }\\n    type {\\n      ...TypeRef\\n    }\\n    isDeprecated\\n    deprecationReason\\n  }\\n  inputFields {\\n    ...InputValue\\n  }\\n  interfaces {\\n    ...TypeRef\\n  }\\n  enumValues(includeDeprecated: true) {\\n    name\\n    description\\n    isDeprecated\\n    deprecationReason\\n  }\\n  possibleTypes {\\n    ...TypeRef\\n  }\\n}\\n\\nfragment InputValue on __InputValue {\\n  name\\n  description\\n  type {\\n    ...TypeRef\\n  }\\n  defaultValue\\n}\\n\\nfragment TypeRef on __Type {\\n  kind\\n  name\\n  ofType {\\n    kind\\n    name\\n    ofType {\\n      kind\\n      name\\n      ofType {\\n        kind\\n        name\\n        ofType {\\n          kind\\n          name\\n          ofType {\\n            kind\\n            name\\n            ofType {\\n              kind\\n              name\\n              ofType {\\n                kind\\n                name\\n              }\\n            }\\n          }\\n        }\\n      }\\n    }\\n  }\\n}\\n"}',
    });
    expect(res.data.__schema.queryType.name).toEqual('Query');
  });

  /**
   * Get index
   */
  it('get index', async () => {
    const res: any = await testHelper.rest('');
    expect(res.includes(`Welcome to ${metaData.name}`)).toBe(true);
    expect(res.includes(`${envConfig.env} environment`)).toBe(true);
    expect(res.includes(`version ${metaData.version}`)).toBe(true);
  });

  /**
   * Get config endpoint without token should return 401
   *
   * With IAM (Better-Auth) and the global RolesGuard, the @Roles decorator
   * enforces authentication. Without a token, the endpoint returns 401.
   */
  it('get config without token', async () => {
    await testHelper.rest('/config', { statusCode: 401 });
  });

  /**
   * Test IAM sign-in endpoint returns error for missing credentials
   */
  it('Try IAM sign in without credentials', async () => {
    try {
      await testHelper.rest('/iam/sign-in/email', { method: 'POST', payload: {}, statusCode: 400 });
    } catch (error: any) {
      // IAM returns 400 for missing/invalid input
      expect(error).toBeDefined();
    }
  });

  /**
   * Test IAM sign-in with invalid credentials
   */
  it('Validates IAM sign-in with invalid credentials', async () => {
    try {
      await testHelper.rest('/iam/sign-in/email', {
        method: 'POST',
        payload: { email: 'invalid@test.com', password: hashPassword('wrongpassword') },
        statusCode: 401,
      });
    } catch (error: any) {
      // IAM returns 401 for invalid credentials
      expect(error).toBeDefined();
    }
  });

  /**
   * Prepare admin user for config tests
   */
  it('prepare admin user for config tests', async () => {
    // Create admin user via IAM
    const random = Math.random().toString(36).substring(7);
    gAdminPassword = `${random  }A1!`;
    gAdminEmail = `admin-${random}@testusers.com`;

    const signUpRes = await testHelper.rest('/iam/sign-up/email', {
      method: 'POST',
      payload: {
        email: gAdminEmail,
        name: 'Admin',
        password: hashPassword(gAdminPassword),
        termsAndPrivacyAccepted: true,
      },
      statusCode: 201,
    });

    // Get user ID from response or database
    if (signUpRes.user?.id) {
      gAdminId = signUpRes.user.id;
    } else {
      const user = await db.collection('users').findOne({ email: gAdminEmail });
      if (user) gAdminId = user._id.toString();
    }

    // Set admin role and verify email
    await db.collection('users').findOneAndUpdate(
      { _id: new ObjectId(gAdminId) },
      { $set: { emailVerified: true, roles: ['admin'], verified: true } },
    );

    // Sign in via IAM
    const signInRes = await testHelper.rest('/iam/sign-in/email', {
      method: 'POST',
      payload: {
        email: gAdminEmail,
        password: hashPassword(gAdminPassword),
      },
      returnResponse: true,
      statusCode: 200,
    });
    gAdminSessionToken = TestHelper.extractSessionToken(signInRes);
  });

  /**
   * Get config with non-admin user should return 403
   *
   * With IAM (Better-Auth) and the global RolesGuard, the @Roles decorator
   * enforces role-based access. Non-admin users get 403 Forbidden.
   */
  it('get config without admin rights should fail', async () => {
    // Create non-admin user via IAM
    const randomUser = Math.random().toString(36).substring(7);
    const password = `${randomUser  }U1!`;
    const email = `user-${randomUser}@testusers.com`;

    const signUpRes = await testHelper.rest('/iam/sign-up/email', {
      method: 'POST',
      payload: {
        email,
        name: 'User',
        password: hashPassword(password),
        termsAndPrivacyAccepted: true,
      },
      statusCode: 201,
    });

    // Get user ID from response or database
    let userId: string;
    if (signUpRes.user?.id) {
      userId = signUpRes.user.id;
    } else {
      const user = await db.collection('users').findOne({ email });
      if (user) userId = user._id.toString();
    }

    // Verify user email (but not admin)
    await db.collection('users').updateOne(
      { _id: new ObjectId(userId) },
      { $set: { emailVerified: true, verified: true } },
    );

    // Sign in via IAM
    const signInRes = await testHelper.rest('/iam/sign-in/email', {
      method: 'POST',
      payload: {
        email,
        password: hashPassword(password),
      },
      returnResponse: true,
      statusCode: 200,
    });
    const userSessionToken = TestHelper.extractSessionToken(signInRes);

    // Non-admin users should get 403 Forbidden
    await testHelper.rest('/config', { cookies: userSessionToken, statusCode: 403 });

    // Clean up
    await db.collection('users').deleteOne({ _id: new ObjectId(userId) });
  });

  /**
   * Get config with token
   */
  it('get config with admin rights', async () => {
    const res: any = await testHelper.rest('/config', { cookies: gAdminSessionToken });
    expect(res.env).toEqual(envConfig.env);
  });

  // ===================================================================================================================
  // ErrorCodeModule Tests - i18n Error Translations API
  // ===================================================================================================================

  /**
   * Get German error translations
   */
  it('get error translations in German', async () => {
    const res: any = await testHelper.rest('/api/i18n/errors/de');

    // Should return errors object
    expect(res).toHaveProperty('errors');
    expect(typeof res.errors).toBe('object');

    // Should contain nest-server core errors (LTNS_*)
    expect(res.errors).toHaveProperty('LTNS_0001'); // USER_NOT_FOUND
    expect(res.errors.LTNS_0001).toBe('Benutzer wurde nicht gefunden.');
    expect(res.errors).toHaveProperty('LTNS_0100'); // UNAUTHORIZED
    expect(res.errors.LTNS_0100).toBe('Sie sind nicht angemeldet.');

    // Should contain project-specific errors (PROJ_*)
    expect(res.errors).toHaveProperty('PROJ_0001'); // PROJECT_NOT_FOUND
    expect(res.errors.PROJ_0001).toBe('Projekt wurde nicht gefunden.');
    expect(res.errors).toHaveProperty('PROJ_0002'); // PROJECT_ALREADY_EXISTS
    expect(res.errors.PROJ_0002).toBe('Ein Projekt mit diesem Namen existiert bereits.');
    expect(res.errors).toHaveProperty('PROJ_0100'); // OPERATION_NOT_PERMITTED
    expect(res.errors.PROJ_0100).toBe('Diese Operation ist nicht erlaubt.');
  });

  /**
   * Get English error translations
   */
  it('get error translations in English', async () => {
    const res: any = await testHelper.rest('/api/i18n/errors/en');

    // Should return errors object
    expect(res).toHaveProperty('errors');
    expect(typeof res.errors).toBe('object');

    // Should contain nest-server core errors (LTNS_*)
    expect(res.errors).toHaveProperty('LTNS_0001'); // USER_NOT_FOUND
    expect(res.errors.LTNS_0001).toBe('User not found.');
    expect(res.errors).toHaveProperty('LTNS_0100'); // UNAUTHORIZED
    expect(res.errors.LTNS_0100).toBe('You are not logged in.');

    // Should contain project-specific errors (PROJ_*)
    expect(res.errors).toHaveProperty('PROJ_0001'); // PROJECT_NOT_FOUND
    expect(res.errors.PROJ_0001).toBe('Project was not found.');
    expect(res.errors).toHaveProperty('PROJ_0002'); // PROJECT_ALREADY_EXISTS
    expect(res.errors.PROJ_0002).toBe('A project with this name already exists.');
    expect(res.errors).toHaveProperty('PROJ_0101'); // QUOTA_EXCEEDED
    expect(res.errors.PROJ_0101).toBe('The quota has been exceeded.');
  });

  /**
   * Clean up admin user
   */
  it('clean up admin user', async () => {
    await db.collection('users').deleteOne({ _id: new ObjectId(gAdminId) });
  });
});
