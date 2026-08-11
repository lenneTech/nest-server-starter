import { HttpExceptionLogFilter, TestHelper } from '@lenne.tech/nest-server';
import { Test, TestingModule } from '@nestjs/testing';
import { createHash } from 'crypto';
import fs = require('fs');
import { MongoClient, ObjectId } from 'mongodb';
import os = require('os');
import path = require('path');

import envConfig from '../../src/config.env';
import { imports, ServerModule } from '../../src/server/server.module';

/**
 * Avatar upload (e2e)
 *
 * This endpoint had no test at all, and two things about it changed with
 * nest-server 11.33.0:
 *
 * 1. The bytes go into the CENTRAL file storage (GridFS/S3) instead of a
 *    pod-local `staticAssets/avatars` directory that only one replica could read
 *    and a restart discarded. `user.avatar` is therefore a FILE ID now, served
 *    via `GET /files/id/:id` — not a filename under the static assets prefix.
 * 2. That download route is role-gated. This project widens `file.downloadRoles`
 *    to `S_USER` and authorizes per file in `FileService.checkRights()`, so the
 *    uploader can fetch their OWN avatar and nobody else's.
 *
 * The last assertion is the one that matters: it proves the two halves fit
 * together. `downloadRoles` alone would let any signed-in user read every file;
 * `checkRights()` alone could never fire behind the default `[ADMIN]` gate.
 */
function hashPassword(password: string): string {
  if (!envConfig.sha256) {
    return password;
  }
  return createHash('sha256').update(password).digest('hex');
}

/** A minimal but real PNG header — the endpoint filters on mimetype and extension */
const PNG_HEADER = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');

describe('Avatar REST (e2e)', () => {
  let app;
  let connection: MongoClient;
  let db;
  let fixtureDir: string;
  let testHelper: TestHelper;

  const users: { email: string; id?: string; password: string; token?: string }[] = [];

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [...imports, ServerModule],
      providers: [{ provide: 'PUB_SUB', useValue: { publish: async () => {} } }],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalFilters(new HttpExceptionLogFilter());
    app.setBaseViewsDir(envConfig.templates.path);
    app.setViewEngine(envConfig.templates.engine);
    await app.init();
    testHelper = new TestHelper(app);

    connection = await MongoClient.connect(envConfig.mongoose.uri);
    db = connection.db();

    // Fixtures live outside the repository: the cleanup below is skipped whenever an
    // upload throws, and every such run would otherwise leave a stray .png behind.
    fixtureDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'nss-avatar-'));
  });

  afterAll(async () => {
    for (const user of users) {
      if (user.id) {
        try {
          await db.collection('users').deleteOne({ _id: new ObjectId(user.id) });
        } catch {
          // Ignore cleanup errors
        }
      }
    }
    if (fixtureDir) {
      await fs.promises.rm(fixtureDir, { force: true, recursive: true });
    }
    await connection.close();
    await app.close();
  });

  it('createAndSignInUsers', async () => {
    for (let i = 0; i < 2; i++) {
      const random = Math.random().toString(36).substring(7);
      const password = `${random}P1!`;

      await testHelper.rest('/iam/sign-up/email', {
        method: 'POST',
        payload: {
          email: `${random}@testusers.com`,
          name: `Test${random}`,
          password: hashPassword(password),
          termsAndPrivacyAccepted: true,
        },
        statusCode: 201,
      });

      const dbUser = await db.collection('users').findOne({ email: `${random}@testusers.com` });
      expect(dbUser).not.toBeNull();
      await db
        .collection('users')
        .updateOne({ _id: new ObjectId(dbUser._id) }, { $set: { emailVerified: true, verified: true } });

      const signIn = await testHelper.rest('/iam/sign-in/email', {
        method: 'POST',
        payload: { email: `${random}@testusers.com`, password: hashPassword(password) },
        returnResponse: true,
        statusCode: 200,
      });

      users.push({
        email: `${random}@testusers.com`,
        id: dbUser._id.toString(),
        password,
        token: TestHelper.extractSessionToken(signIn),
      });
    }

    expect(users).toHaveLength(2);
    expect(users[0].token).toBeDefined();
  });

  it('rejects an anonymous avatar upload', async () => {
    const local = path.join(fixtureDir, 'anonymous.png');
    await fs.promises.writeFile(local, PNG_HEADER, { flag: 'wx' });

    await testHelper.rest('/avatar/upload', {
      attachments: { file: local },
      method: 'POST',
      statusCode: 401,
    });
  });

  it('stores the avatar in the central file storage and lets its owner read it back', async () => {
    const local = path.join(fixtureDir, 'avatar.png');
    await fs.promises.writeFile(local, PNG_HEADER, { flag: 'wx' });

    const avatarId = await testHelper.rest('/avatar/upload', {
      attachments: { file: local },
      cookies: users[0].token,
      method: 'POST',
      statusCode: 201,
    });

    // A file id, not a filename — this is what changed for the frontend.
    expect(String(avatarId)).toMatch(/^[a-f0-9]{24}$/);

    const dbUser = await db.collection('users').findOne({ _id: new ObjectId(users[0].id) });
    expect(String(dbUser?.avatar)).toEqual(String(avatarId));

    // The bytes come from the central store, which is what lets a SECOND replica
    // serve them. A pod-local static-assets path could not.
    const download = await testHelper.download(`/files/id/${avatarId}`, { cookies: users[0].token });
    expect(download.statusCode).toEqual(200);

    // ...but only for the owner. users[1] passes the S_USER role gate and is then
    // refused by checkRights() — 404, because a refusal must not confirm the id.
    const foreign = await testHelper.download(`/files/id/${avatarId}`, { cookies: users[1].token });
    expect(foreign.statusCode).toEqual(404);

    // And not at all without a session.
    const anonymous = await testHelper.download(`/files/id/${avatarId}`);
    expect(anonymous.statusCode).toEqual(401);
  });

  it('replaces the previous avatar and deletes the orphaned file', async () => {
    const previous = (await db.collection('users').findOne({ _id: new ObjectId(users[0].id) }))?.avatar;
    expect(previous).toBeDefined();

    const local = path.join(fixtureDir, 'avatar-2.png');
    await fs.promises.writeFile(local, PNG_HEADER, { flag: 'wx' });

    const avatarId = await testHelper.rest('/avatar/upload', {
      attachments: { file: local },
      cookies: users[0].token,
      method: 'POST',
      statusCode: 201,
    });

    expect(String(avatarId)).not.toEqual(String(previous));

    // The replaced file is removed from the store rather than orphaned there
    const orphan = await db.collection('fs.files').findOne({ _id: new ObjectId(String(previous)) });
    expect(orphan).toBeNull();

    // Clean up the current avatar
    await db.collection('fs.files').deleteOne({ _id: new ObjectId(String(avatarId)) });
    await db.collection('fs.chunks').deleteMany({ files_id: new ObjectId(String(avatarId)) });
  });
});
