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
# A migration that RAN AND FAILED aborts the start. A failed schema migration is otherwise
# indistinguishable from a good deploy on every level anyone watches: health check 200,
# /meta with the right commit, drift detection green, `turbo deploy --wait` converging —
# over an app that works against the empty collections Mongoose created at boot while the
# data still sits under the old names. The container runtime restarts and retries, so the
# failure stays loud until it is fixed. Same default as @lenne.tech/nest-server's own
# entrypoint.
#
# Opt out PER DEPLOY, deliberately, with MIGRATIONS_ALLOW_FAILURE=true (or the long form
# MIGRATE_FAILURE_POLICY=warn; the long form wins when both are set) — and unset it again
# once the migration is fixed. Worth knowing before you do: since nest-server 11.32.4 a
# seed migration that uploads an incomplete file to GridFS FAILS instead of silently
# storing a broken asset; with failures allowed that signal reaches the container log and
# nothing else, and the server serves the broken file.
#
# A migration whose FILE IS GONE is not a failure. Migrations that ran everywhere are often
# pruned from migrations/ later, and a new instance never needs them: the migrate CLI reports
# a recorded migration without a file as a warning and the start goes on (only
# NSC__MIGRATE__STRICT=true turns that into an error). This script deliberately passes no
# --strict for that reason.
#
# Test seams (default to the real values in the container):
#   APP_DIST                compiled output (/app/projects/api/dist in a monorepo, /app/dist standalone)
#   MIGRATE_BIN             path to the npm-mode migrate CLI (overridden in unit tests)
#   SERVER_CMD              command used to start the server (overridden in unit tests)
#   MIGRATE_FAILURE_POLICY  what a FAILED migration does: `abort` (default) or `warn`
#   MIGRATIONS_ALLOW_FAILURE  `true` = the per-deploy short form of MIGRATE_FAILURE_POLICY=warn
set -e

DIST="${APP_DIST:-/app/dist}"
MIGRATE_BIN="${MIGRATE_BIN:-/app/node_modules/.bin/migrate}"
VENDOR_MIGRATE="$DIST/bin/migrate.js"

# MIGRATIONS_ALLOW_FAILURE is only consulted when the long form is not set.
if [ -z "$MIGRATE_FAILURE_POLICY" ]; then
  case "$MIGRATIONS_ALLOW_FAILURE" in
    true) MIGRATE_FAILURE_POLICY=warn ;;
    '' | false) MIGRATE_FAILURE_POLICY=abort ;;
    *)
      echo "[entrypoint] WARNING: unknown MIGRATIONS_ALLOW_FAILURE '$MIGRATIONS_ALLOW_FAILURE' (expected 'true') — using 'abort'."
      MIGRATE_FAILURE_POLICY=abort
      ;;
  esac
fi

# Report a misspelled value NOW rather than at failure time — and fall back to the STRICT
# default. A typo must never be the thing that lets a failed migration reach traffic.
case "$MIGRATE_FAILURE_POLICY" in
  abort | warn) ;;
  *)
    echo "[entrypoint] WARNING: unknown MIGRATE_FAILURE_POLICY '$MIGRATE_FAILURE_POLICY' — using 'abort'."
    MIGRATE_FAILURE_POLICY=abort
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
    echo "[entrypoint] Fix the migration, or set MIGRATIONS_ALLOW_FAILURE=true for this deploy to start anyway."
    exit 1
  else
    echo "[entrypoint] WARNING: migration step failed — continuing to start server (failures allowed for this deploy)."
    echo "[entrypoint] Unset MIGRATIONS_ALLOW_FAILURE / MIGRATE_FAILURE_POLICY once the migration is fixed."
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

# NOTE on `exec` and shutdown: `exec` replaces this shell, so the server becomes PID 1 and receives
# `docker stop`'s SIGTERM directly — no signal-forwarding wrapper needed. src/main.ts installs the
# framework's graceful shutdown for it. If you configure `shutdownDelayMs` (NSC__SHUTDOWN_DELAY_MS,
# nest-server 11.33.0+), the process deliberately stays fully healthy for that long BEFORE closing,
# so a load balancer can finish deregistering. That time is spent INSIDE the orchestrator's grace
# period: Compose `stop_grace_period` defaults to 10s and Kubernetes
# `terminationGracePeriodSeconds` to 30s. Set the delay well below whichever applies AND leave room
# for the drain that follows — exceed it and the container is SIGKILLed mid-wait, running no
# shutdown hook at all, which is strictly worse than no delay.

# NOTE: no NODE_OPTIONS=--max-old-space-size here, and that is DELIBERATE.
# Node sizes its default heap from the cgroup memory limit (uv_get_constrained_memory) — but only
# while the flag is UNSET. Pinning a literal disables that auto-sizing, so on a memory-limited
# container the cgroup OOM-killer (SIGKILL, exit 137, no stacktrace) fires before V8's own graceful
# "JavaScript heap out of memory" FATAL. Declare a memory limit on the service instead and let Node
# derive from it; if you ever genuinely need a ceiling, compute it (~75% of the limit).

echo "[entrypoint] Starting server..."
exec $SERVER_CMD
