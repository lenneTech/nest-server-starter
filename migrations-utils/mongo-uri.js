/**
 * Resolve the MongoDB URI for migration utilities.
 *
 * Resolution order:
 * 1. config.env.ts (local development via ts-node — full config automatisms:
 *    environment selection, NSC__* merge, NEST_SERVER_CONFIG)
 * 2. NSC__MONGOOSE__URI environment variable (Docker production where the
 *    TypeScript source is not available at runtime)
 *
 * Throws if neither source yields a usable URI so misconfiguration surfaces
 * loudly instead of silently running against the wrong database.
 */
function resolveMongoUri() {
  let config;
  try {
    config = require('../src/config.env');
  } catch (err) {
    // Only fall back to env var when the source truly is not available
    // (Docker production). Any other error (syntax, missing transitive import,
    // throw during module init) must surface loudly instead of being masked.
    if (err && err.code !== 'MODULE_NOT_FOUND') {
      throw err;
    }
    if (!process.env.NSC__MONGOOSE__URI) {
      throw new Error('MongoDB URI not available. Set NSC__MONGOOSE__URI or ensure config.env.ts is loadable.');
    }
    return process.env.NSC__MONGOOSE__URI;
  }

  const uri = (config.default || config).mongoose?.uri;
  if (!uri) {
    throw new Error('config.env.ts loaded but mongoose.uri is empty');
  }
  return uri;
}

module.exports = { resolveMongoUri };
