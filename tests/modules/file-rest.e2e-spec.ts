import { HttpExceptionLogFilter, RoleEnum, TestHelper } from '@lenne.tech/nest-server';
import { Test, TestingModule } from '@nestjs/testing';
import { createHash } from 'crypto';
import fs = require('fs');
import { MongoClient, ObjectId } from 'mongodb';
import os = require('os');
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

  // Per-run private directory for upload fixtures (see beforeAll)
  let fixtureDir: string;

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

      // Upload fixtures need a real path on disk (TestHelper takes file paths, not
      // buffers). They must not live next to this spec: the cleanup below is skipped
      // whenever an upload throws, and every such run left a stray .txt in the source
      // tree. mkdtemp gives each run its own 0700 directory, so concurrent runs — the
      // e2e run governor allows several machine-wide — cannot collide on a fixed name,
      // and no other user can pre-create a symlink at the fixture path.
      fixtureDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'nss-file-rest-'));
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
    // Remove the fixture directory. Unlike the previous inline unlink this also runs
    // when a test threw, so a failed run cannot leave fixtures behind.
    if (fixtureDir) {
      await fs.promises.rm(fixtureDir, { force: true, recursive: true });
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
      const password = `${random}P1!`;
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

      // Get user from database. findOne returns null when nothing matches, and
      // toBeDefined() would pass on null — assert not-null instead.
      const user = await db.collection('users').findOne({ email: input.email });
      expect(user).not.toBeNull();

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
  // Tests for file handling via REST
  // ===================================================================================================================

  it('uploadFileViaREST', async () => {
    const filename = `${Math.random().toString(36).substring(7)}.txt`;
    fileContent = 'Hello REST';

    // Set paths (fixtureDir is per-run and removed in afterAll, so no unlink here)
    const local = path.join(fixtureDir, filename);

    // Write and send file. Flag 'wx' fails instead of following a pre-existing symlink.
    await fs.promises.writeFile(local, fileContent, { flag: 'wx' });
    const res = await testHelper.rest('/files/upload', {
      attachments: { file: local },
      cookies: users[0].token,
      statusCode: 201,
    });

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
    const res = await testHelper.download(`/files/id/${fileInfo.id}`, { cookies: users[0].token });
    expect(res.statusCode).toEqual(200);
    expect(res.data).toEqual(fileContent);
  });

  // ===================================================================================================================
  // Download access control (nest-server 11.33.0)
  //
  // `GET /files/id/:id` and `GET /files/:filename` are inherited from
  // CoreFileController and are no longer public. Two layers decide:
  //
  //   1. `file.downloadRoles` (config.env.ts) — widened here to S_USER, so any
  //      signed-in caller may REACH the route. Anonymous callers get 401.
  //   2. `FileService.checkRights()` — own file (metadata.ownerId) or ADMIN.
  //      A refusal answers 404, deliberately identical to an unknown id, so the
  //      endpoint cannot be used to probe which files exist.
  //
  // This file was uploaded through the ADMIN endpoint and carries no owner, so
  // users[1] (a plain signed-in user) must not reach it.
  // ===================================================================================================================

  it('rejects an anonymous download', async () => {
    const res = await testHelper.download(`/files/id/${fileInfo.id}`);
    // Exactly 401, never 403: an SPA auth layer branches on 401 to log the user out,
    // so conflating the two hides a real regression.
    expect(res.statusCode).toEqual(401);
  });

  it('rejects a download of a foreign file for a non-admin user', async () => {
    const res = await testHelper.download(`/files/id/${fileInfo.id}`, { cookies: users[1].token });
    // 404, not 403 — checkRights() refused, and a refusal must not confirm the id.
    expect(res.statusCode).toEqual(404);
  });

  it('rejects a download by filename for a non-admin user', async () => {
    const res = await testHelper.download(`/files/${fileInfo.filename}`, { cookies: users[1].token });
    expect(res.statusCode).toEqual(404);
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
  // Permission tests
  //
  // The admin endpoints are guarded by @Roles(RoleEnum.ADMIN) (file.controller.ts).
  // users[0] was promoted to ADMIN in prepareUsers; users[1] stays a plain user, so
  // it is the least-privilege probe. Without these the suite only ever exercised the
  // happy path as an admin and would not notice a dropped guard.
  // ===================================================================================================================

  describe('permissions', () => {
    // A syntactically valid id that does not exist — the guard must reject before the
    // handler ever looks it up, so the response must not depend on the id existing.
    const foreignId = '000000000000000000000000';
    let probeFile: string;

    beforeAll(async () => {
      // The attachment has to exist on disk for the request to be built at all;
      // the point of these tests is that it must never be stored.
      probeFile = path.join(fixtureDir, 'permission-probe.txt');
      await fs.promises.writeFile(probeFile, 'must not be stored', { flag: 'wx' });
    });

    it('rejects upload without authentication', async () => {
      await testHelper.rest('/files/upload', {
        attachments: { file: probeFile },
        method: 'POST',
        statusCode: 401,
      });
    });

    it('rejects upload for a non-admin user', async () => {
      await testHelper.rest('/files/upload', {
        attachments: { file: probeFile },
        cookies: users[1].token,
        method: 'POST',
        statusCode: 403,
      });
    });

    it('rejects file info without authentication', async () => {
      await testHelper.rest(`/files/info/${foreignId}`, { statusCode: 401 });
    });

    it('rejects file info for a non-admin user', async () => {
      await testHelper.rest(`/files/info/${foreignId}`, { cookies: users[1].token, statusCode: 403 });
    });

    it('rejects delete for a non-admin user', async () => {
      await testHelper.rest(`/files/${foreignId}`, {
        cookies: users[1].token,
        method: 'DELETE',
        statusCode: 403,
      });
    });
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
