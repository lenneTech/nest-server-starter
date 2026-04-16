const { createMigrationStore } = require('@lenne.tech/nest-server');

/**
 * The MongoDB URI is read from the NSC__MONGOOSE__URI environment variable
 * so migrations work in Docker production where config.env.ts is not available
 * as a TypeScript source file.
 */
const MONGO_URL = process.env.NSC__MONGOOSE__URI || 'mongodb://127.0.0.1/test';

module.exports = createMigrationStore(
  MONGO_URL,
  'migrations', // optional, default is 'migrations'
);
