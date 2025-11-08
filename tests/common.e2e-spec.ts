import {
  ConfigService,
  HttpExceptionLogFilter,
  TestGraphQLType,
  TestHelper,
} from '@lenne.tech/nest-server';
import { Test, TestingModule } from '@nestjs/testing';
import { PubSub } from 'graphql-subscriptions';
import { MongoClient, ObjectId } from 'mongodb';

import envConfig from '../src/config.env';
import metaData = require('../src/meta.json');
import { UserService } from '../src/server/modules/user/user.service';
import { imports, ServerModule } from '../src/server/server.module';

describe('Common (e2e)', () => {
  // To enable debugging, include these flags in the options of the request you want to debug
  const log = true;
  const logError = true;

  // Test environment properties
  let app;
  let testHelper: TestHelper;

  // database
  let connection;
  let db;

  // Services
  let userService: UserService;
  let configService: ConfigService;

  // Global vars for admin user
  let gAdminId: string;
  let gAdminEmail: string;
  let gAdminPassword: string;
  let gAdminToken: string;

  // ===================================================================================================================
  // Preparations
  // ===================================================================================================================

  /**
   * Before all tests
   */
  beforeAll(async () => {
    // Indicates that cookies are enabled
    if (envConfig.cookies) {
      console.error('NOTE: Cookie handling is enabled. The tests with tokens will fail!');
    }
    try {
      // Start server for testing
      const moduleFixture: TestingModule = await Test.createTestingModule({
        imports: [
          ...imports,
          ServerModule,
        ],
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
      testHelper = new TestHelper(app);
      userService = moduleFixture.get(UserService);
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
   * Get config without token should fail
   */
  it('get config without token', async () => {
    await testHelper.rest('/config', { statusCode: 401 });
  });

  /**
   * Test if swagger error-structure mirrors the actual error structure
   */
  it('Try sign in without input', async () => {
    const res: any = await testHelper.rest('/auth/signin', { log, logError, method: 'POST', statusCode: 400 });
    expect(res).toMatchObject({
      message: 'Missing input',
      name: 'BadRequestException',
      response: {
        error: 'Bad Request',
        message: 'Missing input',
        statusCode: 400,
      },
      status: 400,
    });
  });

  /**
   * Test if swagger error-structure mirrors the actual error structure
   */
  it('Validates common-error structure', async () => {
    const res: any = await testHelper.rest('/auth/signin', { method: 'POST', payload: {}, statusCode: 400 });

    // Test for generic object equality
    expect(res).toMatchObject({
      message: expect.any(String),
      name: expect.any(String),
      options: expect.any(Object),
      response: {
        email: {
          isEmail: expect.any(String),
          isNotEmpty: expect.any(String),
        },
        password: {
          isNotEmpty: expect.any(String),
          isString: expect.any(String),
        },
      },
      status: expect.any(Number),
    });

    // Test for concrete values
    expect(res).toMatchObject({
      message: expect.stringContaining('Validation failed'),
      name: 'BadRequestException',
      options: {},
      response: {
        email: {
          isEmail: 'email must be an email',
          isNotEmpty: 'email should not be empty',
        },
        message: expect.stringContaining('Validation failed'),
        password: {
          isNotEmpty: 'password should not be empty',
          isString: 'password must be a string',
        },
      },
      status: 400,
    });
  });

  /**
   * Prepare admin user for config tests
   */
  it('prepare admin user for config tests', async () => {
    // Create admin user
    gAdminPassword = Math.random().toString(36).substring(7);
    gAdminEmail = `${gAdminPassword}@admin-test.com`;
    const res: any = await testHelper.graphQl({
      arguments: {
        input: {
          email: gAdminEmail,
          firstName: 'Admin',
          password: gAdminPassword,
        },
      },
      fields: [{ user: ['id', 'email'] }],
      name: 'signUp',
      type: TestGraphQLType.MUTATION,
    });
    gAdminId = res.user.id;

    // Set admin role and verify
    await db.collection('users').findOneAndUpdate(
      { _id: new ObjectId(gAdminId) },
      { $set: { roles: ['admin'], verified: true } },
    );

    // Sign in
    const signInRes: any = await testHelper.graphQl({
      arguments: {
        input: {
          email: gAdminEmail,
          password: gAdminPassword,
        },
      },
      fields: ['token', { user: ['id', 'email'] }],
      name: 'signIn',
      type: TestGraphQLType.MUTATION,
    });
    gAdminToken = signInRes.token;
  });

  /**
   * Get config without admin rights should fail
   */
  it('get config without admin rights should fail', async () => {
    // Create non-admin user
    const password = Math.random().toString(36).substring(7);
    const email = `${password}@user-test.com`;
    const userRes: any = await testHelper.graphQl({
      arguments: {
        input: {
          email,
          firstName: 'User',
          password,
        },
      },
      fields: [{ user: ['id', 'email'] }],
      name: 'signUp',
      type: TestGraphQLType.MUTATION,
    });

    // Verify user
    await db.collection('users').updateOne(
      { _id: new ObjectId(userRes.user.id) },
      { $set: { verified: true } },
    );

    // Sign in
    const signInRes: any = await testHelper.graphQl({
      arguments: {
        input: {
          email,
          password,
        },
      },
      fields: ['token', { user: ['id', 'email'] }],
      name: 'signIn',
      type: TestGraphQLType.MUTATION,
    });

    // Try to access config without admin rights
    await testHelper.rest('/config', { statusCode: 401, token: signInRes.token });

    // Clean up
    await userService.delete(userRes.user.id);
  });

  /**
   * Get config with token
   */
  it('get config with admin rights', async () => {
    const res: any = await testHelper.rest('/config', { token: gAdminToken });
    expect(res.env).toEqual(envConfig.env);
  });

  /**
   * Clean up admin user
   */
  it('clean up admin user', async () => {
    await userService.delete(gAdminId);
  });
});