import { createRequire } from 'node:module';

import { resolveMongoUri } from './mongo-uri.js';

// Same reason as in mongo-uri.js: the migrate CLI needs the URL synchronously, and config.env.ts is loaded through
// the TypeScript loader's require hook in development.
const require = createRequire(import.meta.url);

/**
 * Resolve the URL the migration state store connects to — and through it, which store it is (nest-server's
 * createMigrationStore() picks it by the scheme).
 *
 * - MongoDB (the default): the `mongoose` URI, exactly as before (resolveMongoUri()); the state is the document in
 *   the collection `migrations`.
 * - PostgreSQL (`database` in config.env.ts, or NSC__DATABASE__*): the OWNER role's URL. Migrations change the schema
 *   and every row, so they run as the role that owns the tables; the state lives in the table `lt_migrations`.
 *
 * Resolution order as in mongo-uri.js: config.env.ts first (local development; in the image the compiled
 * dist/src/config.env.js, with the full NSC__* merge and the required-var check), the environment only where no
 * configuration is loadable.
 *
 * A migration created with `pnpm run migrate:create:sql` reads `process.env.NSC__DATABASE__OWNER_URL` itself. Locally
 * that variable is usually unset (config.env.ts carries the local URLs), so it is set here from the configuration:
 * the state and the migrations then always reach the same database.
 */
function resolveMigrationStoreUri() {
  let config;
  try {
    config = require('../src/config.env');
  } catch (err) {
    // Only a missing configuration falls back to the environment (see mongo-uri.js)
    if (err && err.code !== 'MODULE_NOT_FOUND') {
      throw err;
    }
    return process.env.NSC__DATABASE__OWNER_URL || resolveMongoUri();
  }

  const database = (config.default || config).database;
  if (database === undefined || database === false) {
    return resolveMongoUri();
  }
  const url = typeof database === 'string' ? database : database.url;
  if (/^mongodb(\+srv)?:/i.test(url ?? '')) {
    return url;
  }
  const ownerUrl = typeof database === 'object' ? database.ownerUrl : undefined;
  if (!ownerUrl) {
    throw new Error(
      'config.env.ts puts the default source on SQL but names no owner URL (database.ownerUrl / ' +
        'NSC__DATABASE__OWNER_URL). Migrations run as the role that owns the tables.',
    );
  }
  process.env.NSC__DATABASE__OWNER_URL ??= ownerUrl;
  return ownerUrl;
}

export { resolveMigrationStoreUri };
