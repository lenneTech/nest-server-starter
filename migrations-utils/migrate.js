const { createMigrationStore } = require('@lenne.tech/nest-server');

const config = require('../src/config.env');

module.exports = createMigrationStore(
  config.default.mongoose.uri,
  'migrations' // optional, default is 'migrations'
);
