/**
 * Unit test for docker-entrypoint.sh — the API container entrypoint.
 *
 * A MISSING migration step must never crash-loop the container. Regression guard for the
 * "migrate: not found" / crash-loop bug that blocked the first deploy, and for the silent
 * skip that made migrations never run at all (nothing bundled / CLI looked up in the wrong
 * layout).
 *
 * A migration that RAN AND FAILED aborts the start by default (DEV-2728): a failed schema
 * migration is otherwise indistinguishable from a good deploy. MIGRATIONS_ALLOW_FAILURE=true
 * (or the long form MIGRATE_FAILURE_POLICY=warn) opts out per deploy, and an unknown value in
 * either falls back to the STRICT default. A recorded migration whose file is gone stays a
 * warning — that is the migrate CLI's tolerance, which this script keeps by never passing
 * --strict. All of it is asserted, because the default decides whether a broken schema can
 * reach traffic and must never change by accident.
 *
 * The script exposes four test seams that default to the real container values:
 *   APP_DIST                compiled output directory
 *   MIGRATE_BIN             path to the npm-mode migrate CLI
 *   SERVER_CMD              command used to start the server (stubbed here with an echo marker)
 *   MIGRATE_FAILURE_POLICY  `abort` (default) or `warn`
 *   MIGRATIONS_ALLOW_FAILURE  `true` = short form of MIGRATE_FAILURE_POLICY=warn
 */
import { execFileSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const ENTRYPOINT = join(process.cwd(), 'docker-entrypoint.sh');
const SERVER_MARKER = '__SERVER_STARTED__';

/** Runs the entrypoint. Throws (via execFileSync) if it exits non-zero. */
function runEntrypoint(env: Record<string, string>): string {
  return execFileSync('sh', [ENTRYPOINT], {
    encoding: 'utf-8',
    // Both policy variables are PINNED empty, so a value in the invoking shell can never turn a
    // "default" case into a test of something else.
    env: {
      ...process.env,
      MIGRATE_FAILURE_POLICY: '',
      MIGRATIONS_ALLOW_FAILURE: '',
      SERVER_CMD: `echo ${SERVER_MARKER}`,
      ...env,
    },
  });
}

/** Runs the entrypoint where it must exit non-zero; returns the error carrying status + stdout. */
function runEntrypointExpectingFailure(env: Record<string, string>): { status?: number; stdout: string } {
  // execFileSync throws on a non-zero exit — that IS the assertion. Its stdout still carries
  // what the entrypoint printed before it gave up.
  try {
    runEntrypoint(env);
  } catch (e) {
    const error = e as { status?: number; stdout?: string };
    return { status: error.status, stdout: error.stdout ?? '' };
  }
  throw new Error('expected the entrypoint to exit non-zero, but it succeeded');
}

/** Writes an executable stub script. */
function writeStub(path: string, body: string): void {
  writeFileSync(path, body);
  chmodSync(path, 0o755);
}

describe('docker-entrypoint.sh (migrations before server start)', () => {
  let dir: string;
  /** A dist layout that contains one compiled migration. */
  let dist: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'entrypoint-'));
    dist = join(dir, 'dist');
    mkdirSync(join(dist, 'migrations'), { recursive: true });
    writeFileSync(join(dist, 'migrations', '1750000000000-noop.js'), 'exports.up = async () => {};\n');
  });

  afterEach(() => {
    rmSync(dir, { force: true, recursive: true });
  });

  it('skips migrations when none are bundled (fresh project, empty migrations/)', () => {
    const emptyDist = join(dir, 'empty-dist');
    mkdirSync(emptyDist, { recursive: true });

    const stdout = runEntrypoint({ APP_DIST: emptyDist, MIGRATE_BIN: '/nonexistent/migrate' });
    expect(stdout).toContain('no migrations bundled — skipping migrations');
    expect(stdout).toContain('[entrypoint] Starting server...');
    expect(stdout).toContain(SERVER_MARKER);
  });

  it('starts the server when the migrate CLI is absent in both layouts', () => {
    const stdout = runEntrypoint({ APP_DIST: dist, MIGRATE_BIN: '/nonexistent/migrate' });
    expect(stdout).toContain('migrate CLI not present in image — skipping migrations');
    expect(stdout).toContain(SERVER_MARKER);
  });

  it('refuses to start by DEFAULT when a migration ran and failed', () => {
    const bin = join(dir, 'migrate');
    writeStub(bin, '#!/bin/sh\nexit 1\n');

    const error = runEntrypointExpectingFailure({ APP_DIST: dist, MIGRATE_BIN: bin });
    expect(error.status).toBe(1);
    expect(error.stdout).toContain('refusing to start against a possibly half-applied schema');
    expect(error.stdout).toContain('MIGRATIONS_ALLOW_FAILURE=true');
    expect(error.stdout).not.toContain(SERVER_MARKER);
  });

  it('starts anyway after a failed migration when MIGRATIONS_ALLOW_FAILURE=true', () => {
    const bin = join(dir, 'migrate');
    writeStub(bin, '#!/bin/sh\nexit 1\n');

    const stdout = runEntrypoint({ APP_DIST: dist, MIGRATE_BIN: bin, MIGRATIONS_ALLOW_FAILURE: 'true' });
    expect(stdout).toContain('(on failure: warn)');
    expect(stdout).toContain('WARNING: migration step failed');
    expect(stdout).toContain(SERVER_MARKER);
  });

  it('starts anyway after a failed migration under the long form MIGRATE_FAILURE_POLICY=warn', () => {
    const bin = join(dir, 'migrate');
    writeStub(bin, '#!/bin/sh\nexit 1\n');

    const stdout = runEntrypoint({ APP_DIST: dist, MIGRATE_BIN: bin, MIGRATE_FAILURE_POLICY: 'warn' });
    expect(stdout).toContain('WARNING: migration step failed');
    expect(stdout).toContain(SERVER_MARKER);
  });

  it('lets the explicit long form win over MIGRATIONS_ALLOW_FAILURE', () => {
    const bin = join(dir, 'migrate');
    writeStub(bin, '#!/bin/sh\nexit 1\n');

    const error = runEntrypointExpectingFailure({
      APP_DIST: dist,
      MIGRATE_BIN: bin,
      MIGRATE_FAILURE_POLICY: 'abort',
      MIGRATIONS_ALLOW_FAILURE: 'true',
    });
    expect(error.status).toBe(1);
    expect(error.stdout).not.toContain(SERVER_MARKER);
  });

  it('falls back to abort on an unknown MIGRATIONS_ALLOW_FAILURE value, and says so up front', () => {
    const bin = join(dir, 'migrate');
    writeStub(bin, '#!/bin/sh\nexit 1\n');

    const error = runEntrypointExpectingFailure({ APP_DIST: dist, MIGRATE_BIN: bin, MIGRATIONS_ALLOW_FAILURE: 'yes' });
    expect(error.stdout).toContain("unknown MIGRATIONS_ALLOW_FAILURE 'yes' (expected 'true') — using 'abort'");
    expect(error.stdout).not.toContain(SERVER_MARKER);
  });

  it('refuses to start after a failed migration under MIGRATE_FAILURE_POLICY=abort', () => {
    const bin = join(dir, 'migrate');
    writeStub(bin, '#!/bin/sh\nexit 1\n');

    const error = runEntrypointExpectingFailure({ APP_DIST: dist, MIGRATE_BIN: bin, MIGRATE_FAILURE_POLICY: 'abort' });
    expect(error.status).toBe(1);
    expect(error.stdout).toContain('refusing to start against a possibly half-applied schema');
    // The point of the policy: the server must NOT have been reached.
    expect(error.stdout).not.toContain(SERVER_MARKER);
  });

  it('starts the server normally under abort when the migration succeeds', () => {
    const bin = join(dir, 'migrate');
    writeStub(bin, '#!/bin/sh\nexit 0\n');

    const stdout = runEntrypoint({ APP_DIST: dist, MIGRATE_BIN: bin, MIGRATE_FAILURE_POLICY: 'abort' });
    expect(stdout).toContain('[entrypoint] Migrations applied.');
    expect(stdout).toContain(SERVER_MARKER);
  });

  it('falls back to abort on an unknown policy value, and says so up front', () => {
    const bin = join(dir, 'migrate');
    writeStub(bin, '#!/bin/sh\nexit 1\n');

    // A typo'd `warn` must not be the thing that lets a failed migration reach traffic: it
    // falls back to the strict default, and the typo is reported before the migration runs,
    // so it is visible even when nothing fails.
    const error = runEntrypointExpectingFailure({ APP_DIST: dist, MIGRATE_BIN: bin, MIGRATE_FAILURE_POLICY: 'wran' });
    expect(error.stdout).toContain("unknown MIGRATE_FAILURE_POLICY 'wran' — using 'abort'");
    expect(error.stdout).not.toContain(SERVER_MARKER);
  });

  it('runs the npm-mode CLI with the store and migrations dir, then starts the server', () => {
    const bin = join(dir, 'migrate');
    writeStub(bin, '#!/bin/sh\necho "__MIGRATE_RAN__ $*"\nexit 0\n');

    const stdout = runEntrypoint({ APP_DIST: dist, MIGRATE_BIN: bin });
    expect(stdout).toContain('__MIGRATE_RAN__ up');
    // No --strict: a recorded migration whose file was pruned must stay a warning (the CLI's
    // default tolerance), never a refused start.
    expect(stdout).not.toContain('--strict');
    expect(stdout).toContain(`--migrations-dir ${join(dist, 'migrations')}`);
    expect(stdout).toContain(`--store ${join(dist, 'migrations-utils', 'migrate.js')}`);
    expect(stdout).toContain('[entrypoint] Migrations applied.');
    expect(stdout).toContain(SERVER_MARKER);
  });

  it('falls back to the vendored dist/bin/migrate.js when no npm CLI exists', () => {
    mkdirSync(join(dist, 'bin'), { recursive: true });
    // `node <file> up …` — the shim just echoes what it received.
    writeFileSync(
      join(dist, 'bin', 'migrate.js'),
      'console.log("__VENDOR_MIGRATE_RAN__", process.argv.slice(2).join(" "));\n',
    );

    const stdout = runEntrypoint({ APP_DIST: dist, MIGRATE_BIN: '/nonexistent/migrate' });
    expect(stdout).toContain('__VENDOR_MIGRATE_RAN__ up');
    expect(stdout).toContain('[entrypoint] Migrations applied.');
    expect(stdout).toContain(SERVER_MARKER);
  });

  it('prefers the npm-mode CLI over the vendored shim when both are present', () => {
    const bin = join(dir, 'migrate');
    writeStub(bin, '#!/bin/sh\necho "__NPM_MIGRATE_RAN__"\nexit 0\n');
    mkdirSync(join(dist, 'bin'), { recursive: true });
    writeFileSync(join(dist, 'bin', 'migrate.js'), 'console.log("__VENDOR_MIGRATE_RAN__");\n');

    const stdout = runEntrypoint({ APP_DIST: dist, MIGRATE_BIN: bin });
    expect(stdout).toContain('__NPM_MIGRATE_RAN__');
    expect(stdout).not.toContain('__VENDOR_MIGRATE_RAN__');
  });
});
