/**
 * Contract test for the pnpm pin — package.json#packageManager as single source of truth.
 *
 * Node >= 25 no longer ships corepack, so the Dockerfile must NOT rely on
 * `corepack enable`. Instead every pnpm-running stage provisions the exact pinned
 * version itself via the derive-line:
 *
 *   npm install -g "$(node -p "require('./package.json').packageManager.split('+')[0]")"
 *
 * This spec guards the whole chain:
 *   1. the pin is exact (x.y.z + sha512 hash — no range, corepack-compatible),
 *   2. engines.pnpm tracks the pin's major (soft gate, never a hard exact pin),
 *   3. the Dockerfile uses the derive-line in every pnpm-running stage and
 *      contains no `corepack enable`,
 *   4. FUNCTIONAL proof (CI / PIN_PROVISION_TEST only — needs network + ~10MB):
 *      the derive expression yields `pnpm@<pinned>` and `npm install -g` into a
 *      fresh prefix delivers exactly that pnpm version.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf-8'));
const dockerfile = readFileSync(join(ROOT, 'Dockerfile'), 'utf-8');

/** Exact version pin: pnpm@x.y.z+sha512.<hash> — no ^/~ range, hash present. */
const PIN_PATTERN = /^pnpm@(\d+)\.\d+\.\d+\+sha512\.[A-Za-z0-9]+$/;

/** The node -p expression the Dockerfile derive-line uses (strips the +sha512 suffix). */
const DERIVE_EXPRESSION = "require('./package.json').packageManager.split('+')[0]";

describe('pnpm pin (packageManager as single source of truth)', () => {
  it('pins an exact pnpm version with sha512 hash in package.json#packageManager', () => {
    expect(pkg.packageManager).toMatch(PIN_PATTERN);
  });

  it('keeps engines.pnpm on the pinned major as a range (never an exact pin)', () => {
    const major = PIN_PATTERN.exec(pkg.packageManager)?.[1];
    expect(pkg.engines.pnpm).toBe(`^${major}.0.0`);
  });

  it('Dockerfile provisions pnpm via the derive-line in every pnpm-running stage', () => {
    const deriveLines = dockerfile.split('\n').filter(line => line.includes(DERIVE_EXPRESSION));
    // Stage 1 (deps) and stage 2 (builder) run pnpm; the runner stage does not.
    expect(deriveLines).toHaveLength(2);
    for (const line of deriveLines) {
      expect(line).toContain('npm install -g');
    }
  });

  it('Dockerfile does not depend on corepack (removed from Node >= 25)', () => {
    expect(dockerfile).not.toContain('corepack enable');
  });

  // Functional proof of the actual provisioning chain. Guarded: downloads the pnpm
  // tarball from the registry (network + ~10MB) — must not slow local pre-push hooks.
  it.runIf(Boolean(process.env.CI || process.env.PIN_PROVISION_TEST))(
    'derive-line provisions exactly the pinned pnpm into a fresh npm prefix',
    () => {
      // 1. The derive expression yields the exact pin without the hash suffix.
      const derived = execFileSync(process.execPath, ['-p', DERIVE_EXPRESSION], { cwd: ROOT, encoding: 'utf-8' }).trim();
      expect(derived).toBe(pkg.packageManager.split('+')[0]);

      // 2. npm install -g into an isolated prefix delivers exactly that version.
      const prefix = mkdtempSync(join(tmpdir(), 'pnpm-pin-'));
      try {
        execFileSync('npm', ['install', '-g', '--prefix', prefix, derived], { encoding: 'utf-8', stdio: 'pipe' });
        const version = execFileSync(process.execPath, [join(prefix, 'bin', 'pnpm'), '--version'], { encoding: 'utf-8' }).trim();
        expect(`pnpm@${version}`).toBe(derived);
      } finally {
        rmSync(prefix, { force: true, recursive: true });
      }
    },
    180000,
  );
});
