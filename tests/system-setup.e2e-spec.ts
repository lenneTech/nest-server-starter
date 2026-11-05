import { HttpExceptionLogFilter, TestHelper } from '@lenne.tech/nest-server';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test, TestingModule } from '@nestjs/testing';
import { createHash } from 'crypto';
import { Db, MongoClient } from 'mongodb';

import { deriveTestDbUri } from './db-lifecycle.reporter.js';

/**
 * System setup: the first administrator of a fresh instance, through the path the frontend's setup page takes
 *
 * nest-server 12.4.0 closes the anonymous `POST /system-setup/init` outside `local`, `ci` and `e2e` unless
 * `systemSetup.httpInit` opens it. Locally the setup page has to keep working: `GET /system-setup/status` must offer
 * the form (`needsSetup && httpInitEnabled`, no token), and the init must create an administrator who can sign in.
 * This spec boots the starter's own ServerModule with the suite's configuration, which is a local environment.
 *
 * The deployed side is pinned in src/config.env.spec.ts: which policy every environment of the matrix resolves to, and
 * that the NSC__SYSTEM_SETUP__* variables reach the configuration. The 403 responses are nest-server's, tested there.
 *
 * ISOLATION: the setup needs a database without users, and the per-worker database (tests/setup.ts) is shared with the
 * other spec files of the same fork. This spec derives a database of its own from it BEFORE the configuration is
 * imported (hence the dynamic imports below) and drops it afterwards. `deriveTestDbUri()` keeps the name within
 * MongoDB's 63 characters: a project generated from this starter puts its own name in front of `-e2e-run-…`, and a
 * longer project name plus `-setup` would otherwise be refused on every run.
 */
const INHERITED_DB_URI = process.env.NSC__MONGOOSE__URI;
const SETUP_DB_URI = deriveTestDbUri('setup');
process.env.NSC__MONGOOSE__URI = SETUP_DB_URI;

const ADMIN = { email: 'first-admin@system-setup.test', name: 'First Admin', password: 'FirstAdmin123!' };

describe('System setup through the setup page (e2e)', () => {
  let app: NestExpressApplication;
  let testHelper: TestHelper;
  let connection: MongoClient;
  let db: Db;
  let sha256 = false;

  beforeAll(async () => {
    const { default: envConfig } = await import('../src/config.env.js');
    const { imports, ServerModule } = await import('../src/server/server.module.js');
    // Everything below depends on this database being the one the application uses
    expect(envConfig.mongoose.uri).toBe(SETUP_DB_URI);
    sha256 = !!envConfig.sha256;

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [...imports, ServerModule],
      providers: [{ provide: 'PUB_SUB', useValue: { publish: async () => {} } }],
    }).compile();
    app = moduleFixture.createNestApplication<NestExpressApplication>();
    app.useGlobalFilters(new HttpExceptionLogFilter());
    app.setBaseViewsDir(envConfig.templates.path);
    app.setViewEngine(envConfig.templates.engine);
    await app.init();
    testHelper = new TestHelper(app);

    connection = await MongoClient.connect(SETUP_DB_URI);
    db = connection.db();
  });

  afterAll(async () => {
    // App first: dropping while the app is alive races against async initialisation re-creating the database
    await app?.close();
    try {
      await db?.dropDatabase();
    } catch {
      // The reporter collects it as a leftover of this run
    }
    await connection?.close();
    // Assigning undefined would store the string "undefined"
    if (INHERITED_DB_URI === undefined) {
      delete process.env.NSC__MONGOOSE__URI;
    } else {
      process.env.NSC__MONGOOSE__URI = INHERITED_DB_URI;
    }
  });

  it('starts without users', async () => {
    expect(await db.collection('users').countDocuments({})).toBe(0);
  });

  it('offers the setup form: setup needed, HTTP init open, no token', async () => {
    const status = await testHelper.rest('/system-setup/status', { method: 'GET', statusCode: 200 });
    expect(status).toMatchObject({
      betterAuthEnabled: true,
      httpInitEnabled: true,
      httpInitTokenRequired: false,
      needsSetup: true,
    });
  });

  it('creates the first administrator from the form', async () => {
    const result = await testHelper.rest('/system-setup/init', { method: 'POST', payload: ADMIN, statusCode: 201 });
    expect(result).toMatchObject({ email: ADMIN.email, success: true });
  });

  it('lets the administrator sign in with the password from the form', async () => {
    const password = sha256 ? createHash('sha256').update(ADMIN.password).digest('hex') : ADMIN.password;
    const res = await testHelper.rest('/iam/sign-in/email', {
      method: 'POST',
      payload: { email: ADMIN.email, password },
      returnResponse: true,
      statusCode: 200,
    });
    expect(res.body?.user?.roles).toContain('admin');
  });

  it('closes the setup once the administrator exists', async () => {
    const status = await testHelper.rest('/system-setup/status', { method: 'GET', statusCode: 200 });
    expect(status).toMatchObject({ needsSetup: false });

    const refused = await testHelper.rest('/system-setup/init', {
      method: 'POST',
      payload: { ...ADMIN, email: 'second-admin@system-setup.test' },
      statusCode: 403,
    });
    expect(refused.message).toContain('LTNS_0050');
    expect(await db.collection('users').countDocuments({})).toBe(1);
  });
});
