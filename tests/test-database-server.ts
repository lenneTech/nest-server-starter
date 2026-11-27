import { createHash } from 'node:crypto';

import { MongoClient } from 'mongodb';
import { Client } from 'pg';

/**
 * The database SERVER of an e2e run, whichever one the configuration routes to: MongoDB, the default, or PostgreSQL
 * (`database` in src/config.env.ts, or NSC__DATABASE__*). tests/global-setup.ts, tests/setup.ts and
 * tests/db-lifecycle.reporter.ts manage the run's databases through this, so the naming scheme, the drop guards and
 * the cleanup are the same on both. What a spec reads and plants inside its database: tests/test-db.ts.
 *
 * How the run tells the two apart: tests/global-setup.ts decides from the configuration and hands the result to the
 * forks through the environment — NSC__DATABASE__OWNER_URL for PostgreSQL, NSC__MONGOOSE__URI for MongoDB.
 */
export type TestDatabaseKind = 'mongodb' | 'postgres';

/** The kind of the run, as tests/global-setup.ts handed it to the forks */
export function testDatabaseKind(env: NodeJS.ProcessEnv = process.env): TestDatabaseKind {
  return env.NSC__DATABASE__OWNER_URL ? 'postgres' : 'mongodb';
}

/**
 * PostgreSQL and MongoDB cap a database name at 63 bytes. PostgreSQL does not refuse a longer one: it TRUNCATES it with
 * a notice, so the database is created under a name no URL of the run points at. A longer name keeps its first 54
 * characters and gets a short deterministic hash, so it stays unique and keeps the run's prefix the cleanup matches on.
 */
export function fitTestDbName(name: string): string {
  if (Buffer.byteLength(name) <= 63) {
    return name;
  }
  const hash = createHash('sha1').update(name).digest('hex').slice(0, 8);
  return `${name.slice(0, 54)}-${hash}`;
}

/** The database a PostgreSQL URL names */
export function postgresDatabaseName(url: string): string {
  return decodeURIComponent(new URL(url).pathname.slice(1));
}

/** The URL with another database; role, password, host and options stay */
export function withPostgresDatabase(url: string, database: string): string {
  const parsed = new URL(url);
  parsed.pathname = `/${encodeURIComponent(database)}`;
  return parsed.toString();
}

/** The role a PostgreSQL URL connects as */
export function postgresRole(url: string): string {
  return decodeURIComponent(new URL(url).username);
}

/** Host and port of a URL, for log lines: a URL of the run carries a password */
export function describeServer(url: string): string {
  try {
    const { host, protocol } = new URL(url);
    return `${protocol}//${host}`;
  } catch {
    return '(unparsable URL)';
  }
}

export function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

/** The server-level operations the run's lifecycle needs; names are whole database names */
export interface TestDatabaseServer {
  close(): Promise<void>;
  drop(name: string): Promise<void>;
  list(): Promise<string[]>;
}

/** MongoDB: any URI on the server; databases come into being with their first write */
export async function openMongoTestServer(uri: string): Promise<TestDatabaseServer> {
  const connection = await MongoClient.connect(uri);
  return {
    close: () => connection.close(),
    drop: async (name) => {
      await connection.db(name).dropDatabase();
    },
    list: async () => {
      const { databases } = await connection.db().admin().listDatabases({ nameOnly: true });
      return databases.map(({ name }) => name);
    },
  };
}

/** PostgreSQL error code for CREATE DATABASE on a name that exists */
const DUPLICATE_DATABASE = '42P04';

export interface PostgresTestServer extends TestDatabaseServer {
  /** Create the database owned by the owner role, with CONNECT for the application role; an existing one is kept */
  create(name: string, appRole: string): Promise<void>;
}

/**
 * PostgreSQL, as the OWNER role, on the server's maintenance database `postgres`: CREATE and DROP DATABASE cannot run
 * inside the database they target. The owner needs CREATEDB (docker/postgres/initdb/10-roles.sh grants it locally and
 * in CI); a deployed owner role does not, and a deployed database is never a test database.
 */
export async function openPostgresTestServer(ownerUrl: string): Promise<PostgresTestServer> {
  const client = new Client({
    connectionString: withPostgresDatabase(ownerUrl, 'postgres'),
    connectionTimeoutMillis: 8000,
  });
  try {
    await client.connect();
  } catch (error) {
    await client.end().catch(() => undefined);
    throw new Error(
      `PostgreSQL is not reachable on ${describeServer(ownerUrl)} as the owner role (${(error as Error).message}). ` +
        'Start it with `docker compose --profile postgres up -d` (docker-compose.yml).',
      { cause: error },
    );
  }
  return {
    close: () => client.end(),
    create: async (name, appRole) => {
      try {
        await client.query(`CREATE DATABASE ${quoteIdent(name)}`);
      } catch (error) {
        if ((error as { code?: string }).code !== DUPLICATE_DATABASE) {
          throw error;
        }
      }
      if (appRole) {
        await client.query(`GRANT CONNECT ON DATABASE ${quoteIdent(name)} TO ${quoteIdent(appRole)}`);
      }
    },
    // FORCE ends the sessions still on it, the application's included (the owner holds pg_signal_backend locally)
    drop: async (name) => {
      await client.query(`DROP DATABASE IF EXISTS ${quoteIdent(name)} WITH (FORCE)`);
    },
    list: async () => {
      const { rows } = await client.query<{ datname: string }>(
        'SELECT datname FROM pg_database WHERE NOT datistemplate',
      );
      return rows.map(({ datname }) => datname);
    },
  };
}

/**
 * The PostgreSQL URLs of the default source, as the configuration resolved them. tests/global-setup.ts derives the
 * run's databases from them, so both have to name the same database: one migrated and another one served would make
 * every result meaningless.
 */
export function postgresBaseUrls(database: unknown): { appUrl: string; ownerUrl: string } {
  const config = typeof database === 'object' && database ? (database as { ownerUrl?: string; url?: string }) : {};
  const appUrl = typeof database === 'string' ? database : config.url;
  const ownerUrl = config.ownerUrl;
  if (!appUrl || !ownerUrl) {
    throw new Error(
      'The e2e suite on PostgreSQL needs the application and the owner URL (database.url / database.ownerUrl, or ' +
        'NSC__DATABASE__URL / NSC__DATABASE__OWNER_URL). The owner creates a database per run and worker.',
    );
  }
  if (!/^postgres(ql)?:/i.test(appUrl) || !/^postgres(ql)?:/i.test(ownerUrl)) {
    throw new Error(
      `The e2e suite runs on MongoDB or PostgreSQL; the configured database is ${describeServer(appUrl)}`,
    );
  }
  if (postgresDatabaseName(appUrl) !== postgresDatabaseName(ownerUrl)) {
    throw new Error(
      `database.url and database.ownerUrl name different databases ("${postgresDatabaseName(appUrl)}", ` +
        `"${postgresDatabaseName(ownerUrl)}")`,
    );
  }
  return { appUrl, ownerUrl };
}
