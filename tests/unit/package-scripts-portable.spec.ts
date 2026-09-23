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
 * WHAT IS STILL OPEN
 * The shell function in `migrate:create`, named in a known list below. The former `find` in
 * `test:cleanup`, `open` in `docs`, `${…:-…}` in `link:nest-server` and the `bash scripts/…` steps
 * now run through Node scripts under `scripts/`; check-envs.sh was replaced by a unit test in
 * src/config.env.spec.ts.
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

/**
 * Programs a script may not call, by name. Two kinds, deliberately in one list:
 *   - absent under cmd.exe: `bash`, `cp`, `rm`, `touch`, …
 *   - PRESENT under cmd.exe, but a different program with the same name: `mkdir` (no `-p`; the `/` in
 *     `dist/types` is read as a switch), `find` (a text search), `sort`, `timeout` (waits, runs
 *     nothing), `rmdir`. A name-only rule catches these too, and more honestly than a "command plus
 *     forbidden switch" rule would: the switch set is open-ended, and none of them is needed in a
 *     script — `cpy` creates target directories, `rimraf` removes them, Node does the rest.
 * `echo` is not listed: unquoted it behaves the same, and quoted it is caught by the quote rule.
 */
const POSIX_ONLY = [
  '[',
  'awk',
  'bash',
  'cat',
  'chmod',
  'cp',
  'cut',
  'export',
  'find',
  'grep',
  'head',
  'kill',
  'ln',
  'ls',
  'lsof',
  'mkdir',
  'mv',
  'open',
  'pgrep',
  'pkill',
  'printf',
  'rm',
  'rmdir',
  'sed',
  'sh',
  'sleep',
  'sort',
  'source',
  'tail',
  'test',
  'timeout',
  'touch',
  'tr',
  'true',
  'wc',
  'which',
  'xargs',
  'xdg-open',
];

/**
 * POSIX shell syntax that no program name reveals: a function definition (`f() { …; }; f`) and the
 * positional parameters it takes (`"$1"`, `$@`). cmd.exe understands neither.
 */
const SHELL_SYNTAX = /\b[\w-]+\s*\(\)\s*\{|\$[0-9@*#]/;

/** The program in command position of every link in a `&&` / `||` / `;` / `|` chain. */
function commandNames(command: string): string[] {
  return command
    .split(/&&|\|\||;|\|/)
    .map((link) =>
      link
        .trim()
        .replace(/^cross-env\s+/, '')
        .replace(/^(?:[A-Z_][A-Z0-9_]*=\S+\s+)+/, ''),
    )
    .map((link) => link.split(/\s+/)[0])
    .filter(Boolean);
}

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

/** The programs of `command` that cmd.exe lacks or runs as something else. */
function unportablePrograms(command: string): string[] {
  return commandNames(command).filter((program) => POSIX_ONLY.includes(program));
}

/**
 * Asserts the offenders of one rule: nothing outside `known`, and every entry of `known` still
 * offending — a list that does not shrink with the fixes stops meaning anything.
 */
function expectOnlyKnown(found: string[], known: string[], rule: string): void {
  const bad = found.filter((name) => !known.includes(name));
  expect(bad, `${rule}: ${bad.join(', ')}`).toEqual([]);
  expect([...found].sort(), `a script left the known list of "${rule}" — drop it from the list`).toEqual(
    known.filter((name) => scripts[name] !== undefined).sort(),
  );
}

describe('commandNames — the detector itself', () => {
  it('reads the program of every link in a chain', () => {
    expect(commandNames('pnpm run docs:ci && open http://x/ && compodoc -s')).toEqual(['pnpm', 'open', 'compodoc']);
    expect(commandNames('cpy ./bin ./dist/ || exit 0')).toEqual(['cpy', 'exit']);
    expect(commandNames('a; b | c')).toEqual(['a', 'b', 'c']);
  });

  it('looks past cross-env and its assignments', () => {
    expect(commandNames('cross-env NODE_ENV=e2e A=1 find tests -delete')).toEqual(['find']);
  });

  it('does not mistake an argument for a program', () => {
    expect(commandNames('node scripts/open.mjs ./find ./bash')).toEqual(['node']);
  });
});

describe('unportablePrograms / SHELL_SYNTAX — the rules themselves', () => {
  // Samples from nest-server's unfixed build scripts, where this gap was found.
  it('flags mkdir -p on its own, not only because cp follows it', () => {
    expect(unportablePrograms('mkdir -p dist/types && cp src/types/*.d.ts dist/types/')).toEqual(['mkdir', 'cp']);
    expect(unportablePrograms('mkdir -p dist/types && cpy "src/types/*.d.ts" dist/types/')).toEqual(['mkdir']);
  });

  it('flags cmd.exe builtins that share a name but not a meaning', () => {
    expect(unportablePrograms('sort -u list.txt')).toEqual(['sort']);
    expect(unportablePrograms('timeout 5 node x.js')).toEqual(['timeout']);
  });

  it('accepts the portable replacements', () => {
    expect(unportablePrograms('rimraf dist && tsc -p tsconfig.build.json && cpy ./a ./dist/ || exit 0')).toEqual([]);
  });

  it('sees a shell function and its positional parameters', () => {
    expect(SHELL_SYNTAX.test('f() { migrate create "$1"; }; f')).toBe(true);
    // Each half on its own, so neither can be dropped behind the other's back.
    expect(SHELL_SYNTAX.test('clean() { rimraf dist; }; clean')).toBe(true);
    expect(SHELL_SYNTAX.test('node x.js "$@"')).toBe(true);
    expect(SHELL_SYNTAX.test('migrate create --template-file ./t.ts')).toBe(false);
    expect(SHELL_SYNTAX.test('cpy ./package.json --rename=meta.json ./dist/')).toBe(false);
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
    const bad = scriptsMatching(/'/);
    expect(bad, `cmd.exe passes single quotes through literally: ${bad.join(', ')}`).toEqual([]);
  });

  it('does not use shell parameter expansion', () => {
    const bad = scriptsMatching(/\$\{/);
    expect(bad, `cmd.exe passes \${…} through literally: ${bad.join(', ')}`).toEqual([]);
  });

  it('does not call a program that cmd.exe lacks or runs as something else', () => {
    // No exceptions left: check-server-start.sh became scripts/check-server-start.mjs and
    // check-envs.sh a unit test. A new offender needs a named entry here, or a fix.
    expectOnlyKnown(
      Object.entries(scripts)
        .filter(([, command]) => unportablePrograms(command).length > 0)
        .map(([name]) => name),
      [],
      'not available under cmd.exe',
    );
  });

  it('does not use POSIX shell functions or positional parameters', () => {
    // `migrate:create` is the known exception: the lt cli generates the same function, so its Node
    // replacement has to land in both places together.
    expectOnlyKnown(scriptsMatching(SHELL_SYNTAX), ['migrate:create'], 'POSIX shell syntax');
  });
});
