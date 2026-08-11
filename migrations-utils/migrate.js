const { createMigrationStore } = require('@lenne.tech/nest-server');

const { resolveMongoUri } = require('./mongo-uri');

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
module.exports = createMigrationStore(
  resolveMongoUri(),
  'migrations', // optional, default is 'migrations'
);
