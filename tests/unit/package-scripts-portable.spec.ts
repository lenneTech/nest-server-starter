/**
 * Keeps `package.json#scripts` runnable on Windows.
 *
 * WHY THIS EXISTS
 * npm and pnpm run scripts through the platform shell, which is `cmd.exe` on Windows. The POSIX
 * form `NODE_ENV=local nodemon` puts the assignment in command position there, and cmd.exe answers
 * with `Der Befehl "NODE_ENV" ist entweder falsch geschrieben oder konnte nicht gefunden werden.`
 * Verified on a Windows laptop on 2026-09-16: `pnpm run start:local` in a freshly generated project
 * died on exactly that, before a single line of the server ran. Every script in this file is copied
 * into every generated project, so one prefix breaks the first command a new developer types.
 *
 * `cross-env` sets the variable from Node instead of from the shell, which works on all three
 * platforms. The fix is only worth anything if it stays: a single `NODE_ENV=` slipping back into one
 * script is invisible on macOS and Linux, where it keeps working perfectly. That is what this test
 * is for — the breakage has no local symptom, so it needs a guard rather than a habit.
 *
 * THE DETECTOR IS TESTED, NOT JUST THE MANIFEST
 * The cases below that expect a finding are the ones that matter. A detector that reports nothing
 * also passes against a clean manifest, and then silently accepts the next regression. So the
 * samples cover the two shapes that actually get written by hand:
 *   - a chain, where only the first link carries `cross-env` and the second is still bare
 *   - several assignments after one `cross-env`, which is correct and must not be flagged
 *
 * THE OPTIONAL COPY STEPS
 * `copy:bin`, `copy:public` and `copy:templates` copy directories the starter does not ship, and cpy
 * exits 1 on a missing source (measured). Their fallback used to be `|| true`, which cmd.exe cannot
 * run — so `pnpm run build` died on Windows in every generated project. `|| exit 0` means the same
 * in sh and cmd.exe. The guard below keeps both halves: no `|| true` anywhere, and the fallback
 * itself stays, because deleting it breaks the build on every platform.
 *
 * WHAT THIS DOES NOT COVER
 * Still open and deliberately not asserted here: `find … -delete` in `test:cleanup` (named in
 * KNOWN_UNPORTABLE below), `open` in `docs` (macOS only), the shell parameter expansion
 * `${NEST_SERVER_PATH:-../nest-server}` in `link:nest-server` and the `bash scripts/…` steps.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// `process.cwd()` rather than an `import.meta.url` dance: tsconfig.json compiles to commonjs, and
// pnpm-pin.spec.ts resolves the root the same way.
const ROOT = process.cwd();
const scripts: Record<string, string> = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf-8')).scripts ?? {};

const scriptsMatching = (re: RegExp) =>
  Object.entries(scripts)
    .filter(([, command]) => re.test(command))
    .map(([name]) => name);

/** An assignment in command position: at the start, or after a `;`, `&&` or `|` separator. */
const ENV_ASSIGNMENT = /(?:^|[\s;&|])([A-Z_][A-Z0-9_]*=\S+)/g;

/**
 * `cross-env` may carry several assignments of its own (`cross-env A=1 B=2 cmd`), so an assignment
 * counts as covered when everything between it and a preceding `cross-env` is assignments too.
 */
const COVERED = /cross-env(?:\s+[A-Z_][A-Z0-9_]*=\S+)*\s+$/;

function bareEnvAssignments(command: string): string[] {
  const found: string[] = [];
  for (const match of command.matchAll(ENV_ASSIGNMENT)) {
    const start = (match.index ?? 0) + match[0].length - match[1].length;
    if (COVERED.test(command.slice(0, start))) {
      continue;
    }
    found.push(match[1]);
  }
  return found;
}

describe('bareEnvAssignments — the detector itself', () => {
  it('flags a bare prefix', () => {
    expect(bareEnvAssignments('NODE_ENV=local nodemon')).toEqual(['NODE_ENV=local']);
  });

  it('flags the second link of a chain when only the first is wrapped', () => {
    expect(bareEnvAssignments('cross-env NODE_ENV=test migrate up && NODE_ENV=test node dist/src/main.js')).toEqual([
      'NODE_ENV=test',
    ]);
  });

  it('accepts a wrapped prefix, including several assignments after one cross-env', () => {
    expect(bareEnvAssignments('cross-env NODE_ENV=e2e vitest run')).toEqual([]);
    expect(bareEnvAssignments('cross-env NODE_ENV=ci NSC__PORT=4010 node dist/src/main.js')).toEqual([]);
    expect(bareEnvAssignments('pnpm run migrate:up && cross-env NODE_ENV=local nodemon')).toEqual([]);
  });

  it('does not mistake a flag value or a lowercase name for an assignment', () => {
    expect(bareEnvAssignments('cpy ./package.json --rename=meta.json ./dist/')).toEqual([]);
    expect(bareEnvAssignments('tsc -p tsconfig.build.json')).toEqual([]);
  });
});

describe('package.json scripts run on Windows', () => {
  it('has scripts to check', () => {
    expect(Object.keys(scripts).length).toBeGreaterThan(0);
  });

  it('sets environment variables through cross-env, never through a shell prefix', () => {
    const offenders = Object.entries(scripts)
      .map(([name, command]) => [name, bareEnvAssignments(command)] as const)
      .filter(([, found]) => found.length > 0)
      .map(([name, found]) => `${name}: ${found.join(', ')}`);

    expect(offenders).toEqual([]);
  });

  it('does not redirect to /dev/null', () => {
    const bad = scriptsMatching(/\/dev\/null/);
    expect(bad, `/dev/null does not exist on Windows: ${bad.join(', ')}`).toEqual([]);
  });

  it('does not swallow failures with `|| true`', () => {
    const bad = scriptsMatching(/\|\|\s*true\b/);
    expect(bad, `cmd.exe has no "true" builtin — use \`|| exit 0\`: ${bad.join(', ')}`).toEqual([]);
  });

  it('keeps the fallback on the copy steps whose source is optional', () => {
    for (const name of ['copy:bin', 'copy:public', 'copy:templates']) {
      expect(scripts[name], `${name} must tolerate a missing source`).toMatch(/\|\|\s*exit 0$/);
    }
  });

  it('quotes arguments with double quotes, not single ones', () => {
    // `test:cleanup` is the one exception, and it is listed rather than silently skipped: it shells
    // out to POSIX `find`, which Windows does not have at all (`find.exe` there is a text search).
    // Quoting alone would not make it run, so it needs a rewrite in Node — separate work, tracked
    // by this list. A SECOND offender fails the suite, which is the point of naming the first.
    const KNOWN_UNPORTABLE = ['test:cleanup'];
    const bad = scriptsMatching(/'/).filter((name) => !KNOWN_UNPORTABLE.includes(name));
    expect(bad, `cmd.exe passes single quotes through literally: ${bad.join(', ')}`).toEqual([]);
    expect(
      KNOWN_UNPORTABLE.filter((name) => scripts[name] !== undefined && /'/.test(scripts[name])),
      'a script left this list — drop it from KNOWN_UNPORTABLE',
    ).toEqual(KNOWN_UNPORTABLE.filter((name) => scripts[name] !== undefined));
  });
});
