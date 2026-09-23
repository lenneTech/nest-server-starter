/**
 * The Node replacements for the POSIX-only package scripts (`test:cleanup`, `docs`,
 * `link:nest-server`).
 *
 * Nothing here opens a browser or runs pnpm: the platform decisions are pure functions and are
 * asked for all three platforms. The only real side effect is `cleanTestArtifacts`, and that runs
 * on a temporary directory this test creates itself.
 */
import { mkdirSync, mkdtempSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { cleanTestArtifacts, isTestArtifact } from '../../scripts/clean-test-artifacts.mjs';
import { nestServerPath } from '../../scripts/link-nest-server.mjs';
import { openPlan, resolveTarget } from '../../scripts/open.mjs';

describe('isTestArtifact — same semantics as the find command it replaces', () => {
  it('matches .txt and .bin, dotfiles included', () => {
    for (const name of ['x.txt', 'y.bin', '.dot.txt', '.gitkeep.txt']) {
      expect(isTestArtifact(name), name).toBe(true);
    }
  });

  it('is case-sensitive like find -name, unlike rimraf --glob on macOS and Windows', () => {
    expect(isTestArtifact('UP.TXT')).toBe(false);
    expect(isTestArtifact('y.BIN')).toBe(false);
  });

  it('keeps .gitkeep and everything else', () => {
    for (const name of ['.gitkeep', 'keep.ts', 'x.txt.bak', 'txt']) {
      expect(isTestArtifact(name), name).toBe(false);
    }
  });
});

describe('cleanTestArtifacts', () => {
  let dir = '';
  afterEach(() => rmSync(dir, { force: true, recursive: true }));

  const tree = (root: string): string[] =>
    readdirSync(root, { recursive: true, withFileTypes: true })
      .map((entry) => relative(root, join(entry.parentPath, entry.name)).split('\\').join('/'))
      .sort();

  it('deletes artifacts in nested and hidden directories, and nothing else', () => {
    dir = mkdtempSync(join(tmpdir(), 'clean-test-artifacts-'));
    for (const sub of ['a/b', '.hidden', 'c.txt.d']) mkdirSync(join(dir, sub), { recursive: true });
    for (const file of ['x.txt', 'a/y.bin', 'a/b/z.txt', '.hidden/h.txt', '.gitkeep', 'keep.ts', 'c.txt.d/inner.ts']) {
      writeFileSync(join(dir, file), '');
    }

    const deleted = cleanTestArtifacts(dir).map((path) => relative(dir, path).split('\\').join('/'));

    expect(deleted.sort()).toEqual(['.hidden/h.txt', 'a/b/z.txt', 'a/y.bin', 'x.txt']);
    expect(tree(dir)).toEqual(['.gitkeep', '.hidden', 'a', 'a/b', 'c.txt.d', 'c.txt.d/inner.ts', 'keep.ts']);
  });

  it.skipIf(process.platform === 'win32')('leaves symlinks alone, like find -type f', () => {
    dir = mkdtempSync(join(tmpdir(), 'clean-test-artifacts-'));
    writeFileSync(join(dir, 'keep.ts'), '');
    symlinkSync('keep.ts', join(dir, 'link.txt'));

    expect(cleanTestArtifacts(dir)).toEqual([]);
    expect(tree(dir)).toEqual(['keep.ts', 'link.txt']);
  });
});

describe('openPlan', () => {
  it('uses open on macOS', () => {
    expect(openPlan('http://x/', 'darwin')).toEqual({ args: ['http://x/'], command: 'open' });
  });

  it('uses the URL protocol handler on Windows, never the cmd.exe builtin start', () => {
    expect(openPlan('http://x/', 'win32')).toEqual({
      args: ['url.dll,FileProtocolHandler', 'http://x/'],
      command: 'rundll32',
    });
  });

  it('uses xdg-open everywhere else', () => {
    expect(openPlan('http://x/', 'linux')).toEqual({ args: ['http://x/'], command: 'xdg-open' });
  });
});

describe('resolveTarget', () => {
  it('passes URLs through untouched', () => {
    expect(resolveTarget('http://127.0.0.1:8080/', '/proj')).toBe('http://127.0.0.1:8080/');
  });

  it('makes a file path absolute, because the Windows handler does not resolve it', () => {
    expect(resolveTarget('./public/index.html', '/proj')).toBe(resolve('/proj', 'public/index.html'));
  });
});

describe('nestServerPath', () => {
  it('defaults to a sibling checkout, made absolute', () => {
    expect(nestServerPath({}, '/work/app')).toBe(resolve('/work/nest-server'));
  });

  it('treats an empty NEST_SERVER_PATH as unset, like ${VAR:-default}', () => {
    expect(nestServerPath({ NEST_SERVER_PATH: '' }, '/work/app')).toBe(resolve('/work/nest-server'));
  });

  it('resolves a relative NEST_SERVER_PATH against the project', () => {
    expect(nestServerPath({ NEST_SERVER_PATH: '../../fw/nest-server' }, '/work/app')).toBe(resolve('/fw/nest-server'));
  });
});
