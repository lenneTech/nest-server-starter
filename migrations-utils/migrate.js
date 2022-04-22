const migrate = require('migrate');
const serverEnv = require('../src/config.env');
const { MongoStateStore } = require('@nodepit/migrate-state-store-mongodb');
const nodeEnv = process.env['NODE' + '_ENV'];

const MONGO_URL =
  nodeEnv && serverEnv.config[nodeEnv] ? serverEnv.config[nodeEnv].mongoose.uri : serverEnv.config.local.mongoose.uri;

const COLLECTION_NAME = 'migrations';

module.exports = class MyMongoStateStore extends MongoStateStore {
  constructor() {
    super({ uri: MONGO_URL, collectionName: COLLECTION_NAME });
  }
};
