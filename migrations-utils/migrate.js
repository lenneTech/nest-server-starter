const migrate = require('migrate');
const { MongoStateStore } = require('@nodepit/migrate-state-store-mongodb');

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

const COLLECTION_NAME = 'migrations';

module.exports = class MyMongoStateStore extends MongoStateStore {
  constructor() {
    super({ uri: MONGO_URL, collectionName: COLLECTION_NAME });
  }
};
