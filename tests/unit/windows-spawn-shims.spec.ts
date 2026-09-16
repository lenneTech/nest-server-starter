/**
 * Keeps the dev scripts able to start a package manager on Windows.
 *
 * WHY THIS EXISTS
 * `pnpm` and `npm` are not executables on Windows but shims, and Node has refused to run
 * .cmd/.bat files directly since 20.12 (the CVE-2024-27980 hardening). A bare
 * `spawn('pnpm', …)` dies there with `spawn pnpm ENOENT` (errno -4058) while working perfectly
 * on macOS and Linux — so the regression has no local symptom, which is what makes a guard
 * worth more than a convention.
 *
 * It bit for real on 2026-09-16: `scripts/run-spectaql.mjs` took down a freshly started server
 * in a generated project, because `config.env.ts` runs `pnpm run docs:bootstrap` through
 * `execAfterInit` and the unhandled 'error' event threw.
 *
 * WHAT IT CHECKS, AND WHAT IT CANNOT
 * This reads the script sources. It proves the shape of the call, not that the command runs —
 * a behavioural test would have to spawn a package manager per case, on a platform that has the
 * problem. The shape is the part that regresses, so that is what is pinned here.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SCRIPTS = join(process.cwd(), 'scripts');

/** `spawn('pnpm …')`, `execFileSync('npm', …)` and friends — the call, and its opening options. */
const PACKAGE_MANAGER_CALL =
  /\b(spawn|spawnSync|execFile|execFileSync|exec|execSync)\(\s*['"`][^'"`]*\b(pnpm|npm|npx)\b/g;

function callsWithoutShell(source: string): string[] {
  const offenders: string[] = [];
  for (const match of source.matchAll(PACKAGE_MANAGER_CALL)) {
    // The options object follows the command within the same call; 400 characters covers the
    // longest call in this tree by a wide margin.
    const window = source.slice(match.index ?? 0, (match.index ?? 0) + 400);
    if (!/shell:\s*true/.test(window)) {
      offenders.push(match[0]);
    }
  }
  return offenders;
}

const scriptFiles = readdirSync(SCRIPTS).filter((file) => file.endsWith('.mjs'));

describe('callsWithoutShell — the detector itself', () => {
  it('flags a bare package-manager spawn', () => {
    expect(callsWithoutShell(`spawn('pnpm', ['dlx', 'x'], { stdio: 'inherit' })`)).toHaveLength(1);
    expect(callsWithoutShell(`execFileSync('npm', ['pack'], { encoding: 'utf-8' })`)).toHaveLength(1);
  });

  it('accepts a call that goes through a shell, in either argument form', () => {
    expect(callsWithoutShell(`spawn('pnpm dlx x', { shell: true, stdio: 'inherit' })`)).toEqual([]);
    expect(callsWithoutShell(`spawnSync('npm', ['pack'], { encoding: 'utf-8', shell: true })`)).toEqual([]);
  });

  it('ignores commands that are not a package manager', () => {
    expect(callsWithoutShell(`execFileSync(process.execPath, ['-p', expression])`)).toEqual([]);
    expect(callsWithoutShell(`spawn('node', ['dist/src/main.js'])`)).toEqual([]);
  });
});

describe('scripts/ can start a package manager on Windows', () => {
  it('has scripts to check', () => {
    expect(scriptFiles.length).toBeGreaterThan(0);
  });

  it.each(scriptFiles)('%s starts every package manager through a shell', (file: string) => {
    expect(callsWithoutShell(readFileSync(join(SCRIPTS, file), 'utf-8'))).toEqual([]);
  });

  it('run-spectaql.mjs handles a failed start instead of throwing on an unhandled event', () => {
    const source = readFileSync(join(SCRIPTS, 'run-spectaql.mjs'), 'utf-8');
    expect(source).toMatch(/\.on\(\s*['"]error['"]/);
  });
});
