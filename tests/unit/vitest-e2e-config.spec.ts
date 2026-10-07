import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The low-resource worker cap in vitest-e2e.config.ts.
 *
 * It used to be `poolOptions.forks.maxForks`, which Vitest 4 removed: the cap was announced on
 * stderr and silently discarded, so overlapping e2e runs kept starving each other. This file is
 * the only guard against that coming back. The assertions read the RESOLVED value, so a dead or
 * renamed option fails here. Do not count on the type-check instead: under this repo's
 * `module: commonjs` vitest's config type collapses to `any` (see the comment at `maxWorkers` in
 * vitest-e2e.config.ts), so an unknown option type-checks clean.
 *
 * The config is evaluated at import time from the environment, hence `vi.resetModules()` and a
 * fresh import per case. `LT_E2E_SLOT_DIR` points at an empty directory so that real e2e runs on
 * this machine cannot switch auto mode on and influence the result.
 */
describe('vitest-e2e.config low-resource cap', () => {
  const keys = ['CHECK_LOW_RESOURCE', 'CHECK_LOW_RESOURCE_FORKS', 'LT_E2E_SLOT_DIR'];
  const savedEnv: Record<string, string | undefined> = {};
  let dir: string;

  beforeEach(() => {
    for (const key of keys) {
      savedEnv[key] = process.env[key];
      delete process.env[key];
    }
    dir = mkdtempSync(join(os.tmpdir(), 'e2e-config-test-'));
    process.env.LT_E2E_SLOT_DIR = dir;
    // The config announces low-resource mode on stderr; keep the unit run quiet.
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    vi.resetModules();
  });

  afterEach(() => {
    for (const [key, value] of Object.entries(savedEnv)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
    rmSync(dir, { force: true, recursive: true });
    vi.restoreAllMocks();
  });

  async function loadTestConfig() {
    const { default: config } = await import('../../vitest-e2e.config');
    return config.test;
  }

  it('caps the workers via maxWorkers in low-resource mode', async () => {
    process.env.CHECK_LOW_RESOURCE = '1';
    process.env.CHECK_LOW_RESOURCE_FORKS = '3';

    const test = await loadTestConfig();

    expect(test?.maxWorkers).toBe(3);
    expect(test).not.toHaveProperty('poolOptions');
  });

  it("leaves maxWorkers at vitest's default when low-resource mode is off", async () => {
    process.env.CHECK_LOW_RESOURCE = '0';

    const test = await loadTestConfig();

    expect(test?.maxWorkers).toBeUndefined();
  });
});
