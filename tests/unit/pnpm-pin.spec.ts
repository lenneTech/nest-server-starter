/**
 * Contract test for the pnpm pin — package.json#packageManager as single source of truth.
 *
 * Node >= 25 no longer ships corepack, so the Dockerfile must NOT rely on
 * `corepack enable`. Instead every pnpm-running stage provisions the exact pinned
 * version itself via the derive-line:
 *
 *   npm install -g "$(node -p "require('./package.json').packageManager.split('+')[0]")"
 *
 * Layout-agnostic: the project runs in TWO layouts and the pin lives in a
 * different manifest in each —
 *   - standalone starter: this project's own package.json carries the pin;
 *   - lt fullstack monorepo: projects/api/package.json has NO packageManager
 *     (pnpm workspaces: only the workspace root pins) — the governing manifest
 *     is the workspace root's, found by walking up PAST manifest-less
 *     directories (`projects/` has no package.json, so `..` alone is wrong).
 * The Docker build context root equals the governing manifest's directory in
 * both layouts, so the derive-line's `./package.json` stays consistent.
 *
 * This spec guards the whole chain:
 *   1. the pin is exact (x.y.z + sha512 hash — no range, corepack-compatible),
 *   2. engines.pnpm tracks the pin's major (soft gate, never a hard exact pin)
 *      — checked on the local AND the governing manifest,
 *   3. the Dockerfile uses the derive-line in every pnpm-running stage and
 *      contains no `corepack enable`,
 *   4. FUNCTIONAL proof (CI / PIN_PROVISION_TEST only — needs network + ~10MB):
 *      the derive expression yields `pnpm@<pinned>` and `npm install -g` into a
 *      fresh prefix delivers exactly that pnpm version.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();

/**
 * Directory of the manifest that governs installs: the nearest package.json
 * (starting at ROOT, walking up and SKIPPING manifest-less directories like a
 * monorepo's `projects/`) that carries a `packageManager` field. Falls back to
 * ROOT so a missing pin still fails the pin assertions loudly instead of
 * throwing here.
 */
function findGoverningRoot(start: string): string {
  let dir = start;
  for (let i = 0; i < 7; i++) {
    const manifest = join(dir, 'package.json');
    if (existsSync(manifest)) {
      const parsed = JSON.parse(readFileSync(manifest, 'utf-8'));
      if (parsed.packageManager !== undefined) {
        return dir;
      }
    }
    const parent = dirname(dir);
    if (parent === dir) {
      return start;
    }
    dir = parent;
  }
  return start;
}

const GOVERNING_ROOT = findGoverningRoot(ROOT);
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf-8'));
const governingPkg = JSON.parse(readFileSync(join(GOVERNING_ROOT, 'package.json'), 'utf-8'));
const dockerfile = readFileSync(join(ROOT, 'Dockerfile'), 'utf-8');

/** Exact version pin: pnpm@x.y.z+sha512.<hash> — no ^/~ range, hash present. */
const PIN_PATTERN = /^pnpm@(\d+)\.\d+\.\d+\+sha512\.[A-Za-z0-9]+$/;

/** The node -p expression the Dockerfile derive-line uses (strips the +sha512 suffix). */
const DERIVE_EXPRESSION = "require('./package.json').packageManager.split('+')[0]";

describe('pnpm pin (packageManager as single source of truth)', () => {
  it('pins an exact pnpm version with sha512 hash in the governing package.json#packageManager', () => {
    expect(governingPkg.packageManager).toMatch(PIN_PATTERN);
  });

  it('keeps engines.pnpm on the pinned major as a range (never an exact pin)', () => {
    const major = PIN_PATTERN.exec(governingPkg.packageManager)?.[1];
    expect(major).toBeDefined();
    // Both the governing manifest and this project's own manifest gate the same major.
    expect(governingPkg.engines.pnpm).toBe(`^${major}.0.0`);
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
      // 1. The derive expression yields the exact pin without the hash suffix —
      //    run from the governing root, exactly like the Docker build context does.
      const derived = execFileSync(process.execPath, ['-p', DERIVE_EXPRESSION], {
        cwd: GOVERNING_ROOT,
        encoding: 'utf-8',
      }).trim();
      expect(derived).toBe(governingPkg.packageManager.split('+')[0]);

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
