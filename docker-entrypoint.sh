#!/bin/sh
# Docker entrypoint for the API container.
#
# Runs pending database migrations (BEST-EFFORT) before starting the NestJS server.
#
# The migration step must NEVER block server start:
#   - The `migrate` CLI at node_modules/.bin/migrate only exists in npm mode (it is
#     provided by @lenne.tech/nest-server's `migrate` bin). In vendor mode there is no
#     such bin, so the step is skipped instead of crash-looping the container.
#   - TypeScript migrations additionally need a runtime transpiler (ts-node, a
#     devDependency pruned from the production image), so even when the CLI exists the
#     run can fail — that must degrade to a warning, not a boot failure.
#   - A fresh database has nothing to migrate anyway: schema + indexes are created by
#     Mongoose at boot and first-run is handled by the SystemSetup module.
# Harden this step (compile migrations to JS, or run them from a maintenance job) if
# data migrations must run automatically on every deploy.
#
# Test seams (default to the real values in the container):
#   MIGRATE_BIN  path to the migrate CLI (overridden in unit tests)
#   SERVER_CMD   command used to start the server (overridden in unit tests)
set -e

MIGRATE_BIN="${MIGRATE_BIN:-/app/node_modules/.bin/migrate}"

echo "[entrypoint] Database migrations (best-effort)..."
if [ -x "$MIGRATE_BIN" ]; then
  "$MIGRATE_BIN" up \
    --store /app/dist/migrations-utils/migrate.js \
    --migrations-dir /app/dist/migrations \
    && echo "[entrypoint] Migrations applied." \
    || echo "[entrypoint] WARNING: migration step failed — continuing to start server."
else
  echo "[entrypoint] migrate CLI not present in image — skipping migrations."
fi

echo "[entrypoint] Starting server..."
exec ${SERVER_CMD:-node /app/dist/src/main.js}
