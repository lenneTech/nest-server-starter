import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { runDatabase } from '../db-lifecycle.reporter.js';
import { MAX_POSTGRES_RUN_BASE_BYTES, setup } from '../global-setup.js';
import {
  fitTestDbName,
  postgresBaseUrls,
  postgresDatabaseName,
  postgresRole,
  testDatabaseKind,
  withPostgresDatabase,
} from '../test-database-server.js';

/**
 * The e2e run on PostgreSQL derives every database it creates and drops from the configured URLs
 * (tests/global-setup.ts → tests/setup.ts → tests/db-lifecycle.reporter.ts). These cases pin the parts that decide
 * WHICH database is touched: a wrong name there means a test run on somebody's data, or a run database nobody collects.
 */
const config = vi.hoisted(() => ({
  database: undefined as unknown,
  mongoose: { uri: 'mongodb://127.0.0.1/unused-e2e' },
}));
vi.mock('../../src/config.env', () => ({ default: config }));
// The refusals below happen before any connection; a sweep that got that far must not reach a real server
vi.mock('pg', () => ({
  Client: class {
    connect() {
      return Promise.reject(new Error('no server in a unit test'));
    }
    end() {
      return Promise.resolve();
    }
  },
}));
vi.mock('../e2e-run-slots.js', () => ({ acquireRunSlot: async () => () => undefined }));

const APP = 'postgres://nest_app:app%20secret@127.0.0.1:5433/nest-server-starter-e2e?sslmode=disable';
const OWNER = 'postgres://nest_owner:owner-secret@127.0.0.1:5433/nest-server-starter-e2e?sslmode=disable';

describe('PostgreSQL URLs of the e2e run', () => {
  it('replaces only the database: role, password, host and options stay', () => {
    const url = withPostgresDatabase(APP, 'nest-server-starter-e2e-run-1-p2-w3');
    expect(postgresDatabaseName(url)).toBe('nest-server-starter-e2e-run-1-p2-w3');
    expect(postgresRole(url)).toBe('nest_app');
    expect(new URL(url).password).toBe('app%20secret');
    expect(new URL(url).host).toBe('127.0.0.1:5433');
    expect(new URL(url).search).toBe('?sslmode=disable');
  });

  it('takes the run from the owner URL: a URL with it means PostgreSQL', () => {
    expect(testDatabaseKind({ NSC__DATABASE__OWNER_URL: OWNER })).toBe('postgres');
    expect(testDatabaseKind({ NSC__MONGOOSE__URI: 'mongodb://127.0.0.1/x-e2e' })).toBe('mongodb');
  });

  it('accepts the URLs of the configuration only when both name the same PostgreSQL database', () => {
    expect(postgresBaseUrls({ ownerUrl: OWNER, url: APP })).toEqual({ appUrl: APP, ownerUrl: OWNER });
    expect(() => postgresBaseUrls({ url: APP })).toThrow('owner URL');
    expect(() => postgresBaseUrls(APP)).toThrow('owner URL');
    expect(() => postgresBaseUrls({ ownerUrl: withPostgresDatabase(OWNER, 'other-e2e'), url: APP })).toThrow(
      'different databases',
    );
    expect(() => postgresBaseUrls({ ownerUrl: 'mysql://owner@db/x-e2e', url: 'mysql://app@db/x-e2e' })).toThrow(
      'MongoDB or PostgreSQL',
    );
  });
});

describe('fitTestDbName', () => {
  it('keeps a name of up to 63 bytes as it is', () => {
    const name = 'a'.repeat(63);
    expect(fitTestDbName(name)).toBe(name);
  });

  // PostgreSQL TRUNCATES a longer name instead of refusing it: the database would exist under a name no URL names
  it('shortens a longer one to 63 bytes, deterministically, keeping the first 54 characters', () => {
    const name = `${'nest-server-starter-e2e-run-1795770016531-p74718'}-w12-a-very-long-suffix`;
    const fitted = fitTestDbName(name);
    expect(Buffer.byteLength(fitted)).toBeLessThanOrEqual(63);
    expect(fitted.startsWith(name.slice(0, 54))).toBe(true);
    expect(fitTestDbName(name)).toBe(fitted);
    expect(fitTestDbName(`${name}x`)).not.toBe(fitted);
  });
});

