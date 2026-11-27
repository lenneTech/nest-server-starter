import { rm } from 'node:fs/promises';
import { join } from 'node:path';

import { type Db, type Filter, MongoClient, ObjectId } from 'mongodb';
import { Client } from 'pg';

import { deriveTestDbUri, splitMongoUri } from './db-lifecycle.reporter.js';
import {
  fitTestDbName,
  openPostgresTestServer,
  postgresBaseUrls,
  postgresDatabaseName,
  postgresRole,
  testDatabaseKind,
  withPostgresDatabase,
} from './test-database-server.js';

/**
 * Direct database access for the e2e specs, on whichever database the run uses: MongoDB, the default, or PostgreSQL
 * (tests/global-setup.ts). A spec reads and prepares state the API offers no route for — verify a user, grant a role,
 * check that a file is gone — through this instead of a database client of its own, so one spec proves both databases.
 * The pattern is nest-server's `tests/helpers/iam-test-db.ts`.
 *
 * Records come back as the API returns them: camelCase field names and a string `id`, whichever database answered.
 * On PostgreSQL the helper connects as the OWNER role, because a spec plants state past every policy; the application
 * role could not, by design. Table and column names below are literals — no identifier comes from a parameter.
 */
export interface TestDb {
  readonly kind: 'mongodb' | 'postgres';
  close(): Promise<void>;
  /** Users that match; an empty match counts every user (a spec on a database of its own) */
  countUsers(match: UserMatch): Promise<number>;
  /** Remove a stored file's metadata and bytes (GridFS on MongoDB, the filesystem driver on PostgreSQL) */
  deleteFile(id: string): Promise<void>;
  /** Remove users and what Better-Auth keeps for them: sessions, accounts, 2FA, passkeys, verifications */
  deleteUsers(match: UserMatch): Promise<void>;
  /** The metadata of a stored file — `filename`, `length`, `contentType`, `metadata`, `id` — or `null` */
  findFile(match: FileMatch): Promise<null | TestRecord>;
  findUser(match: UserMatch): Promise<null | TestRecord>;
  /** Set fields on the users that match; keys as the model names them (camelCase) */
  updateUser(match: UserMatch, set: Record<string, unknown>): Promise<void>;
}

/** A record as the API returns it */
export type TestRecord = Record<string, any> & { id: string };

/** Users by exact email, by id or by several ids */
export interface UserMatch {
  email?: string;
  id?: string;
  ids?: string[];
}

/** A stored file by id, or the newest one with that filename */
export interface FileMatch {
  filename?: string;
  id?: string;
}

/** What the helper reads from the configuration of the application under test */
export interface TestDbConfig {
  database?: unknown;
  file?: { storageDir?: string };
  mongoose?: { uri?: string };
}

/**
 * Open the database of the application under test. Pass the configuration the application boots with
 * (`envConfig` from src/config.env.ts): the helper then reaches the same database, also for a spec that switched to a
 * database of its own with `useOwnTestDatabase()` before importing the configuration.
 */
export async function openTestDb(config: TestDbConfig): Promise<TestDb> {
  if (testDatabaseKind() === 'postgres') {
    const { ownerUrl } = postgresBaseUrls(config.database);
    const client = new Client({ connectionString: ownerUrl });
    await client.connect();
    return new PostgresTestDb(client, config.file?.storageDir ?? 'uploads/files');
  }
  if (!config.mongoose?.uri) {
    throw new Error('openTestDb: the configuration has no mongoose.uri');
  }
  const client = await MongoClient.connect(config.mongoose.uri);
  return new MongoTestDb(client, client.db());
}

/** A database `useOwnTestDatabase()` created for one spec */
export interface OwnTestDatabase {
  name: string;
  /** Drop it and point the environment back at the worker's database */
  release(): Promise<void>;
}

/**
 * The name of the database the configuration points the application at: the default source's on PostgreSQL, the
 * `mongoose` one on MongoDB. A spec on a database of its own asserts on it before it relies on that database.
 */
export function applicationDatabaseName(config: TestDbConfig): string {
  if (testDatabaseKind() === 'postgres') {
    return postgresDatabaseName(postgresBaseUrls(config.database).appUrl);
  }
  return splitMongoUri(config.mongoose?.uri ?? '').dbName;
}

/**
 * A database of the spec's own, for a spec that needs one without the state the other files of its fork leave behind
 * (the system setup needs a database without users). Call it at module level, BEFORE the configuration is imported
 * (dynamic `import()` in `beforeAll`): it points the run's environment at the new database, which the configuration
 * then picks up. `release()` drops it and restores the environment; call it after `app.close()`.
 *
 * The name is the worker's database plus `-<suffix>`, so the reporter collects it with the run if `release()` never
 * runs.
 */
