import { MongoClient, GridFSBucket, ObjectId } from 'mongodb';
import * as fs from 'fs';
import * as path from 'path';

let MONGO_URL;
if (process.env['NODE' + '_ENV'] === 'production') {
  MONGO_URL = 'mongodb://overlay_mongo1/2bfit';
} else if (process.env['NODE' + '_ENV'] === 'preview') {
  MONGO_URL = 'mongodb://overlay_mongo1/2bfit-preview';
} else if (process.env['NODE' + '_ENV'] === 'test') {
  MONGO_URL = 'mongodb://overlay_mongo1/2bfit-test';
} else if (process.env['NODE' + '_ENV'] === 'develop') {
  MONGO_URL = 'mongodb://overlay_mongo1/2bfit-develop';
} else {
  MONGO_URL = 'mongodb://localhost/2bfit-dev';
}

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