describe('runDatabase (reporter)', () => {
  it('manages the run database on PostgreSQL, named by the owner URL', () => {
    const run = runDatabase({
      NSC__DATABASE__OWNER_URL: withPostgresDatabase(OWNER, 'nest-server-starter-e2e-run-1795770016531-p74718'),
    });
    expect(run).toMatchObject({ legacyBase: false, name: 'nest-server-starter-e2e-run-1795770016531-p74718' });
    // Never a password in a log line
    expect(run?.where).toBe('postgres://127.0.0.1:5433');
  });

  it('leaves a PostgreSQL database alone that is not a run database', () => {
    expect(runDatabase({ NSC__DATABASE__OWNER_URL: OWNER })).toBeUndefined();
  });
});

describe('global-setup on PostgreSQL', () => {
  const saved = { ...process.env };

  beforeEach(() => {
    vi.spyOn(console, 'info').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    for (const name of ['NSC__DATABASE__URL', 'NSC__DATABASE__OWNER_URL', 'NSC__MONGOOSE__URI']) {
      if (saved[name] === undefined) {
        delete process.env[name];
      } else {
        process.env[name] = saved[name];
      }
    }
    config.database = undefined;
    vi.restoreAllMocks();
  });

  // `lt dev up` points the project's own database at `<slug>-local`; its name must not lend itself to run databases
  it.each(['crm-local', 'crm-production', 'crm'])('refuses run databases named after %s', async (name) => {
    config.database = { ownerUrl: withPostgresDatabase(OWNER, name), url: withPostgresDatabase(APP, name) };
    await expect(setup()).rejects.toThrow(`Refusing to create test databases named after "${name}"`);
  });

  it('refuses a name too long for PostgreSQL before it creates anything', async () => {
    const name = 'a-rather-long-project-name-for-a-customer-e2e';
    config.database = { ownerUrl: withPostgresDatabase(OWNER, name), url: withPostgresDatabase(APP, name) };
    await expect(setup()).rejects.toThrow('too long');
  });

  // Decided by the name alone: a check on the actual run name would pass or fail by the PID's number of digits
  it('accepts a base up to the limit and refuses one byte more, whatever the PID', async () => {
    const fits = `${'a'.repeat(MAX_POSTGRES_RUN_BASE_BYTES - 4)}-e2e`;
    // The longest run name this base can produce (13-digit milliseconds, 7-digit Linux PID) still leaves a worker suffix
    expect(Buffer.byteLength(`${fits}-run-${'9'.repeat(13)}-p${'9'.repeat(7)}`)).toBe(53);
    config.database = { ownerUrl: withPostgresDatabase(OWNER, fits), url: withPostgresDatabase(APP, fits) };
    await setup();
    expect(postgresDatabaseName(process.env.NSC__DATABASE__OWNER_URL as string).startsWith(`${fits}-run-`)).toBe(true);

    const tooLong = `a${fits}`;
    config.database = { ownerUrl: withPostgresDatabase(OWNER, tooLong), url: withPostgresDatabase(APP, tooLong) };
    await expect(setup()).rejects.toThrow('too long');
  });

  it('hands the run its own database through both URLs and drops a MongoDB URI from the shell', async () => {
    config.database = { ownerUrl: OWNER, url: APP };
    process.env.NSC__MONGOOSE__URI = 'mongodb://127.0.0.1/crm-local';

    await setup();

    const owner = process.env.NSC__DATABASE__OWNER_URL as string;
    const app = process.env.NSC__DATABASE__URL as string;
    expect(postgresDatabaseName(owner)).toMatch(new RegExp(`^nest-server-starter-e2e-run-\\d+-p${process.pid}$`));
    expect(postgresDatabaseName(app)).toBe(postgresDatabaseName(owner));
    expect(postgresRole(owner)).toBe('nest_owner');
    expect(postgresRole(app)).toBe('nest_app');
    expect(process.env.NSC__MONGOOSE__URI).toBeUndefined();
  });
});