export async function useOwnTestDatabase(suffix: string): Promise<OwnTestDatabase> {
  const saved = Object.fromEntries(
    ['NSC__DATABASE__OWNER_URL', 'NSC__DATABASE__URL', 'NSC__MONGOOSE__URI'].map((name) => [name, process.env[name]]),
  );
  const restore = () => {
    for (const [name, value] of Object.entries(saved)) {
      // Assigning undefined would store the string "undefined"
      if (value === undefined) {
        delete process.env[name];
      } else {
        process.env[name] = value;
      }
    }
  };

  if (testDatabaseKind() === 'postgres') {
    const ownerUrl = process.env.NSC__DATABASE__OWNER_URL as string;
    const appUrl = process.env.NSC__DATABASE__URL as string;
    const name = fitTestDbName(`${postgresDatabaseName(ownerUrl)}-${suffix}`);
    const server = await openPostgresTestServer(ownerUrl);
    try {
      await server.drop(name);
      await server.create(name, postgresRole(appUrl));
    } finally {
      await server.close();
    }
    process.env.NSC__DATABASE__OWNER_URL = withPostgresDatabase(ownerUrl, name);
    process.env.NSC__DATABASE__URL = withPostgresDatabase(appUrl, name);
    return {
      name,
      release: async () => {
        restore();
        const cleanup = await openPostgresTestServer(ownerUrl);
        try {
          await cleanup.drop(name);
        } catch {
          // The reporter collects it as a leftover of this run
        } finally {
          await cleanup.close();
        }
      },
    };
  }

  const uri = deriveTestDbUri(suffix);
  process.env.NSC__MONGOOSE__URI = uri;
  return {
    name: splitMongoUri(uri).dbName,
    release: async () => {
      restore();
      const client = await MongoClient.connect(uri);
      try {
        await client.db().dropDatabase();
      } catch {
        // The reporter collects it as a leftover of this run
      } finally {
        await client.close();
      }
    },
  };
}

class MongoTestDb implements TestDb {
  readonly kind = 'mongodb' as const;

  constructor(
    protected readonly client: MongoClient,
    protected readonly db: Db,
  ) {}

  async close(): Promise<void> {
    await this.client.close();
  }

  async countUsers(match: UserMatch): Promise<number> {
    return this.db.collection('users').countDocuments(this.userFilter(match));
  }

  async deleteFile(id: string): Promise<void> {
    const fileId = toObjectId(id);
    await this.db.collection('fs.files').deleteOne({ _id: fileId } as Filter<any>);
    await this.db.collection('fs.chunks').deleteMany({ files_id: fileId } as Filter<any>);
  }

  async deleteUsers(match: UserMatch): Promise<void> {
    const users = await this.db.collection('users').find(this.userFilter(match, true)).toArray();
    // Better-Auth stores a user reference as the ObjectId, older rows as its string, a migrated user by its iamId
    const forms = users.flatMap((user) => [user._id, String(user._id), ...(user.iamId ? [user.iamId] : [])]);
    for (const collection of ['session', 'account', 'twoFactor', 'passkey']) {
      await this.db.collection(collection).deleteMany({ userId: { $in: forms } });
    }
    // Reset and verification values carry the user id as their value
    await this.db.collection('verification').deleteMany({ value: { $in: forms.map(String) } });
    await this.db.collection('users').deleteMany({ _id: { $in: users.map((user) => user._id) } });
  }

  async findFile(match: FileMatch): Promise<null | TestRecord> {
    const filter = match.id ? { _id: toObjectId(match.id) } : { filename: match.filename };
    const [file] = await this.db
      .collection('fs.files')
      .find(filter as Filter<any>)
      .sort({ uploadDate: -1 })
      .limit(1)
      .toArray();
    return file ? { ...file, id: String(file._id) } : null;
  }

  async findUser(match: UserMatch): Promise<null | TestRecord> {
    const user = await this.db.collection('users').findOne(this.userFilter(match));
    return user ? { ...user, id: String(user._id) } : null;
  }

  async updateUser(match: UserMatch, set: Record<string, unknown>): Promise<void> {
    await this.db.collection('users').updateMany(this.userFilter(match, true), { $set: set });
  }

  protected userFilter(match: UserMatch, refuseEmpty = false): Filter<any> {
    if (match.ids) {
      return { _id: { $in: match.ids.map(toObjectId) } };
    }
    if (match.id) {
      return { _id: toObjectId(match.id) };
    }
    if (match.email !== undefined) {
      return { email: match.email };
    }
    if (refuseEmpty) {
      throw new Error('TestDb: refusing an empty match here — it would reach every user');
    }
    return {};
  }
}

class PostgresTestDb implements TestDb {
  readonly kind = 'postgres' as const;

  /** The columns of `users`, read once */
  protected columns?: Promise<Set<string>>;

  constructor(
    protected readonly pg: Client,
    protected readonly storageDir: string,
  ) {}

  async close(): Promise<void> {
    await this.pg.end();
  }

