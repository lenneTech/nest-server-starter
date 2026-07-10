/**
 * Unit test for docker-entrypoint.sh — the API container entrypoint.
 *
 * The entrypoint runs DB migrations BEST-EFFORT and must NEVER let the migration step
 * crash-loop the container: in vendor mode there is no `node_modules/.bin/migrate`, and
 * TypeScript migrations need a transpiler that the production image prunes. Regression
 * guard for the "migrate: not found" / crash-loop bug that blocked the first deploy.
 *
 * The script exposes two test seams that default to the real container values:
 *   MIGRATE_BIN  path to the migrate CLI
 *   SERVER_CMD   command used to start the server (stubbed here with an echo marker)
 */
import { execFileSync } from 'node:child_process';
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const ENTRYPOINT = join(process.cwd(), 'docker-entrypoint.sh');
const SERVER_MARKER = '__SERVER_STARTED__';

/** Runs the entrypoint. Throws (via execFileSync) if it exits non-zero. */
function runEntrypoint(env: Record<string, string>): string {
  return execFileSync('sh', [ENTRYPOINT], {
    encoding: 'utf-8',
    env: { ...process.env, SERVER_CMD: `echo ${SERVER_MARKER}`, ...env },
  });
}

describe('docker-entrypoint.sh (best-effort migrations)', () => {
  it('starts the server when the migrate CLI is absent (vendor mode / fresh DB)', () => {
    const stdout = runEntrypoint({ MIGRATE_BIN: '/nonexistent/migrate' });
    expect(stdout).toContain('skipping migrations');
    expect(stdout).toContain('[entrypoint] Starting server...');
    expect(stdout).toContain(SERVER_MARKER);
  });

  it('starts the server when the migrate CLI exits non-zero (e.g. missing transpiler)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'entrypoint-'));
    const bin = join(dir, 'migrate');
    writeFileSync(bin, '#!/bin/sh\nexit 1\n');
    chmodSync(bin, 0o755);
    try {
      const stdout = runEntrypoint({ MIGRATE_BIN: bin });
      expect(stdout).toContain('WARNING: migration step failed');
      expect(stdout).toContain('[entrypoint] Starting server...');
      expect(stdout).toContain(SERVER_MARKER);
    } finally {
      rmSync(dir, { force: true, recursive: true });
    }
  });

  it('runs the migrate CLI and starts the server when migrations succeed', () => {
    const dir = mkdtempSync(join(tmpdir(), 'entrypoint-'));
    const bin = join(dir, 'migrate');
    // A migrate stub that succeeds and records that it ran.
    writeFileSync(bin, '#!/bin/sh\necho "__MIGRATE_RAN__"\nexit 0\n');
    chmodSync(bin, 0o755);
    try {
      const stdout = runEntrypoint({ MIGRATE_BIN: bin });
      expect(stdout).toContain('__MIGRATE_RAN__');
      expect(stdout).toContain('[entrypoint] Migrations applied.');
      expect(stdout).toContain(SERVER_MARKER);
    } finally {
      rmSync(dir, { force: true, recursive: true });
    }
  });
});
