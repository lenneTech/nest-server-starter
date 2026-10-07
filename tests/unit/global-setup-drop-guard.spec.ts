import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { setup } from '../global-setup';

/**
 * The ONE drop site in tests/global-setup.ts: an externally pinned NSC__MONGOOSE__URI is dropped
 * up front, and its name is the only evidence that it is disposable.
 *
 * db-lifecycle-guard.spec.ts pins `isExternallyDroppableTestDb` itself. That protects nothing on
 * its own: put the wider `isDroppableTestDb` back at the call site and every one of those tests
 * stays green while `<slug>-test`, the database of a possibly RUNNING `lt dev test` stack, is
 * dropped again. These tests drive `setup()` against a mocked driver, so they fail on exactly that
 * revert.
 */
const mongo = vi.hoisted(() => ({
  close: vi.fn(),
  connect: vi.fn(),
  dropDatabase: vi.fn(),
}));

vi.mock('mongodb', () => ({ MongoClient: { connect: mongo.connect } }));
// The external branch never reads the project config; mocking it keeps the import cheap.
vi.mock('../../src/config.env', () => ({ default: { mongoose: { uri: 'mongodb://127.0.0.1/unused-e2e' } } }));

describe('global-setup: externally pinned NSC__MONGOOSE__URI', () => {
  const savedUri = process.env.NSC__MONGOOSE__URI;

  beforeEach(() => {
    vi.clearAllMocks();
    mongo.connect.mockImplementation(async (uri: string) => ({
      close: mongo.close,
      db: () => ({ databaseName: new URL(uri).pathname.slice(1), dropDatabase: mongo.dropDatabase }),
    }));
    vi.spyOn(console, 'info').mockImplementation(() => {});
  });

  afterEach(() => {
    if (savedUri === undefined) {
      delete process.env.NSC__MONGOOSE__URI;
    } else {
      process.env.NSC__MONGOOSE__URI = savedUri;
    }
    vi.restoreAllMocks();
  });

  // Every shape `lt dev test` gives its stack: plain, sharded, per ticket.
  it.each(['offers-test', 'offers-test-2', 'offers-3403-test'])('refuses to drop %s', async (name) => {
    process.env.NSC__MONGOOSE__URI = `mongodb://127.0.0.1/${name}`;

    await expect(setup()).rejects.toThrow(`Refusing to dropDatabase("${name}")`);
    expect(mongo.dropDatabase).not.toHaveBeenCalled();
    expect(mongo.close).toHaveBeenCalled();
  });

  // What CI service containers pin (lt-monorepo: `api-ci`) must keep working.
  it.each(['api-ci', 'offers-ci', 'offers-e2e'])('drops the test-runner database %s', async (name) => {
    process.env.NSC__MONGOOSE__URI = `mongodb://127.0.0.1/${name}`;

    await expect(setup()).resolves.toBeUndefined();
    expect(mongo.dropDatabase).toHaveBeenCalledTimes(1);
  });
});
