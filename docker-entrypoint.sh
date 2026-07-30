#!/bin/sh
# Docker entrypoint for the API container.
#
# Runs pending database migrations before starting the NestJS server.
#
# Migrations are compiled to JavaScript by `pnpm run build` (tsconfig.build.json
# includes migrations/ + migrations-utils/), so the production image runs them
# without a TypeScript transpiler — ts-node is a devDependency and gets pruned.
#
# The migrate CLI is looked up in both supported layouts:
#   npm mode     /app/node_modules/.bin/migrate  (bin of @lenne.tech/nest-server)
#   vendor mode  $APP_DIST/bin/migrate.js        (shim copied into dist by copy:bin)
#
# A MISSING migration step never blocks server start:
#   - No migrations bundled? Nothing to do — a fresh database gets schema and indexes
#     from Mongoose at boot, and first-run is handled by the SystemSetup module.
#   - No CLI in the image? Skip instead of crash-looping the container.
#
# A FAILED migration is a policy decision, because both answers are defensible and the
# right one depends on the deployment: serving against a half-applied schema is how
# silent data corruption happens, but for an availability-first service a boot loop is
# worse than a stale schema. This template keeps the historical, availability-first
# default (`warn`) so an update changes nothing; set MIGRATE_FAILURE_POLICY=abort to
# refuse the start instead. @lenne.tech/nest-server's own entrypoint defaults to `abort`.
#
# Worth knowing before choosing: since nest-server 11.32.4 a seed migration that uploads
# an incomplete file to GridFS FAILS instead of silently storing a broken asset. Under
# `warn` that new signal reaches the container log and nothing else — the server starts
# and serves the broken file.
#
# Test seams (default to the real values in the container):
#   APP_DIST                compiled output (/app/projects/api/dist in a monorepo, /app/dist standalone)
#   MIGRATE_BIN             path to the npm-mode migrate CLI (overridden in unit tests)
#   SERVER_CMD              command used to start the server (overridden in unit tests)
#   MIGRATE_FAILURE_POLICY  what a FAILED migration does: `warn` (default) or `abort`
set -e

DIST="${APP_DIST:-/app/dist}"
MIGRATE_BIN="${MIGRATE_BIN:-/app/node_modules/.bin/migrate}"
VENDOR_MIGRATE="$DIST/bin/migrate.js"
MIGRATE_FAILURE_POLICY="${MIGRATE_FAILURE_POLICY:-warn}"

# Report a misspelled policy NOW rather than at failure time. A typo'd `abort` degrades
# to `warn`, i.e. the operator asked for the strict behaviour and silently got the loose
# one — and would only find out during the incident the setting was meant to catch.
case "$MIGRATE_FAILURE_POLICY" in
  abort | warn) ;;
  *)
    echo "[entrypoint] WARNING: unknown MIGRATE_FAILURE_POLICY '$MIGRATE_FAILURE_POLICY' — using 'warn'."
    MIGRATE_FAILURE_POLICY=warn
    ;;
esac

# `if/elif` rather than a `&& … || …` chain: with equal precedence and left association,
# a trailing `|| echo` swallows the exit status of everything to its left, so a failure
# would be reported and then treated as success by `set -e`.
run_migrations() {
  if "$@" up --store "$DIST/migrations-utils/migrate.js" --migrations-dir "$DIST/migrations"; then
    echo "[entrypoint] Migrations applied."
  elif [ "$MIGRATE_FAILURE_POLICY" = "abort" ]; then
    echo "[entrypoint] ERROR: migration step failed — refusing to start against a possibly half-applied schema."
    exit 1
  else
    echo "[entrypoint] WARNING: migration step failed — continuing to start server."
    echo "[entrypoint] Set MIGRATE_FAILURE_POLICY=abort to refuse the start instead."
  fi
}

echo "[entrypoint] Database migrations (on failure: $MIGRATE_FAILURE_POLICY)..."
if [ ! -d "$DIST/migrations" ] || [ -z "$(ls -A "$DIST/migrations" 2>/dev/null)" ]; then
  echo "[entrypoint] no migrations bundled — skipping migrations."
elif [ -x "$MIGRATE_BIN" ]; then
  run_migrations "$MIGRATE_BIN"
elif [ -f "$VENDOR_MIGRATE" ]; then
  run_migrations node "$VENDOR_MIGRATE"
else
  echo "[entrypoint] migrate CLI not present in image — skipping migrations."
fi

# The entry point differs by build layout, and guessing wrong yields a bare MODULE_NOT_FOUND plus a
# healthcheck timeout — an expensive way to learn about a path. This project's tsconfig spans
# migrations/ too, so it emits dist/src/main.js; a standalone nest-server build emits dist/main.js.
if [ -z "$SERVER_CMD" ]; then
  if [ -f "$DIST/src/main.js" ]; then
    SERVER_CMD="node $DIST/src/main.js"
  elif [ -f "$DIST/main.js" ]; then
    SERVER_CMD="node $DIST/main.js"
  else
    echo "[entrypoint] ERROR: no server entry point found ($DIST/src/main.js or $DIST/main.js)."
    exit 1
  fi
fi

# NOTE: no NODE_OPTIONS=--max-old-space-size here, and that is DELIBERATE.
# Node sizes its default heap from the cgroup memory limit (uv_get_constrained_memory) — but only
# while the flag is UNSET. Pinning a literal disables that auto-sizing, so on a memory-limited
# container the cgroup OOM-killer (SIGKILL, exit 137, no stacktrace) fires before V8's own graceful
# "JavaScript heap out of memory" FATAL. Declare a memory limit on the service instead and let Node
# derive from it; if you ever genuinely need a ceiling, compute it (~75% of the limit).

echo "[entrypoint] Starting server..."
exec $SERVER_CMD
