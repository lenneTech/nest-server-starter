/**
 * Legacy compatibility layer for old migrations
 * Re-exports database and migration helpers from @lenne.tech/nest-server
 */
export { createMigrationStore, getDb, uploadFileToGridFS } from '@lenne.tech/nest-server';
