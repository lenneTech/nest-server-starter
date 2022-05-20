import config from '../src/config.env';
const migrate = require('migrate');
const { MongoStateStore } = require('@nodepit/migrate-state-store-mongodb');

const MONGO_URL = config.mongoose.uri;

const COLLECTION_NAME = 'migrations';

module.exports = class MyMongoStateStore extends MongoStateStore {
  constructor() {
    super({ uri: MONGO_URL, collectionName: COLLECTION_NAME });
  }
};
