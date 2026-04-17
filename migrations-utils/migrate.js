const { createMigrationStore } = require('@lenne.tech/nest-server');

const { resolveMongoUri } = require('./mongo-uri');

module.exports = createMigrationStore(
  resolveMongoUri(),
  'migrations', // optional, default is 'migrations'
);
