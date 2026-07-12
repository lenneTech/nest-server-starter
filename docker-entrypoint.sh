#!/bin/sh
# Docker entrypoint for the API container.
#
# Runs pending database migrations (BEST-EFFORT) before starting the NestJS server.
#
# Migrations are compiled to JavaScript by `pnpm run build` (tsconfig.build.json
# includes migrations/ + migrations-utils/), so the production image runs them
# without a TypeScript transpiler — ts-node is a devDependency and gets pruned.
#
# The migrate CLI is looked up in both supported layouts:
#   npm mode     /app/node_modules/.bin/migrate  (bin of @lenne.tech/nest-server)
#   vendor mode  $APP_DIST/bin/migrate.js        (shim copied into dist by copy:bin)
#
# The step must NEVER block server start:
#   - No migrations bundled? Nothing to do — a fresh database gets schema and indexes
#     from Mongoose at boot, and first-run is handled by the SystemSetup module.
#   - No CLI in the image? Skip instead of crash-looping the container.
#   - CLI fails? Degrade to a warning, not a boot failure.
#
# Test seams (default to the real values in the container):
#   APP_DIST     compiled output (/app/projects/api/dist in a monorepo, /app/dist standalone)
#   MIGRATE_BIN  path to the npm-mode migrate CLI (overridden in unit tests)
#   SERVER_CMD   command used to start the server (overridden in unit tests)
set -e

DIST="${APP_DIST:-/app/dist}"
MIGRATE_BIN="${MIGRATE_BIN:-/app/node_modules/.bin/migrate}"
VENDOR_MIGRATE="$DIST/bin/migrate.js"

run_migrations() {
  "$@" up \
    --store "$DIST/migrations-utils/migrate.js" \
    --migrations-dir "$DIST/migrations" \
    && echo "[entrypoint] Migrations applied." \
    || echo "[entrypoint] WARNING: migration step failed — continuing to start server."
}

echo "[entrypoint] Database migrations (best-effort)..."
if [ ! -d "$DIST/migrations" ] || [ -z "$(ls -A "$DIST/migrations" 2>/dev/null)" ]; then
  echo "[entrypoint] no migrations bundled — skipping migrations."
elif [ -x "$MIGRATE_BIN" ]; then
  run_migrations "$MIGRATE_BIN"
elif [ -f "$VENDOR_MIGRATE" ]; then
  run_migrations node "$VENDOR_MIGRATE"
else
  echo "[entrypoint] migrate CLI not present in image — skipping migrations."
fi

echo "[entrypoint] Starting server..."
exec ${SERVER_CMD:-node "$DIST/src/main.js"}
