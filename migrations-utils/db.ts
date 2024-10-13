import * as fs from 'fs';
import { GridFSBucket, MongoClient, ObjectId } from 'mongodb';
import * as path from 'path';

import config from '../src/config.env';

const MONGO_URL = config.mongoose.uri;

/**
 * Get database
 */
export const getDb = async () => {
  const client: MongoClient = await MongoClient.connect(MONGO_URL);
  return client.db();
};

/**
 * Upload file to GridFS
 */
export const uploadFile = async (
  relativePath,
  options?: { bucketName?: string; filename?: string },
): Promise<ObjectId> => {
  const { bucketName, filename } = {
    bucketName: 'fs',
    filename: relativePath.split('/')[relativePath.split('/').length - 1],
    ...options,
  };
  return new Promise<ObjectId>(async (resolve, reject) => {
    const db = (await MongoClient.connect(MONGO_URL)).db();
    const bucket = new GridFSBucket(db, { bucketName });
    const writeStream = bucket.openUploadStream(filename);
    const rs = fs.createReadStream(path.resolve(__dirname, relativePath)).pipe(writeStream);
    rs.on('finish', () => {
      resolve(writeStream.id);
    });
    rs.on('error', err => reject(err));
  });
};
