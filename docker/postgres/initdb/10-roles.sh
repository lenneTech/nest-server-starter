#!/bin/sh
# Roles and databases of the PostgreSQL service (docker-compose.yml, profile `postgres`).
#
# The image runs this once, when it initialises an EMPTY data directory (`/docker-entrypoint-initdb.d`). Changing a
# value below therefore changes nothing on an existing volume: `docker compose --profile postgres down -v` drops it.
#
# Two roles, the separation nest-server expects in every environment (nest-server migration guide 12.0.x → 12.1.x,
# §3):
#
#   owner (NSC__DATABASE__OWNER_URL)  owns the databases and every table. nest-server connects with it only to create
#                                     and evolve the schema at boot, and the migrations run with it.
#   app   (NSC__DATABASE__URL)        the role every request uses. It owns nothing and has neither SUPERUSER nor
#                                     BYPASSRLS, so the row-level security nest-server puts on tenant tables binds it.
#                                     The boot refuses an application role that could get around it.
#
# POSTGRES_TEST_RIGHTS (default `true`, for development and the e2e suite) additionally lets the owner create databases
# (the suite creates one per run and worker) and end other roles' sessions (pg_signal_backend), so a test database can
# be dropped while a crashed run still holds a connection. A deployment sets it to `false`: there the owner needs
# neither, and the databases are the ones listed in POSTGRES_APP_DATABASES.
set -eu

: "${POSTGRES_OWNER_USER:=nest_owner}"
: "${POSTGRES_OWNER_PASSWORD:=nest-owner-secret}"
: "${POSTGRES_APP_USER:=nest_app}"
: "${POSTGRES_APP_PASSWORD:=nest-app-secret}"
# Space-separated: the databases to create, owned by the owner role. docker-compose.yml sets the database of the
# `local` env here, which has to equal `dbName` of the `local` block in src/config.env.ts.
: "${POSTGRES_APP_DATABASES:=nest-server-starter-local}"
: "${POSTGRES_TEST_RIGHTS:=true}"

case "$POSTGRES_TEST_RIGHTS" in
  true) OWNER_CREATEDB=CREATEDB ;;
  false) OWNER_CREATEDB=NOCREATEDB ;;
  *)
    echo "10-roles.sh: POSTGRES_TEST_RIGHTS must be true or false, not '$POSTGRES_TEST_RIGHTS'" >&2
    exit 1
    ;;
esac

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  -v owner="$POSTGRES_OWNER_USER" -v owner_password="$POSTGRES_OWNER_PASSWORD" -v owner_createdb="$OWNER_CREATEDB" \
  -v app="$POSTGRES_APP_USER" -v app_password="$POSTGRES_APP_PASSWORD" <<'SQL'
CREATE ROLE :"owner" LOGIN PASSWORD :'owner_password' NOSUPERUSER :owner_createdb NOCREATEROLE NOBYPASSRLS;
CREATE ROLE :"app" LOGIN PASSWORD :'app_password' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
SQL

if [ "$POSTGRES_TEST_RIGHTS" = true ]; then
  psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" -v owner="$POSTGRES_OWNER_USER" <<'SQL'
GRANT pg_signal_backend TO :"owner";
SQL
fi

for database in $POSTGRES_APP_DATABASES; do
  psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
    -v database="$database" -v owner="$POSTGRES_OWNER_USER" -v app="$POSTGRES_APP_USER" <<'SQL'
CREATE DATABASE :"database" OWNER :"owner";
GRANT CONNECT ON DATABASE :"database" TO :"app";
SQL
done
