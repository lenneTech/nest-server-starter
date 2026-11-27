import { createMigrationStore } from '@lenne.tech/nest-server';

import { resolveMigrationStoreUri } from './database-url.js';

// Since nest-server 11.33.0 the third argument (lock collection) defaults to
// 'migrations_lock', and `migrate up` acquires that lock around the whole run.
// That matters because docker-entrypoint.sh migrates on EVERY boot: without a
// lock, N replicas starting together each read the same empty state and each
// apply the same migration. Waiters re-read the state inside the lock, so they
// find nothing pending. A dead holder is recovered automatically (15s heartbeat,
// 60s stale threshold, 15min bounded wait).
//
// With a single replica this costs one uncontended insert/delete per boot.
// Pass '' as the third argument to opt out of locking entirely.
//
// The URL decides the store: the MongoDB URI by default (state in the collection `migrations`), the OWNER role's
// URL on PostgreSQL (state in the table `lt_migrations`, locked by a transaction-scoped advisory lock instead of the
// lock collection). See database-url.js. A project that switches an existing deployment from MongoDB to PostgreSQL
// moves the state first (nest-server src/core/modules/migrate/README.md, "Move the state when you switch").
export default createMigrationStore(
  resolveMigrationStoreUri(),
  'migrations', // optional, default is 'migrations'
);
