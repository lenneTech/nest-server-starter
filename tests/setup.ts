/*
 * Vitest setup file (runs in every e2e fork BEFORE the test files — and therefore before
 * `config.env.ts` — are imported).
 *
 * Per-worker database isolation.
 *
 * `tests/global-setup.ts` gives each RUN one database (`…-run-<ts>-p<pid>`) via
 * `NSC__MONGOOSE__URI`, and the e2e config runs spec files in PARALLEL forks
 * (`fileParallelism: true`). All those forks would otherwise share that one database — so a spec
 * that mutates a GLOBAL collection (e.g. clearing BetterAuth's `jwks` signing keys) mid-run would
 * corrupt every other spec running at the same time, producing spurious 401s.
 *
 * Appending the vitest pool id here gives each CONCURRENT fork its own database
 * (`…-run-<ts>-p<pid>-w<N>`). Files that share a fork run sequentially (safe); files in different
 * forks can no longer collide.
 *
 * Cleanup is already handled by `db-lifecycle.reporter.ts`: it drops every database whose name
 * starts with the run DB name — which matches these `-w<N>` forks — on a passing run, and collects
 * them as stale (dead pid / age cap) otherwise. An externally pinned URI (CI service container) is
 * left untouched.
 *
 * On PostgreSQL the same name goes into NSC__DATABASE__URL and NSC__DATABASE__OWNER_URL, and the
 * database is created here, as the owner role: unlike MongoDB, PostgreSQL does not create a
 * database on first use. A file that runs after another one in the same fork finds it and keeps it,
 * as on MongoDB.
 */
import { RUN_DB_PATTERN } from './db-lifecycle.reporter.js';
import {
  fitTestDbName,
  openPostgresTestServer,
  postgresDatabaseName,
  postgresRole,
  testDatabaseKind,
  withPostgresDatabase,
} from './test-database-server.js';

const poolId = process.env.VITEST_POOL_ID || process.env.VITEST_WORKER_ID || '0';

if (testDatabaseKind() === 'postgres') {
  const ownerUrl = process.env.NSC__DATABASE__OWNER_URL as string;
  const appUrl = process.env.NSC__DATABASE__URL as string;
  const runDbName = postgresDatabaseName(ownerUrl);
  if (RUN_DB_PATTERN.test(runDbName)) {
    const workerDbName = fitTestDbName(`${runDbName}-w${poolId}`);
    const server = await openPostgresTestServer(ownerUrl);
    try {
      await server.create(workerDbName, postgresRole(appUrl));
    } finally {
      await server.close();
    }
    process.env.NSC__DATABASE__OWNER_URL = withPostgresDatabase(ownerUrl, workerDbName);
    process.env.NSC__DATABASE__URL = withPostgresDatabase(appUrl, workerDbName);
  }
} else if (process.env.NSC__MONGOOSE__URI && !/-w\d+(\?|$)/.test(process.env.NSC__MONGOOSE__URI)) {
  // Insert the suffix before the query string (…/dbname?opts → …/dbname-wN?opts).
  process.env.NSC__MONGOOSE__URI = process.env.NSC__MONGOOSE__URI.replace(/(\/[^/?]+)(\?|$)/, `$1-w${poolId}$2`);
}
