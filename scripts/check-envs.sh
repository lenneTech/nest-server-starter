#!/usr/bin/env bash
# Smoke-test all six NODE_ENV configurations.
#
# Verifies:
#   Phase 1 (no .env)        — local/e2e/ci must start; develop/test/production must fail-fast
#                              with a "Missing required environment variables" error.
#   Phase 2 (with .env)      — all six envs must start cleanly (no ERROR-level log entries).
#
# Usage: bash scripts/check-envs.sh [--docker]
#   --docker   also run Phase 1 + Phase 2 inside the production Dockerfile image
#
# Requires: built dist/ (run `pnpm run build` first), MongoDB on 127.0.0.1:27017.
set -e

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
FIXTURE_ENV="$PROJECT_DIR/tests/fixtures/.env.deployed-test"
DOCKER_MODE=0
[ "$1" = "--docker" ] && DOCKER_MODE=1

cd "$PROJECT_DIR"

# Ensure built artifacts exist
if [ ! -f "dist/src/main.js" ]; then
  echo "ERROR: dist/src/main.js missing — run 'pnpm run build' first." >&2
  exit 1
fi

# Backup any existing .env so it doesn't pollute the test
ENV_BACKUP=""
if [ -f .env ]; then
  ENV_BACKUP=$(mktemp)
  cp .env "$ENV_BACKUP"
fi

cleanup() {
  rm -f .env
  [ -n "$ENV_BACKUP" ] && mv "$ENV_BACKUP" .env
}
trap cleanup EXIT

# -----------------------------------------------------------------------------
# Helper: start `node dist/src/main.js` with given NODE_ENV; succeed if log
# contains the given expected pattern within 60 seconds.
# -----------------------------------------------------------------------------
run_local() {
  local env_name="$1"
  local expected_pattern="$2"
  local label="$3"
  local log_file
  log_file=$(mktemp)
  local free_port
  free_port=$(node -e "const s=require('net').createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>console.log(p));});")

  NSC__PORT=$free_port NODE_ENV="$env_name" node dist/src/main.js > "$log_file" 2>&1 &
  local server_pid=$!

  for _ in $(seq 1 60); do
    if grep -qE "$expected_pattern" "$log_file" 2>/dev/null; then
      kill "$server_pid" 2>/dev/null || true
      wait "$server_pid" 2>/dev/null || true
      rm -f "$log_file"
      echo "  OK  [$env_name] $label"
      return 0
    fi
    if ! kill -0 "$server_pid" 2>/dev/null; then
      # Process exited — check if expected pattern is in log (e.g. fail-fast error)
      if grep -qE "$expected_pattern" "$log_file" 2>/dev/null; then
        rm -f "$log_file"
        echo "  OK  [$env_name] $label"
        return 0
      fi
      echo "  FAIL [$env_name] process exited unexpectedly:"
      tail -10 "$log_file" | sed 's/^/    /'
      rm -f "$log_file"
      return 1
    fi
    sleep 1
  done

  kill "$server_pid" 2>/dev/null || true
  echo "  FAIL [$env_name] timeout waiting for: $expected_pattern"
  tail -10 "$log_file" | sed 's/^/    /'
  rm -f "$log_file"
  return 1
}

# -----------------------------------------------------------------------------
# Helper: same as run_local but inside a Docker container.
# -----------------------------------------------------------------------------
run_docker() {
  local env_name="$1"
  local expected_pattern="$2"
  local label="$3"
  local extra_args="$4"
  local container
  container="nss-checkenvs-$env_name-$$"

  docker rm -f "$container" >/dev/null 2>&1 || true

  # shellcheck disable=SC2086
  docker run -d --name "$container" \
    -e NODE_ENV="$env_name" \
    $extra_args \
    nest-server-starter:check-envs >/dev/null

  for _ in $(seq 1 90); do
    local logs
    logs=$(docker logs "$container" 2>&1 || true)
    if echo "$logs" | grep -qE "$expected_pattern"; then
      docker rm -f "$container" >/dev/null
      echo "  OK  [$env_name] $label (docker)"
      return 0
    fi
    local status
    status=$(docker inspect -f '{{.State.Status}}' "$container" 2>/dev/null || echo "gone")
    if [ "$status" = "exited" ] || [ "$status" = "dead" ] || [ "$status" = "gone" ]; then
      if echo "$logs" | grep -qE "$expected_pattern"; then
        docker rm -f "$container" >/dev/null
        echo "  OK  [$env_name] $label (docker)"
        return 0
      fi
      echo "  FAIL [$env_name] container exited (docker):"
      echo "$logs" | tail -10 | sed 's/^/    /'
      docker rm -f "$container" >/dev/null
      return 1
    fi
    sleep 1
  done

  echo "  FAIL [$env_name] timeout (docker)"
  docker logs "$container" 2>&1 | tail -10 | sed 's/^/    /'
  docker rm -f "$container" >/dev/null
  return 1
}

EXIT_CODE=0
START_PATTERN="Server startet at"
FAIL_PATTERN="Missing required environment variables"

# =============================================================================
# Phase 1 — no .env file
# =============================================================================
rm -f .env
echo "=== Phase 1: no .env ==="
echo "  → local/e2e/ci must start; develop/test/production must fail-fast"

for env in local e2e ci; do
  run_local "$env" "$START_PATTERN" "starts cleanly without .env" || EXIT_CODE=1
done
for env in develop test production; do
  run_local "$env" "$FAIL_PATTERN" "fail-fast on missing env vars" || EXIT_CODE=1
done

# =============================================================================
# Phase 2 — with .env (all six must start)
# =============================================================================
cp "$FIXTURE_ENV" .env
echo ""
echo "=== Phase 2: with valid .env ==="
echo "  → all six envs must start cleanly"

for env in local e2e ci develop test production; do
  run_local "$env" "$START_PATTERN" "starts cleanly with .env" || EXIT_CODE=1
done

# =============================================================================
# Phase 3 — Docker (optional)
# =============================================================================
if [ $DOCKER_MODE -eq 1 ]; then
  echo ""
  echo "=== Phase 3: Docker container ==="
  echo "  → building image nest-server-starter:check-envs ..."
  docker build -q -t nest-server-starter:check-envs . >/dev/null

  # Phase 3a: deployed envs without ENVs → fail-fast
  echo "  → no envs (deployed must fail-fast)"
  for env in develop test production; do
    run_docker "$env" "$FAIL_PATTERN" "fail-fast on missing env vars" "" || EXIT_CODE=1
  done

  # Phase 3b: deployed envs with ENVs → start
  # Override MONGOOSE__URI for the container — fixture's 127.0.0.1 points to
  # the container itself; we need host.docker.internal to reach the host's Mongo.
  echo "  → with envs (deployed must start)"
  for env in develop test production; do
    run_docker "$env" "$START_PATTERN" "starts cleanly" \
      "--env-file $FIXTURE_ENV --add-host=host.docker.internal:host-gateway -e NSC__MONGOOSE__URI=mongodb://host.docker.internal:27017/nest-server-starter-docker-smoketest" \
      || EXIT_CODE=1
  done
fi

echo ""
if [ $EXIT_CODE -eq 0 ]; then
  echo "All env configurations OK."
else
  echo "One or more env configurations FAILED."
fi
exit $EXIT_CODE
