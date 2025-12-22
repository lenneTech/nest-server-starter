import { HttpExceptionLogFilter, RoleEnum, TestGraphQLType, TestHelper } from '@lenne.tech/nest-server';
import { Test, TestingModule } from '@nestjs/testing';
import { PubSub } from 'graphql-subscriptions';
import { Db, MongoClient, ObjectId } from 'mongodb';
import * as tus from 'tus-js-client';

import envConfig from '../../src/config.env';
import { User } from '../../src/server/modules/user/user.model';
import { UserService } from '../../src/server/modules/user/user.service';
import { imports, ServerModule } from '../../src/server/server.module';

// =====================================================================================================================
// Types & Interfaces
// =====================================================================================================================

interface GridFsFile {
  _id: ObjectId;
  contentType: string;
  filename: string;
  length: number;
  metadata?: Record<string, unknown>;
}

interface TusClientUploadOptions {
  chunkSize?: number;
  content: Buffer | string;
  filename: string;
  filetype?: string;
  onProgress?: (bytesUploaded: number, bytesTotal: number) => void;
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

// =====================================================================================================================
// Constants
// =====================================================================================================================

const TUS_HEADERS = {
  CONTENT_TYPE: 'application/offset+octet-stream',
  RESUMABLE: '1.0.0',
} as const;

const GRIDFS_MIGRATION_TIMEOUT = 5000;
const GRIDFS_MIGRATION_INTERVAL = 100;

// =====================================================================================================================
// Test Suite
// =====================================================================================================================

describe('TUS Module (e2e)', () => {
  // Debug flags
  const log = false; // eslint-disable-line unused-imports/no-unused-vars
  const logError = true; // eslint-disable-line unused-imports/no-unused-vars

  // Test environment
  let app;
  let testHelper: TestHelper;
  let baseUrl: string;

  // Database
  let connection: MongoClient;
  let db: Db;

  // Services
  let userService: UserService;

  // Test data
  const users: Partial<User & { token: string }>[] = [];
  const uploadedFiles: TusUploadResult[] = [];

  // ===================================================================================================================
  // Helper Functions
  // ===================================================================================================================

  /**
   * Encode TUS metadata as base64 string
   */
  function encodeMetadata(metadata: Record<string, string>): string {
    return Object.entries(metadata)
      .map(([key, value]) => `${key} ${Buffer.from(value).toString('base64')}`)
      .join(',');
  }

  /**
   * Create a TUS upload via POST request
   */
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

  /**
   * Upload data to an existing TUS upload via PATCH
   */
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

  /**
   * Get upload status via HEAD request
   */
  async function getTusUploadStatus(location: string): Promise<{ length: number; offset: number; response: Response }> {
    const response = await fetch(location, {
      headers: { 'Tus-Resumable': TUS_HEADERS.RESUMABLE },
      method: 'HEAD',
    });

    return {
      length: parseInt(response.headers.get('upload-length') || '0', 10),
      offset: parseInt(response.headers.get('upload-offset') || '0', 10),
      response,
    };
  }

  /**
   * Terminate a TUS upload via DELETE
   */
  async function terminateTusUpload(location: string): Promise<Response> {
    return fetch(location, {
      headers: { 'Tus-Resumable': TUS_HEADERS.RESUMABLE },
      method: 'DELETE',
    });
  }

  /**
   * Wait for file to appear in GridFS with retry mechanism
   */
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

  /**
   * Upload file using tus-js-client library
   */
  function uploadViaTusClient(options: TusClientUploadOptions): Promise<TusUploadResult> {
    const fileBuffer = typeof options.content === 'string' ? Buffer.from(options.content) : options.content;

    return new Promise((resolve, reject) => {
      const upload = new tus.Upload(fileBuffer as unknown as Blob, {
        chunkSize: options.chunkSize || 1024 * 1024,
        endpoint: `${baseUrl}/tus`,
        metadata: {
          filename: options.filename,
          filetype: options.filetype || 'text/plain',
        },
        onError: (error) => {
          reject(error);
        },
        onProgress: options.onProgress,
        onSuccess: async () => {
          const gridFsFile = await waitForGridFsMigration(options.filename);
          resolve({
            filename: options.filename,
            gridFsId: gridFsFile?._id?.toString(),
            location: upload.url || undefined,
          });
        },
        retryDelays: [0, 1000, 3000],
        uploadSize: fileBuffer.length,
      });

      upload.start();
    });
  }

  /**
   * Complete a full TUS upload (create + patch) via fetch
   */
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
  // Setup & Teardown
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
          { provide: 'PUB_SUB', useValue: new PubSub() },
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
      userService = moduleFixture.get(UserService);

      // Database connection
      connection = await MongoClient.connect(envConfig.mongoose.uri);
      db = connection.db();
    } catch (e) {
      console.error('beforeAllError', e);
    }
  });

  afterAll(async () => {
    // Clean up uploaded files from GridFS
    for (const file of uploadedFiles) {
      if (file.gridFsId) {
        try {
          const fileId = new ObjectId(file.gridFsId);
          await db.collection('fs.files').deleteOne({ _id: fileId });
          await db.collection('fs.chunks').deleteMany({ files_id: fileId });
        } catch {
          // Ignore cleanup errors
        }
      }
    }

    await connection.close();
    await app.close();
  });

  // ===================================================================================================================
  // User Setup
  // ===================================================================================================================

  it('createAndVerifyUsers', async () => {
    const userCount = 2;

    for (let i = 0; i < userCount; i++) {
      const random = Math.random().toString(36).substring(7);
      const input = {
        email: `${random}@testusers.com`,
        firstName: `Test${random}`,
        lastName: `User${random}`,
        password: random,
      };

      const res: any = await testHelper.graphQl({
        arguments: { input },
        fields: [{ user: ['id', 'email', 'firstName', 'lastName'] }],
        name: 'signUp',
        type: TestGraphQLType.MUTATION,
      });

      res.user.password = input.password;
      users.push(res.user);

      await db.collection('users').updateOne(
        { _id: new ObjectId(res.id) },
        { $set: { verified: true } },
      );
    }

    expect(users.length).toBeGreaterThanOrEqual(userCount);
  });

  it('signInUsers', async () => {
    for (const user of users) {
      const res: any = await testHelper.graphQl({
        arguments: {
          input: { email: user.email, password: user.password },
        },
        fields: ['token', { user: ['id', 'email'] }],
        name: 'signIn',
        type: TestGraphQLType.MUTATION,
      });

      expect(res.user.id).toEqual(user.id);
      user.token = res.token;
    }
  });

  it('prepareUsers', async () => {
    await db.collection('users').findOneAndUpdate(
      { _id: new ObjectId(users[0].id) },
      { $set: { roles: [RoleEnum.ADMIN] } },
    );
  });

  // ===================================================================================================================
  // TUS Server Capabilities
  // ===================================================================================================================

  describe('TUS Server Capabilities', () => {
    it('should return TUS server capabilities via OPTIONS', async () => {
      const response = await fetch(`${baseUrl}/tus`, { method: 'OPTIONS' });

      expect(response.status).toBe(204);
      expect(response.headers.get('tus-resumable')).toBe('1.0.0');
      expect(response.headers.get('tus-version')).toContain('1.0.0');

      const extensions = response.headers.get('tus-extension');
      expect(extensions).toContain('creation');
      expect(extensions).toContain('termination');
    });

    it('should return max file size in capabilities', async () => {
      const response = await fetch(`${baseUrl}/tus`, { method: 'OPTIONS' });
      const maxSize = response.headers.get('tus-max-size');

      expect(maxSize).toBeDefined();
      expect(parseInt(maxSize!, 10)).toBeGreaterThan(0);
    });
  });

  // ===================================================================================================================
  // TUS Upload Creation
  // ===================================================================================================================

  describe('TUS Upload Creation', () => {
    it('should create a new upload via POST', async () => {
      const filename = `tus-create-test-${Date.now()}.txt`;
      const { location, response } = await createTusUpload({
        filename,
        size: 10,
      });

      expect(response.status).toBe(201);
      expect(location).toContain('/tus/');

      uploadedFiles.push({ filename, location });

      // Cleanup
      await terminateTusUpload(location);
    });

    it('should reject upload without Tus-Resumable header', async () => {
      const response = await fetch(`${baseUrl}/tus`, {
        headers: {
          'Content-Length': '0',
          'Upload-Length': '100',
        },
        method: 'POST',
      });

      expect(response.status).toBe(412);
    });
  });

  // ===================================================================================================================
  // TUS Upload Status (HEAD)
  // ===================================================================================================================

  describe('TUS Upload Status', () => {
    it('should return upload offset via HEAD', async () => {
      const filename = `tus-head-test-${Date.now()}.txt`;
      const fileSize = 21;

      const { location } = await createTusUpload({ filename, size: fileSize });
      const { length, offset, response } = await getTusUploadStatus(location);

      expect(response.status).toBe(200);
      expect(offset).toBe(0);
      expect(length).toBe(fileSize);

      await terminateTusUpload(location);
    });
  });

  // ===================================================================================================================
  // TUS Upload Continuation (PATCH)
  // ===================================================================================================================

  describe('TUS Upload Continuation', () => {
    it('should upload data via PATCH and complete the upload', async () => {
      const filename = `tus-patch-test-${Date.now()}.txt`;
      const content = 'Complete upload via PATCH';

      const result = await completeTusUpload(filename, content);

      expect(result.gridFsId).toBeDefined();
      uploadedFiles.push(result);
    });

    it('should support chunked uploads', async () => {
      const filename = `tus-chunked-test-${Date.now()}.txt`;
      const chunk1 = 'First chunk of data. ';
      const chunk2 = 'Second chunk of data.';
      const totalSize = Buffer.byteLength(chunk1) + Buffer.byteLength(chunk2);

      const { location, response: createResponse } = await createTusUpload({
        filename,
        size: totalSize,
      });
      expect(createResponse.status).toBe(201);

      // Upload first chunk
      const { newOffset: offset1, response: patch1 } = await patchTusUpload(location, chunk1, 0);
      expect(patch1.status).toBe(204);
      expect(offset1).toBe(Buffer.byteLength(chunk1));

      // Upload second chunk
      const { newOffset: offset2, response: patch2 } = await patchTusUpload(location, chunk2, offset1);
      expect(patch2.status).toBe(204);
      expect(offset2).toBe(totalSize);

      const gridFsFile = await waitForGridFsMigration(filename);
      expect(gridFsFile).toBeDefined();
      expect(gridFsFile!.length).toBe(totalSize);

      uploadedFiles.push({ filename, gridFsId: gridFsFile!._id.toString() });
    });
  });

  // ===================================================================================================================
  // TUS Upload Termination (DELETE)
  // ===================================================================================================================

  describe('TUS Upload Termination', () => {
    it('should terminate an incomplete upload via DELETE', async () => {
      const filename = `tus-delete-test-${Date.now()}.txt`;

      const { location } = await createTusUpload({ filename, size: 100 });
      const deleteResponse = await terminateTusUpload(location);

      expect(deleteResponse.status).toBe(204);

      // Verify upload no longer exists
      const { response: headResponse } = await getTusUploadStatus(location);
      expect(headResponse.status).toBe(404);
    });
  });

  // ===================================================================================================================
  // TUS Upload Resume
  // ===================================================================================================================

  describe('TUS Upload Resume', () => {
    it('should resume an interrupted upload', async () => {
      const filename = `tus-resume-test-${Date.now()}.txt`;
      const part1 = 'First part of content. ';
      const part2 = 'Second part of content.';
      const totalContent = part1 + part2;
      const totalSize = Buffer.byteLength(totalContent);

      // Create upload
      const { location } = await createTusUpload({ filename, size: totalSize });

      // Upload first part (simulating interrupted upload)
      const { newOffset } = await patchTusUpload(location, part1, 0);
      expect(newOffset).toBe(Buffer.byteLength(part1));

      // Check upload status (simulating client reconnect)
      const { offset: currentOffset } = await getTusUploadStatus(location);
      expect(currentOffset).toBe(Buffer.byteLength(part1));

      // Resume upload from where it left off
      const { response: resumeResponse } = await patchTusUpload(location, part2, currentOffset);
      expect(resumeResponse.status).toBe(204);

      // Verify file is complete in GridFS
      const gridFsFile = await waitForGridFsMigration(filename);
      expect(gridFsFile).toBeDefined();
      expect(gridFsFile!.length).toBe(totalSize);

      uploadedFiles.push({ filename, gridFsId: gridFsFile!._id.toString() });
    });
  });

  // ===================================================================================================================
  // tus-js-client Integration
  // ===================================================================================================================

  describe('tus-js-client Integration', () => {
    it('should complete upload using tus-js-client', async () => {
      const filename = `tus-client-test-${Date.now()}.txt`;
      const result = await uploadViaTusClient({
        content: 'Uploaded via tus-js-client library',
        filename,
      });

      expect(result.location).toBeDefined();
      expect(result.gridFsId).toBeDefined();

      uploadedFiles.push(result);
    });

    it('should upload multiple files in parallel', async () => {
      const files = [
        { content: 'First file content', name: `tus-multi-1-${Date.now()}.txt` },
        { content: 'Second file content', name: `tus-multi-2-${Date.now()}.txt` },
        { content: 'Third file content', name: `tus-multi-3-${Date.now()}.txt` },
      ];

      const results = await Promise.all(
        files.map(file => uploadViaTusClient({
          content: file.content,
          filename: file.name,
        })),
      );

      for (const result of results) {
        expect(result.gridFsId).toBeDefined();
        uploadedFiles.push(result);
      }
    });

    it('should track upload progress', async () => {
      const filename = `tus-progress-test-${Date.now()}.txt`;
      const content = 'A'.repeat(1024); // 1KB file
      const progressUpdates: number[] = [];

      const result = await uploadViaTusClient({
        chunkSize: 256, // Small chunks to get multiple progress updates
        content,
        filename,
        onProgress: (bytesUploaded, bytesTotal) => {
          const percentage = Math.round((bytesUploaded / bytesTotal) * 100);
          progressUpdates.push(percentage);
        },
      });

      expect(result.gridFsId).toBeDefined();
      expect(progressUpdates.length).toBeGreaterThan(0);
      expect(progressUpdates[progressUpdates.length - 1]).toBe(100);

      uploadedFiles.push(result);
    });
  });

  // ===================================================================================================================
  // FileController Download Integration
  // ===================================================================================================================

  describe('FileController Download Integration', () => {
    let testFile: { content: string; filename: string; gridFsId: string };

    beforeAll(async () => {
      const filename = `tus-download-test-${Date.now()}.txt`;
      const content = 'This file was uploaded via TUS and will be downloaded via FileController';

      const result = await uploadViaTusClient({ content, filename });
      testFile = { content, filename, gridFsId: result.gridFsId! };
      uploadedFiles.push(result);
    });

    it('should download TUS-uploaded file by ID', async () => {
      const res = await testHelper.download(`/files/id/${testFile.gridFsId}`, users[0].token);

      expect(res.statusCode).toBe(200);
      expect(res.data).toBe(testFile.content);
    });

    it('should download TUS-uploaded file by filename', async () => {
      const res = await testHelper.download(`/files/${testFile.filename}`, users[0].token);

      expect(res.statusCode).toBe(200);
      expect(res.data).toBe(testFile.content);
    });

    it('should get file info via GraphQL', async () => {
      const res: any = await testHelper.graphQl(
        {
          arguments: { filename: testFile.filename },
          fields: ['id', 'filename', 'contentType', 'length'],
          name: 'getFileInfo',
          type: TestGraphQLType.QUERY,
        },
        { token: users[0].token },
      );

      expect(res.id).toBe(testFile.gridFsId);
      expect(res.filename).toBe(testFile.filename);
      expect(res.contentType).toBe('text/plain');
      expect(res.length).toBe(Buffer.byteLength(testFile.content));
    });

    it('should get file info via REST', async () => {
      const res = await testHelper.rest(`/files/info/${testFile.gridFsId}`, {
        token: users[0].token,
      });

      expect(res.id).toBe(testFile.gridFsId);
      expect(res.filename).toBe(testFile.filename);
      expect(res.contentType).toBe('text/plain');
    });
  });

  // ===================================================================================================================
  // Binary File Uploads
  // ===================================================================================================================

  describe('Binary File Uploads', () => {
    it('should upload and download binary data correctly', async () => {
      const filename = `tus-binary-test-${Date.now()}.bin`;
      const binaryData = Buffer.from([0x00, 0x01, 0x02, 0xff, 0xfe, 0xfd, 0x80, 0x7f]);

      const result = await uploadViaTusClient({
        content: binaryData,
        filename,
        filetype: 'application/octet-stream',
      });

      expect(result.gridFsId).toBeDefined();
      uploadedFiles.push(result);

      // Download and verify binary content
      const downloadedBuffer = await testHelper.downloadBuffer(
        `/files/id/${result.gridFsId}`,
        users[0].token,
      );
      expect(Buffer.compare(downloadedBuffer, binaryData)).toBe(0);
    });

    it('should handle large file uploads', async () => {
      const filename = `tus-large-test-${Date.now()}.bin`;
      // 100KB file with random-ish data
      const largeData = Buffer.alloc(100 * 1024);
      for (let i = 0; i < largeData.length; i++) {
        largeData[i] = i % 256;
      }

      const result = await uploadViaTusClient({
        chunkSize: 32 * 1024, // 32KB chunks
        content: largeData,
        filename,
        filetype: 'application/octet-stream',
      });

      expect(result.gridFsId).toBeDefined();
      uploadedFiles.push(result);

      // Verify file size in GridFS
      const gridFsFile = await db.collection<GridFsFile>('fs.files').findOne({
        _id: new ObjectId(result.gridFsId!),
      });
      expect(gridFsFile!.length).toBe(largeData.length);
    });
  });

  // ===================================================================================================================
  // Error Handling
  // ===================================================================================================================

  describe('Error Handling', () => {
    it('should return 404 for non-existent upload ID', async () => {
      const { response } = await getTusUploadStatus(`${baseUrl}/tus/non-existent-id`);
      expect(response.status).toBe(404);
    });

    it('should reject PATCH with incorrect offset', async () => {
      const filename = `tus-wrong-offset-${Date.now()}.txt`;
      const { location } = await createTusUpload({ filename, size: 100 });

      const { response } = await patchTusUpload(location, 'test data', 50); // Wrong offset

      expect(response.status).toBe(409); // Conflict

      await terminateTusUpload(location);
    });

    it('should reject PATCH exceeding upload length', async () => {
      const filename = `tus-exceed-length-${Date.now()}.txt`;
      const declaredSize = 10;
      const actualContent = 'This content is much longer than declared';

      const { location } = await createTusUpload({ filename, size: declaredSize });
      const { response } = await patchTusUpload(location, actualContent, 0);

      // Server should reject data exceeding declared size
      expect([400, 413]).toContain(response.status);

      await terminateTusUpload(location);
    });
  });

  // ===================================================================================================================
  // Metadata Tests
  // ===================================================================================================================

  describe('Metadata Handling', () => {
    it('should preserve TUS metadata in GridFS', async () => {
      const filename = `tus-metadata-test-${Date.now()}.txt`;
      const content = 'File with metadata';

      const result = await uploadViaTusClient({
        content,
        filename,
        filetype: 'text/plain',
      });

      expect(result.gridFsId).toBeDefined();
      uploadedFiles.push(result);

      // Check metadata in GridFS
      const gridFsFile = await db.collection<GridFsFile>('fs.files').findOne({
        _id: new ObjectId(result.gridFsId!),
      });

      expect(gridFsFile!.metadata).toBeDefined();
      expect(gridFsFile!.metadata!.tusUploadId).toBeDefined();
      expect(gridFsFile!.metadata!.uploadedAt).toBeDefined();
    });
  });

  // ===================================================================================================================
  // Cleanup
  // ===================================================================================================================

  it('deleteUsers', async () => {
    await userService.setRoles(users[users.length - 1].id, ['admin']);

    for (const user of users) {
      const res: any = await testHelper.graphQl(
        {
          arguments: { id: user.id },
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