  async countUsers(match: UserMatch): Promise<number> {
    const { params, where } = this.where(match);
    const { rows } = await this.pg.query<{ n: number }>(`SELECT count(*)::int AS n FROM users WHERE ${where}`, params);
    return rows[0].n;
  }

  async deleteFile(id: string): Promise<void> {
    for (const table of ['filesystem_files', 's3_files']) {
      await this.pg.query(`DELETE FROM ${table} WHERE id = $1`, [id]).catch(() => undefined);
    }
    // The filesystem driver keeps the bytes under the id (nest-server's FilesystemFileHelper)
    if (/^[a-f0-9]{24}$/.test(id)) {
      await rm(join(this.storageDir, id), { force: true });
    }
  }

  async deleteUsers(match: UserMatch): Promise<void> {
    const { params, where } = this.where(match, 0, true);
    // Sessions, accounts, 2FA and passkeys go with the user (ON DELETE CASCADE)
    const { rows } = await this.pg.query<{ id: string }>(`DELETE FROM users WHERE ${where} RETURNING id`, params);
    const ids = rows.map((row) => row.id);
    if (ids.length) {
      // Reset and verification values carry the user id as their value; no foreign key to cascade
      await this.pg.query('DELETE FROM verification WHERE value = ANY($1)', [ids]).catch(() => undefined);
    }
  }

  async findFile(match: FileMatch): Promise<null | TestRecord> {
    const [column, value] = match.id ? ['id', match.id] : ['filename', match.filename];
    for (const table of ['filesystem_files', 's3_files']) {
      const { rows } = await this.pg
        .query(`SELECT * FROM ${table} WHERE ${column} = $1 ORDER BY upload_date DESC NULLS LAST LIMIT 1`, [value])
        .catch(() => ({ rows: [] as Record<string, any>[] }));
      if (rows[0]) {
        return camelCase(rows[0]) as TestRecord;
      }
    }
    return null;
  }

  async findUser(match: UserMatch): Promise<null | TestRecord> {
    const { params, where } = this.where(match);
    const { rows } = await this.pg.query(`SELECT * FROM users WHERE ${where} LIMIT 1`, params);
    return rows[0] ? (camelCase(rows[0]) as TestRecord) : null;
  }

  async updateUser(match: UserMatch, set: Record<string, unknown>): Promise<void> {
    const columns = await this.userColumns();
    const entries = Object.entries(set).map(([key, value]) => [snakeCase(key), value] as const);
    for (const [column] of entries) {
      if (!columns.has(column)) {
        throw new Error(`TestDb.updateUser: the users table has no column "${column}"`);
      }
    }
    const { params, where } = this.where(match, entries.length, true);
    const assignments = entries.map(([column], index) => `${column} = $${index + 1}`).join(', ');
    // jsonb columns (roles, …) take JSON; node-postgres would send a JS array as a PostgreSQL array
    const values = entries.map(([, value]) =>
      Array.isArray(value) || (value !== null && typeof value === 'object' && !(value instanceof Date))
        ? JSON.stringify(value)
        : value,
    );
    await this.pg.query(`UPDATE users SET ${assignments} WHERE ${where}`, [...values, ...params]);
  }

  protected userColumns(): Promise<Set<string>> {
    this.columns ??= this.pg
      .query<{ column_name: string }>(
        `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'users'`,
      )
      .then(({ rows }) => new Set(rows.map((row) => row.column_name)));
    return this.columns;
  }

  /** A WHERE clause over `users`; parameters numbered after `offset` */
  protected where(match: UserMatch, offset = 0, refuseEmpty = false): { params: unknown[]; where: string } {
    if (match.ids) {
      return { params: [match.ids], where: `id = ANY($${offset + 1})` };
    }
    if (match.id) {
      return { params: [match.id], where: `id = $${offset + 1}` };
    }
    if (match.email !== undefined) {
      return { params: [match.email], where: `email = $${offset + 1}` };
    }
    if (refuseEmpty) {
      throw new Error('TestDb: refusing an empty match here — it would reach every user');
    }
    return { params: [], where: 'TRUE' };
  }
}

/** An ObjectId for a valid hex id, the string otherwise (a document whose `_id` is a string) */
function toObjectId(id: string): ObjectId | string {
  return ObjectId.isValid(id) && /^[a-f0-9]{24}$/i.test(id) ? new ObjectId(id) : id;
}

function snakeCase(field: string): string {
  return field.replace(/([a-z\d])([A-Z])/g, '$1_$2').toLowerCase();
}

/** A row as the API returns it: camelCase fields, and a column never written left out (not `null`), as on MongoDB */
function camelCase(row: Record<string, any>): Record<string, any> {
  return Object.fromEntries(
    Object.entries(row)
      .filter(([, value]) => value !== null)
      .map(([column, value]) => [column.replace(/_([a-z\d])/g, (_match, char: string) => char.toUpperCase()), value]),
  );
}
