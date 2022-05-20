import { MongoClient, GridFSBucket, ObjectId } from 'mongodb';
import * as fs from 'fs';
import * as path from 'path';
import config from '../src/config.env';

const MONGO_URL = config.mongoose.uri;

export const getDb = async () => {
  const client: MongoClient = await MongoClient.connect(MONGO_URL);
  return client.db();
};

export const uploadFile = async (relativePath, bucketName = 'fs') => {
  return new Promise<ObjectId>(async (resolve, reject) => {
    const db = (await MongoClient.connect(MONGO_URL)).db();
    const bucket = new GridFSBucket(db, { bucketName });
    const fileName = relativePath.split('/')[relativePath.split('/').length - 1];
    const writeStream = bucket.openUploadStream(fileName);
    const rs = fs.createReadStream(path.resolve(__dirname, relativePath)).pipe(writeStream);
    rs.on('finish', () => {
      resolve(writeStream.id);
    });
    rs.on('error', (err) => reject(err));
  });
};
