import { HttpExceptionLogFilter, RoleEnum, TestGraphQLType, TestHelper } from '@lenne.tech/nest-server';
import { Test, TestingModule } from '@nestjs/testing';
import { createHash } from 'crypto';
import fs = require('fs');
import { PubSub } from 'graphql-subscriptions';
import { VariableType } from 'json-to-graphql-query';
import { Db, MongoClient, ObjectId } from 'mongodb';
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

// =====================================================================================================================
// Helper Functions & Types for TUS
// =====================================================================================================================

interface GridFsFile {
  _id: ObjectId;
  contentType: string;
  filename: string;
  length: number;
  metadata?: Record<string, unknown>;
}

interface TusCreateOptions {
  filename: string;
  filetype?: string;
  size: number;
}

interface TusUploadResult {
  filename: string;
  gridFsId?: string;
  location?: string;
}

const TUS_HEADERS = {
  CONTENT_TYPE: 'application/offset+octet-stream',
  RESUMABLE: '1.0.0',
} as const;

const GRIDFS_MIGRATION_TIMEOUT = 5000;
const GRIDFS_MIGRATION_INTERVAL = 100;

describe('File Module GraphQL (e2e)', () => {
  // To enable debugging, include these flags in the options of the request you want to debug
  const log = true;
  const logError = true;

  // Test environment properties
  let app;
  let testHelper: TestHelper;
  let baseUrl: string;

  // database
  let connection: MongoClient;
  let db: Db;

  // Global vars
  const users: Partial<User & { token: string }>[] = [];
  let fileInfo: FileInfo;
  let fileContent: string;

  // TUS test data
  let tusTestFile: { content: string; filename: string; gridFsId: string };

  // ===================================================================================================================
  // TUS Helper Functions
  // ===================================================================================================================

  function encodeMetadata(metadata: Record<string, string>): string {
    return Object.entries(metadata)
      .map(([key, value]) => `${key} ${Buffer.from(value).toString('base64')}`)
      .join(',');
  }

  async function createTusUpload(options: TusCreateOptions): Promise<{ location: string; response: Response }> {
    const metadata = encodeMetadata({
      filename: options.filename,
      filetype: options.filetype || 'text/plain',
    });

    const response = await fetch(`${baseUrl}/tus`, {
      headers: {
        'Content-Length': '0',
        'Tus-Resumable': TUS_HEADERS.RESUMABLE,
        'Upload-Length': String(options.size),
        'Upload-Metadata': metadata,
      },
      method: 'POST',
    });

    return {
      location: response.headers.get('location') || '',
      response,
    };
  }

  async function patchTusUpload(
    location: string,
    data: string,
    offset: number = 0,
  ): Promise<{ newOffset: number; response: Response }> {
    const response = await fetch(location, {
      body: data,
      headers: {
        'Content-Length': String(Buffer.byteLength(data)),
        'Content-Type': TUS_HEADERS.CONTENT_TYPE,
        'Tus-Resumable': TUS_HEADERS.RESUMABLE,
        'Upload-Offset': String(offset),
      },
      method: 'PATCH',
    });

    const newOffset = parseInt(response.headers.get('upload-offset') || '0', 10);
    return { newOffset, response };
  }

  async function waitForGridFsMigration(
    filename: string,
    timeout: number = GRIDFS_MIGRATION_TIMEOUT,
  ): Promise<GridFsFile | null> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      const file = await db.collection<GridFsFile>('fs.files').findOne({ filename });
      if (file) {
        return file;
      }
      await new Promise(resolve => setTimeout(resolve, GRIDFS_MIGRATION_INTERVAL));
    }

    return null;
  }

  async function completeTusUpload(
    filename: string,
    content: string,
    filetype: string = 'text/plain',
  ): Promise<TusUploadResult> {
    const size = Buffer.byteLength(content);

    const { location, response: createResponse } = await createTusUpload({ filename, filetype, size });
    expect(createResponse.status).toBe(201);

    const { response: patchResponse } = await patchTusUpload(location, content);
    expect(patchResponse.status).toBe(204);

    const gridFsFile = await waitForGridFsMigration(filename);
    expect(gridFsFile).toBeDefined();

    return {
      filename,
      gridFsId: gridFsFile?._id?.toString(),
      location,
    };
  }

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
            useValue: new PubSub(),
          },
        ],
      }).compile();
      app = moduleFixture.createNestApplication();
      app.useGlobalFilters(new HttpExceptionLogFilter());
      app.setBaseViewsDir(envConfig.templates.path);
      app.setViewEngine(envConfig.templates.engine);
      await app.init();

      // Start HTTP server on random port
      const server = app.getHttpServer();
      await new Promise<void>((resolve) => {
        server.listen(0, () => {
          const address = server.address();
          baseUrl = `http://127.0.0.1:${(address as { port: number }).port}`;
          resolve();
        });
      });

      testHelper = new TestHelper(app);

      // Connection to database
      connection = await MongoClient.connect(envConfig.mongoose.uri);
      db = connection.db();
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

    // Clean up TUS test file from GridFS
    if (tusTestFile?.gridFsId) {
      try {
        const fileId = new ObjectId(tusTestFile.gridFsId);
        await db.collection('fs.files').deleteOne({ _id: fileId });
        await db.collection('fs.chunks').deleteMany({ files_id: fileId });
      } catch {
        // Ignore cleanup errors
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
  // Tests for file handling via GraphQL
  // ===================================================================================================================

  it('uploadFileViaGraphQL', async () => {
    const filename = `${Math.random().toString(36).substring(7)}.txt`;
    fileContent = 'Hello GraphQL';

    // Set paths
    const local = path.join(__dirname, filename);

    // Write and send file
    await fs.promises.writeFile(local, fileContent);
    const res: any = await testHelper.graphQl(
      {
        arguments: { file: new VariableType('file') },
        fields: ['id', 'filename'],
        name: 'uploadFile',
        type: TestGraphQLType.MUTATION,
        variables: { file: 'Upload!' },
      },
      { token: users[0].token, variables: { file: { type: 'attachment', value: local } } },
    );

    // Remove file
    await fs.promises.unlink(local);

    // Test response
    expect(res.id.length).toBeGreaterThan(0);
    expect(res.filename).toEqual(filename);

    // Set file info
    fileInfo = res;
  });

  it('getFileInfoForGraphQLFile', async () => {
    const res: any = await testHelper.graphQl(
      {
        arguments: { filename: fileInfo.filename },
        fields: ['id', 'filename'],
        name: 'getFileInfo',
        type: TestGraphQLType.QUERY,
      },
      { token: users[0].token },
    );
    expect(res.id).toEqual(fileInfo.id);
    expect(res.filename).toEqual(fileInfo.filename);
  });

  it('downloadGraphQLFile', async () => {
    const res = await testHelper.download(`/files/id/${fileInfo.id}`, users[0].token);
    expect(res.statusCode).toEqual(200);
    expect(res.data).toEqual(fileContent);
  });

  it('deleteGraphQLFile', async () => {
    const res: any = await testHelper.graphQl(
      {
        arguments: { filename: fileInfo.filename },
        fields: ['id'],
        name: 'deleteFile',
        type: TestGraphQLType.MUTATION,
      },
      { token: users[0].token },
    );
    expect(res.id).toEqual(fileInfo.id);
  });

  it('getGraphQLFileInfo', async () => {
    const res: any = await testHelper.graphQl(
      {
        arguments: { filename: fileInfo.filename },
        fields: ['id', 'filename'],
        name: 'getFileInfo',
        type: TestGraphQLType.QUERY,
      },
      { token: users[0].token },
    );
    expect(res).toEqual(null);
  });

  it('uploadFilesViaGraphQL', async () => {
    // Set paths
    const local1 = path.join(__dirname, 'test1.txt');
    const local2 = path.join(__dirname, 'test2.txt');

    // Write and send files
    await fs.promises.writeFile(local1, 'Hello GraphQL 1');
    await fs.promises.writeFile(local2, 'Hello GraphQL 2');
    const res: any = await testHelper.graphQl(
      {
        arguments: { files: new VariableType('files') },
        fields: ['id', 'filename'],
        name: 'uploadFiles',
        type: TestGraphQLType.MUTATION,
        variables: { files: '[Upload!]!' },
      },
      { token: users[0].token, variables: { files: { type: 'attachment', value: [local1, local2] } } },
    );

    // Remove local files
    await fs.promises.unlink(local1);
    await fs.promises.unlink(local2);

    // Test response - should return array of file info
    expect(Array.isArray(res)).toBe(true);
    expect(res.length).toBe(2);
    expect(res[0].id).toBeDefined();
    expect(res[0].filename).toBe('test1.txt');
    expect(res[1].id).toBeDefined();
    expect(res[1].filename).toBe('test2.txt');

    // Verify files exist in GridFS
    const file1 = await db.collection('fs.files').findOne({ _id: new ObjectId(res[0].id) });
    expect(file1).toBeDefined();
    const file2 = await db.collection('fs.files').findOne({ _id: new ObjectId(res[1].id) });
    expect(file2).toBeDefined();

    // Clean up - delete files from GridFS
    for (const file of res) {
      await db.collection('fs.files').deleteOne({ _id: new ObjectId(file.id) });
      await db.collection('fs.chunks').deleteMany({ files_id: new ObjectId(file.id) });
    }
  });

  // ===================================================================================================================
  // TUS-uploaded file: getFileInfo via GraphQL
  // ===================================================================================================================

  describe('TUS File - GraphQL getFileInfo', () => {
    it('should upload file via TUS', async () => {
      const filename = `tus-gql-test-${Date.now()}.txt`;
      const content = 'This file was uploaded via TUS and will be queried via GraphQL';

      const result = await completeTusUpload(filename, content);
      tusTestFile = { content, filename, gridFsId: result.gridFsId! };
    });

    it('should get TUS file info via GraphQL', async () => {
      const res: any = await testHelper.graphQl(
        {
          arguments: { filename: tusTestFile.filename },
          fields: ['id', 'filename', 'contentType', 'length'],
          name: 'getFileInfo',
          type: TestGraphQLType.QUERY,
        },
        { token: users[0].token },
      );

      expect(res.id).toBe(tusTestFile.gridFsId);
      expect(res.filename).toBe(tusTestFile.filename);
      expect(res.contentType).toBe('text/plain');
      expect(res.length).toBe(Buffer.byteLength(tusTestFile.content));
    });
  });

  // ===================================================================================================================
  // Clean up tests
  // ===================================================================================================================

  /**
   * Delete users via GraphQL
   */
  it('deleteUsers', async () => {
    // Add admin role to last user
    await db
      .collection('users')
      .findOneAndUpdate({ _id: new ObjectId(users[users.length - 1].id) }, { $set: { roles: ['admin'] } });

    for (const user of users) {
      const res: any = await testHelper.graphQl(
        {
          arguments: {
            id: user.id,
          },
          fields: ['id'],
          name: 'deleteUser',
          type: TestGraphQLType.MUTATION,
        },
        { token: users[users.length - 1].token },
      );
      expect(res.id).toEqual(user.id);
    }
  });
});
