/**
 * Unit test for docker-entrypoint.sh — the API container entrypoint.
 *
 * The entrypoint runs DB migrations BEST-EFFORT and must NEVER let the migration step
 * crash-loop the container. Regression guard for the "migrate: not found" / crash-loop
 * bug that blocked the first deploy, and for the silent skip that made migrations never
 * run at all (nothing bundled / CLI looked up in the wrong layout).
 *
 * The script exposes three test seams that default to the real container values:
 *   APP_DIST     compiled output directory
 *   MIGRATE_BIN  path to the npm-mode migrate CLI
 *   SERVER_CMD   command used to start the server (stubbed here with an echo marker)
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

describe('docker-entrypoint.sh (best-effort migrations)', () => {
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
    writeFileSync(join(dist, 'bin', 'migrate.js'), 'console.log("__VENDOR_MIGRATE_RAN__", process.argv.slice(2).join(" "));\n');

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
