/**
 * Unit test for docker-entrypoint.sh — the API container entrypoint.
 *
 * A MISSING migration step must never crash-loop the container. Regression guard for the
 * "migrate: not found" / crash-loop bug that blocked the first deploy, and for the silent
 * skip that made migrations never run at all (nothing bundled / CLI looked up in the wrong
 * layout).
 *
 * A FAILED migration follows MIGRATE_FAILURE_POLICY: `warn` (the default kept by this
 * template — start the server anyway) or `abort` (refuse to start). Both paths are
 * asserted, because the default is the one that lets a broken schema reach traffic and
 * therefore must never change by accident.
 *
 * The script exposes four test seams that default to the real container values:
 *   APP_DIST                compiled output directory
 *   MIGRATE_BIN             path to the npm-mode migrate CLI
 *   SERVER_CMD              command used to start the server (stubbed here with an echo marker)
 *   MIGRATE_FAILURE_POLICY  `warn` (default) or `abort`
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
    env: { ...process.env, SERVER_CMD: `echo ${SERVER_MARKER}`, ...env },
  });
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

  it('starts the server when the migrate CLI exits non-zero (e.g. broken migration)', () => {
    const bin = join(dir, 'migrate');
    writeStub(bin, '#!/bin/sh\nexit 1\n');

    const stdout = runEntrypoint({ APP_DIST: dist, MIGRATE_BIN: bin });
    expect(stdout).toContain('WARNING: migration step failed');
    expect(stdout).toContain('[entrypoint] Starting server...');
    expect(stdout).toContain(SERVER_MARKER);
  });

  it('refuses to start after a failed migration under MIGRATE_FAILURE_POLICY=abort', () => {
    const bin = join(dir, 'migrate');
    writeStub(bin, '#!/bin/sh\nexit 1\n');

    // execFileSync throws on a non-zero exit — that IS the assertion. Its stdout still
    // carries what the entrypoint printed before it gave up.
    let error: { status?: number; stdout?: string } | undefined;
    try {
      runEntrypoint({ APP_DIST: dist, MIGRATE_BIN: bin, MIGRATE_FAILURE_POLICY: 'abort' });
    } catch (e) {
      error = e as { status?: number; stdout?: string };
    }

    expect(error?.status).toBe(1);
    expect(error?.stdout).toContain('refusing to start against a possibly half-applied schema');
    // The point of the policy: the server must NOT have been reached.
    expect(error?.stdout).not.toContain(SERVER_MARKER);
  });

  it('starts the server normally under abort when the migration succeeds', () => {
    const bin = join(dir, 'migrate');
    writeStub(bin, '#!/bin/sh\nexit 0\n');

    const stdout = runEntrypoint({ APP_DIST: dist, MIGRATE_BIN: bin, MIGRATE_FAILURE_POLICY: 'abort' });
    expect(stdout).toContain('[entrypoint] Migrations applied.');
    expect(stdout).toContain(SERVER_MARKER);
  });

  it('falls back to warn on an unknown policy value, and says so up front', () => {
    const bin = join(dir, 'migrate');
    writeStub(bin, '#!/bin/sh\nexit 1\n');

    // A typo'd `abort` must not silently behave like the strict setting the operator
    // asked for — nor fail the boot. It degrades to warn and reports the typo before
    // the migration runs, so it is visible even when nothing fails.
    const stdout = runEntrypoint({ APP_DIST: dist, MIGRATE_BIN: bin, MIGRATE_FAILURE_POLICY: 'abrot' });
    expect(stdout).toContain("unknown MIGRATE_FAILURE_POLICY 'abrot' — using 'warn'");
    expect(stdout).toContain('WARNING: migration step failed');
    expect(stdout).toContain(SERVER_MARKER);
  });

  it('runs the npm-mode CLI with the store and migrations dir, then starts the server', () => {
    const bin = join(dir, 'migrate');
    writeStub(bin, '#!/bin/sh\necho "__MIGRATE_RAN__ $*"\nexit 0\n');

    const stdout = runEntrypoint({ APP_DIST: dist, MIGRATE_BIN: bin });
    expect(stdout).toContain('__MIGRATE_RAN__ up');
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
