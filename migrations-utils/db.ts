/**
 * Legacy compatibility layer for old migrations
 * Provides backward-compatible wrappers for @lenne.tech/nest-server migration helpers
 */

import {
  createMigrationStore,
  getDb as nestServerGetDb,
  uploadFileToGridFS,
} from '@lenne.tech/nest-server';

import config from '../src/config.env';

// Re-exports that don't need wrapping
export { createMigrationStore, uploadFileToGridFS };

// Compatibility wrapper - injects MongoDB URL from config automatically
// Allows existing migrations to call getDb() without parameters
export const getDb = async () => {
  return nestServerGetDb(config.mongoose.uri);
};
