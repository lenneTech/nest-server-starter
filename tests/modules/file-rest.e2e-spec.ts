import { HttpExceptionLogFilter, RoleEnum, TestHelper } from '@lenne.tech/nest-server';
import { Test, TestingModule } from '@nestjs/testing';
import { createHash } from 'crypto';
import fs = require('fs');
import { MongoClient, ObjectId } from 'mongodb';
import path = require('path');

import envConfig from '../../src/config.env';
import { FileInfo } from '../../src/server/modules/file/file-info.model';
import { User } from '../../src/server/modules/user/user.model';
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

describe('File Module REST (e2e)', () => {
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
  let fileInfo: FileInfo;
  let fileContent: string;

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
    // Clean up test users
    for (const user of users) {
      if (user.id) {
        try {
          await db.collection('users').deleteOne({ _id: new ObjectId(user.id) });
        } catch {
          // Ignore cleanup errors
        }
      }
    }
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
    const userCount = 2;
    for (let i = 0; i < userCount; i++) {
      const random = Math.random().toString(36).substring(7);
      const password = `${random  }P1!`;
      const input = {
        email: `${random}@testusers.com`,
        name: `Test${random}`,
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
  // Tests for file handling via REST
  // ===================================================================================================================

  it('uploadFileViaREST', async () => {
    const filename = `${Math.random().toString(36).substring(7)}.txt`;
    fileContent = 'Hello REST';

    // Set paths
    const local = path.join(__dirname, filename);

    // Write and send file
    await fs.promises.writeFile(local, fileContent);
    const res = await testHelper.rest('/files/upload', {
      attachments: { file: local },
      cookies: users[0].token,
      statusCode: 201,
    });

    // Remove file
    await fs.promises.unlink(local);

    // Test response
    expect(res.id.length).toBeGreaterThan(0);
    expect(res.filename).toEqual(filename);

    // Set file info
    fileInfo = res;
  });

  it('getFileInfoForRESTFile', async () => {
    const res = await testHelper.rest(`/files/info/${fileInfo.id}`, { cookies: users[0].token });
    expect(res.id).toEqual(fileInfo.id);
    expect(res.filename).toEqual(fileInfo.filename);
  });

  it('downloadRESTFile', async () => {
    const res = await testHelper.download(`/files/id/${fileInfo.id}`, users[0].token);
    expect(res.statusCode).toEqual(200);
    expect(res.data).toEqual(fileContent);
  });

  it('deleteRESTFile', async () => {
    const res = await testHelper.rest(`/files/${fileInfo.id}`, { cookies: users[0].token, method: 'DELETE' });
    expect(res.id).toEqual(fileInfo.id);
  });

  it('getRESTFileInfo', async () => {
    const res = await testHelper.rest(`/files/info/${fileInfo.id}`, { cookies: users[0].token });
    expect(res).toEqual(null);
  });

  // ===================================================================================================================
  // Clean up tests
  // ===================================================================================================================

  /**
   * Delete users via direct DB operations
   */
  it('deleteUsers', async () => {
    for (const user of users) {
      await db.collection('users').deleteOne({ _id: new ObjectId(user.id) });
    }
  });
});
